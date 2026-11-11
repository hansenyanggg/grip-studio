"""Render presentation MP4s of cross-section slices along the source grip.

Outputs (in exports/presentation/):
  cross_section_slice.mp4   side view with moving plane + live cross-section shape
  size_along_handle.mp4     width / height / area profile drawn as the plane moves
  combined.mp4              both side by side
  size_along_handle.png     static final plot
  section_profile.csv       raw numbers
"""
import sys
from pathlib import Path

import imageio_ffmpeg
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.animation import FFMpegWriter
from matplotlib.collections import PolyCollection
import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/smoothed_mergedhandle_V2.stl'
OUT = ROOT / 'exports/presentation'
plt.rcParams['animation.ffmpeg_path'] = imageio_ffmpeg.get_ffmpeg_exe()
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 12})

FPS, N = 30, 180          # 6 s sweep
HOLD = 45                 # extra frames held at the end
ACCENT, INK, MUTED = '#d9480f', '#1f2933', '#8a94a6'
C_W, C_H, C_A = '#1c7ed6', '#2f9e44', '#ae3ec9'


def local_mesh():
    mesh = trimesh.load(SOURCE, force='mesh')
    v = mesh.vertices
    origin = v.mean(axis=0)
    _, _, vh = np.linalg.svd(v - origin, full_matrices=False)
    basis = vh.T
    for j in range(2):  # same deterministic sign rule as grip.prepare()
        if basis[np.argmax(np.abs(basis[:, j])), j] < 0:
            basis[:, j] *= -1
    basis[:, 2] = np.cross(basis[:, 0], basis[:, 1])
    local = (v - origin) @ basis
    local[:, 0] -= local[:, 0].min()  # position along handle starts at 0
    return trimesh.Trimesh(local, mesh.faces, process=False)


def section(mesh, x):
    """Return list of (k,2) loops in the (y,z) plane and the metrics at position x."""
    s = mesh.section(plane_origin=[x, 0, 0], plane_normal=[1, 0, 0])
    if s is None:
        return [], None
    loops = [d[:, 1:] for d in s.discrete if len(d) > 2]
    if not loops:
        return [], None
    # Shoelace area per loop. The largest loop is the outer grip surface; smaller loops are
    # internal pockets or stray scan fragments, so metrics use the outer boundary only.
    areas = [abs(np.dot(l[:, 0], np.roll(l[:, 1], 1)) - np.dot(l[:, 1], np.roll(l[:, 0], 1))) / 2 for l in loops]
    loops = [loops[k] for k in np.argsort(areas)[::-1]]
    outer = loops[0]
    width = np.ptp(outer[:, 0])
    height = np.ptp(outer[:, 1])
    perim = np.linalg.norm(np.diff(outer, axis=0), axis=1).sum()
    return loops, dict(width=width, height=height, area=max(areas), perimeter=perim)


def shaded_side_view(mesh, ax):
    """Flat-shaded orthographic view looking along -z: x horizontal, y vertical."""
    tri = mesh.triangles
    n = mesh.face_normals
    light = np.array([0.35, 0.45, 0.82]); light /= np.linalg.norm(light)
    shade = np.abs(n @ light) * 0.6 + 0.35  # two-sided: scan normals are not consistently oriented
    order = np.argsort(tri[:, :, 2].mean(axis=1))  # painter's algorithm
    base = np.array([0.80, 0.83, 0.88])
    colors = np.clip(base[None] * shade[order, None], 0, 1)
    pc = PolyCollection(tri[order][:, :, :2], facecolors=colors, edgecolors='none', antialiased=False)
    ax.add_collection(pc)
    lo, hi = mesh.bounds
    ax.set_xlim(*XLIM)
    ax.set_ylim(lo[1] - 4, hi[1] + 4)
    ax.set_aspect('equal', adjustable='datalim')  # keep x range so it lines up with the plot


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    global XLIM
    mesh = local_mesh()
    length = mesh.extents[0]
    XLIM = (-4, length + 4)
    xs = np.linspace(0.02 * length, 0.98 * length, N)
    data = [section(mesh, x) for x in xs]
    keep = [i for i, (_, m) in enumerate(data) if m]
    xs = xs[keep]; data = [data[i] for i in keep]
    W = np.array([m['width'] for _, m in data])
    H = np.array([m['height'] for _, m in data])
    A = np.array([m['area'] for _, m in data])
    P = np.array([m['perimeter'] for _, m in data])
    np.savetxt(OUT / 'section_profile.csv', np.c_[xs, W, H, A, P], delimiter=',', fmt='%.3f',
               header='position_mm,width_mm,height_mm,area_mm2,perimeter_mm', comments='')

    all_pts = np.vstack([np.vstack(l) for l, _ in data])
    sec_lim = np.abs(all_pts).max() * 1.15
    frames = list(range(len(xs))) + [len(xs) - 1] * HOLD

    # ---------- Panel builders (shared between separate and combined videos) ----------
    def build_slice(fig, ax_side, ax_sec):
        shaded_side_view(mesh, ax_side)
        ax_side.set_title('Slice position along handle', color=INK, pad=10)
        ax_side.set_xlabel('Position along handle (mm)')
        ax_side.set_yticks([])
        for s in ('top', 'right', 'left'):
            ax_side.spines[s].set_visible(False)
        plane = ax_side.axvline(xs[0], color=ACCENT, lw=2.5)
        pos_txt = ax_side.text(0.99, 0.03, '', transform=ax_side.transAxes, color=ACCENT, fontweight='bold',
                               va='bottom', ha='right')

        ax_sec.set_aspect('equal')
        ax_sec.set_xlim(-sec_lim, sec_lim); ax_sec.set_ylim(-sec_lim, sec_lim)
        ax_sec.set_title('Cross-section', color=INK, pad=10)
        ax_sec.set_xlabel('Width direction (mm)'); ax_sec.set_ylabel('Height direction (mm)')
        ax_sec.grid(color='#e4e7eb', lw=0.8)
        fills = []
        info = ax_sec.text(0.03, 0.97, '', transform=ax_sec.transAxes, va='top', family='DejaVu Sans Mono',
                           fontsize=10.5, color=INK, bbox=dict(fc='white', ec='#d0d5dd', boxstyle='round,pad=0.4'))

        def update(i):
            plane.set_xdata([xs[i], xs[i]])
            pos_txt.set_text(f'x = {xs[i]:5.1f} mm  ({100 * xs[i] / length:3.0f}%)')
            for f in fills:
                f.remove()
            fills.clear()
            loops, m = data[i]
            outer = loops[0]
            fills.extend(ax_sec.fill(outer[:, 0], outer[:, 1], color=ACCENT, alpha=0.25, lw=0))
            fills.extend(ax_sec.plot(outer[:, 0], outer[:, 1], color=ACCENT, lw=2))
            for l in loops[1:]:
                fills.extend(ax_sec.plot(l[:, 0], l[:, 1], color=MUTED, lw=1, ls=':'))
            info.set_text(f"width  {m['width']:5.1f} mm\nheight {m['height']:5.1f} mm\n"
                          f"area   {m['area']:6.0f} mm²\nperim. {m['perimeter']:5.1f} mm")
        return update

    def build_plot(fig, ax, ax2):
        ax.set_xlim(*XLIM); ax.set_ylim(0, max(W.max(), H.max()) * 1.15)
        ax2.set_ylim(0, A.max() * 1.15)
        ax.set_xlabel('Position along handle (mm)')
        ax.set_ylabel('Width / height (mm)'); ax2.set_ylabel('Cross-section area (mm²)', color=C_A)
        ax2.tick_params(axis='y', colors=C_A)
        ax.set_title('Section size along the handle', color=INK, pad=10)
        ax.grid(color='#e4e7eb', lw=0.8)
        for a in (ax, ax2):
            a.spines['top'].set_visible(False)
        lw_, = ax.plot([], [], color=C_W, lw=2.5, label='Width')
        lh_, = ax.plot([], [], color=C_H, lw=2.5, label='Height')
        la_, = ax2.plot([], [], color=C_A, lw=2, ls='--', label='Area')
        marks = [ax.plot([], [], 'o', color=c, ms=7)[0] for c in (C_W, C_H)] + [ax2.plot([], [], 'o', color=C_A, ms=7)[0]]
        cursor = ax.axvline(xs[0], color=ACCENT, lw=1.5, alpha=0.7)
        ax.legend(handles=[lw_, lh_, la_], loc='lower center', ncol=3, frameon=False)

        def update(i):
            s = slice(0, i + 1)
            lw_.set_data(xs[s], W[s]); lh_.set_data(xs[s], H[s]); la_.set_data(xs[s], A[s])
            for mk, y in zip(marks, (W[i], H[i], A[i])):
                mk.set_data([xs[i]], [y])
            cursor.set_xdata([xs[i], xs[i]])
        return update

    def render(fig, updates, name):
        writer = FFMpegWriter(fps=FPS, bitrate=6000, codec='libx264', extra_args=['-pix_fmt', 'yuv420p'])
        with writer.saving(fig, str(OUT / name), dpi=100):
            for i in frames:
                for u in updates:
                    u(i)
                writer.grab_frame()
        plt.close(fig)
        print('wrote', OUT / name)

    # 1. slice animation
    fig = plt.figure(figsize=(16, 7.2), facecolor='white')
    gs = fig.add_gridspec(1, 2, width_ratios=[1.6, 1], wspace=0.15, left=0.04, right=0.97, top=0.9, bottom=0.12)
    render(fig, [build_slice(fig, fig.add_subplot(gs[0]), fig.add_subplot(gs[1]))], 'cross_section_slice.mp4')

    # 2. plot animation
    fig = plt.figure(figsize=(12.8, 7.2), facecolor='white')
    ax = fig.add_subplot(111); ax2 = ax.twinx()
    fig.subplots_adjust(left=0.08, right=0.9, top=0.9, bottom=0.12)
    render(fig, [build_plot(fig, ax, ax2)], 'size_along_handle.mp4')

    # 3. combined
    fig = plt.figure(figsize=(19.2, 10.8), facecolor='white')
    gs = fig.add_gridspec(2, 2, height_ratios=[1, 1], width_ratios=[1.6, 1], hspace=0.35, wspace=0.3,
                          left=0.05, right=0.94, top=0.94, bottom=0.07)
    u1 = build_slice(fig, fig.add_subplot(gs[0, 0]), fig.add_subplot(gs[:, 1]))
    axp = fig.add_subplot(gs[1, 0]); u2 = build_plot(fig, axp, axp.twinx())
    render(fig, [u1, u2], 'combined.mp4')

    # static PNG of the final plot
    fig = plt.figure(figsize=(12.8, 7.2), facecolor='white')
    ax = fig.add_subplot(111); ax2 = ax.twinx()
    fig.subplots_adjust(left=0.08, right=0.9, top=0.9, bottom=0.12)
    u = build_plot(fig, ax, ax2); u(len(xs) - 1)
    fig.savefig(OUT / 'size_along_handle.png', dpi=150)
    print('wrote', OUT / 'size_along_handle.png')


if __name__ == '__main__':
    sys.exit(main())
