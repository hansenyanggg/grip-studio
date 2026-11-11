"""Deviation heatmap: where does the generator add or remove material?

Run:
  blender --background --python scripts/render_heatmap.py -- <stl_dir> <out_dir>

The generator keeps the source triangulation, so every triangle corner in a
generated STL corresponds to the same corner in the baseline STL. For each
corner we take the displacement from baseline and project it on the baseline
outward surface normal:  +mm = surface pushed out (thicker), -mm = pulled in.
Tangential motion (e.g. the axial stretch along the handle) is excluded, so
the map shows thickness change, not overall length change.

Writes heatmap.png, heatmap_stats.json and heatmap.blend.
"""
import bpy, json, math, sys
from pathlib import Path
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
STL_DIR, OUT = Path(argv[0]).resolve(), Path(argv[1]).resolve()
OUT.mkdir(parents=True, exist_ok=True)
CASES = ['female_P01', 'male_P50', 'male_P99']
index = {r['name']: r for r in json.loads((STL_DIR / 'gallery_index.json').read_text())}


def read_stl(path):
    data = path.read_bytes()
    n = int.from_bytes(data[80:84], 'little')
    rec = np.frombuffer(data, dtype=np.dtype([('n', '<f4', 3), ('v', '<f4', (3, 3)), ('a', '<u2')]),
                        count=n, offset=84)
    return rec['v'].astype(np.float64)          # (faces, 3 corners, xyz)


def weld(tri):
    """Unique vertices + per-corner index, welding exact duplicates."""
    flat = tri.reshape(-1, 3)
    uniq, inv = np.unique(np.round(flat, 5), axis=0, return_inverse=True)
    return uniq, inv.reshape(-1, 3)


base_tri = read_stl(STL_DIR / 'baseline_reference.stl')
bv, bf = weld(base_tri)
fn = np.cross(base_tri[:, 1] - base_tri[:, 0], base_tri[:, 2] - base_tri[:, 0])   # area-weighted
vn = np.zeros_like(bv)
for k in range(3):
    np.add.at(vn, bf[:, k], fn)
vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12
signed_vol = np.einsum('ij,ij->i', base_tri[:, 0], np.cross(base_tri[:, 1], base_tri[:, 2])).sum() / 6
if signed_vol < 0:          # source winding is reversed (negative volume): flip to outward
    vn = -vn
corner_n = vn[bf]            # (faces, 3, 3)
# End caps: normals along the long axis (source Y). Axial stretching moves them
# along their normal, which is a length change, not a thickness change, so
# they are excluded from the stats and the colour range (and drawn grey).
side_wall = np.abs(corner_n[..., 1]) < 0.85      # (faces, 3)

# Same pose as the gallery: stand up (X 90) and turn 3/4 (Z 30).
def rot(v):
    rx, rz = math.radians(90), math.radians(30)
    Rx = np.array([[1, 0, 0], [0, math.cos(rx), -math.sin(rx)], [0, math.sin(rx), math.cos(rx)]])
    Rz = np.array([[math.cos(rz), -math.sin(rz), 0], [math.sin(rz), math.cos(rz), 0], [0, 0, 1]])
    return v @ (Rz @ Rx).T

results, stats = [], {}
for name in CASES:
    tri = read_stl(STL_DIR / f'{name}.stl')
    assert tri.shape == base_tri.shape, 'triangulation must match the baseline'
    d = np.einsum('fck,fck->fc', tri - base_tri, corner_n)       # signed normal displacement
    v, f = weld(tri)
    val = np.zeros(len(v)); cnt = np.zeros(len(v)); wall = np.zeros(len(v))
    np.add.at(val, f.ravel(), d.ravel()); np.add.at(cnt, f.ravel(), 1)
    np.add.at(wall, f.ravel(), side_wall.ravel())
    val /= np.maximum(cnt, 1)
    is_wall = wall / np.maximum(cnt, 1) > 0.5
    results.append((name, rot(v), f, val, is_wall))
    dw = d[side_wall]
    total = np.linalg.norm(tri - base_tri, axis=2)
    stats[name] = dict(hand_length_mm=index[name]['hand_length'], hand_breadth_mm=index[name]['hand_breadth'],
                       wall_dev_min_mm=round(float(dw.min()), 2), wall_dev_max_mm=round(float(dw.max()), 2),
                       wall_dev_p05_mm=round(float(np.percentile(dw, 5)), 2),
                       wall_dev_p95_mm=round(float(np.percentile(dw, 95)), 2),
                       wall_dev_rms_mm=round(float(np.sqrt((dw ** 2).mean())), 2),
                       total_disp_max_mm=round(float(total.max()), 2))

# Symmetric colour range from the side walls' 98th percentile, rounded up to 0.5 mm.
R = max(np.percentile(np.abs(r[3][r[4]]), 98) for r in results)
R = math.ceil(R * 2) / 2
stats['_colour_range_mm'] = R
stats['_reference_hand_mm'] = [index['baseline_reference']['hand_length'], index['baseline_reference']['hand_breadth']]
(OUT / 'heatmap_stats.json').write_text(json.dumps(stats, indent=2))

# Diverging palette (sRGB): blue = thinner, near-white = unchanged, red = thicker.
STOPS = ['#2166ac', '#67a9cf', '#d1e5f0', '#f4f4f2', '#fddbc7', '#ef8a62', '#b2182b']
STOPS = np.array([[int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)] for h in STOPS])
def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def cmap(x):
    t = np.clip((np.asarray(x) / R + 1) / 2, 0, 1) * (len(STOPS) - 1)
    i = np.minimum(t.astype(int), len(STOPS) - 2); u = (t - i)[..., None]
    return srgb_to_linear(STOPS[i] * (1 - u) + STOPS[i + 1] * u)

# ---- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def vc_material():
    m = bpy.data.materials.new('deviation')
    m.use_nodes = True
    nt = m.node_tree
    attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'dev'
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.5
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    return m
MAT = vc_material()

def make_mesh(name, v, f, val, is_wall):
    me = bpy.data.meshes.new(name)
    me.from_pydata(v.tolist(), [], f.tolist())
    me.update()
    me.shade_smooth()
    col = me.color_attributes.new('dev', 'FLOAT_COLOR', 'POINT')
    rgb = cmap(val)
    rgb[~is_wall] = srgb_to_linear(np.array([0.62, 0.62, 0.62]))   # end caps: excluded
    col.data.foreach_set('color', np.column_stack([rgb, np.ones(len(rgb))]).ravel().astype(np.float32))
    me.materials.append(MAT)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob

def text(body, loc, size, color, align='CENTER'):
    bpy.ops.object.text_add(location=loc, rotation=(math.radians(90), 0, 0))
    t = bpy.context.object
    t.data.body = body; t.data.size = size; t.data.align_x = align
    m = bpy.data.materials.new('txt'); m.use_nodes = True
    nt = m.node_tree; nt.nodes.remove(nt.nodes['Principled BSDF'])
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*color, 1)
    nt.links.new(em.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    t.data.materials.append(m)
    return t

GAP, x, max_h = 70.0, 0.0, 0.0
for name, v, f, val, is_wall in results:
    lo, hi = v.min(0), v.max(0)
    w, h = hi[0] - lo[0], hi[2] - lo[2]
    v = v - [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]] + [x + w / 2, 0, 0]
    make_mesh(name, v, f, val, is_wall)
    sex, pct = name.split('_')
    s = stats[name]
    cx = x + w / 2
    text(f"{'Female' if sex == 'female' else 'Male'} {pct}", (cx, -60, -16), 10, (0.08, 0.08, 0.08))
    text(f"hand {s['hand_length_mm']:.0f} × {s['hand_breadth_mm']:.0f} mm", (cx, -60, -28), 6.5, (0.35, 0.35, 0.35))
    fmt = lambda q: f"{q:+.1f}".replace('-', '−')
    text(f"90% of surface {fmt(s['wall_dev_p05_mm'])} to {fmt(s['wall_dev_p95_mm'])} mm",
         (cx, -60, -38), 5.5, (0.35, 0.35, 0.35))
    x += w + GAP
    max_h = max(max_h, h)
total_w = x - GAP

# ---- colour bar (vertical, right of the grips)
bar_x, bar_w, bar_h = total_w + 45, 8.0, max_h * 0.8
bar_z0 = (max_h - bar_h) / 2
rows = 64
bv_ = [(bar_x + dx, -60, bar_z0 + bar_h * r / rows) for r in range(rows + 1) for dx in (0, bar_w)]
bf_ = [(2 * r, 2 * r + 1, 2 * r + 3, 2 * r + 2) for r in range(rows)]
me = bpy.data.meshes.new('bar'); me.from_pydata(bv_, [], bf_); me.update()
col = me.color_attributes.new('dev', 'FLOAT_COLOR', 'POINT')
vals = np.repeat(np.linspace(-R, R, rows + 1), 2)
col.data.foreach_set('color', np.column_stack([cmap(vals), np.ones(len(vals))]).ravel().astype(np.float32))
bm = bpy.data.materials.new('bar'); bm.use_nodes = True
nt = bm.node_tree; nt.nodes.remove(nt.nodes['Principled BSDF'])
em = nt.nodes.new('ShaderNodeEmission'); a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'dev'
nt.links.new(a.outputs['Color'], em.inputs['Color'])
nt.links.new(em.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
me.materials.append(bm)
scene.collection.objects.link(bpy.data.objects.new('bar', me))
for frac, label in ((0, f'−{R:g} mm'), (0.5, '0'), (1, f'+{R:g} mm')):
    text(label, (bar_x + bar_w + 4, -60, bar_z0 + bar_h * frac - 2.2), 6.5, (0.2, 0.2, 0.2), 'LEFT')
text('thicker', (bar_x + bar_w / 2, -60, bar_z0 + bar_h + 5), 6.5, (0.70, 0.09, 0.17))
text('thinner', (bar_x + bar_w / 2, -60, bar_z0 - 11), 6.5, (0.13, 0.40, 0.67))
ref = index['baseline_reference']
text(f"surface change vs. scanned\nreference hand {ref['hand_length']:.0f} × {ref['hand_breadth']:.0f} mm",
     (bar_x + bar_w / 2, -60, bar_z0 - 22), 4.5, (0.35, 0.35, 0.35))
right_edge = bar_x + bar_w + 30

# ---- lights, world, camera (same look as the gallery)
def area(loc, r, e, size):
    bpy.ops.object.light_add(type='AREA', location=loc)
    l = bpy.context.object; l.data.energy = e; l.data.size = size
    l.rotation_euler = tuple(math.radians(q) for q in r)
area((-150, -250, 300), (45, 0, -40), 2.2e6, 250)
area((total_w + 150, -300, 120), (70, 0, 35), 0.7e6, 400)
area((total_w / 2, 250, 250), (-50, 0, 0), 1.2e6, 500)

world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
wn, wl = world.node_tree.nodes, world.node_tree.links
bg = wn['Background']; bg.inputs['Strength'].default_value = 0.15
bg.inputs['Color'].default_value = (1, 1, 1, 1)
seen = wn.new('ShaderNodeBackground'); seen.inputs['Strength'].default_value = 1.0
seen.inputs['Color'].default_value = (1, 1, 1, 1)
lp = wn.new('ShaderNodeLightPath'); mix = wn.new('ShaderNodeMixShader')
wl.new(lp.outputs['Is Camera Ray'], mix.inputs[0]); wl.new(bg.outputs[0], mix.inputs[1])
wl.new(seen.outputs[0], mix.inputs[2]); wl.new(mix.outputs[0], wn['World Output'].inputs['Surface'])

z_lo, z_hi = -46, max_h + 16
width = right_edge + 15
bpy.ops.object.camera_add(location=(width / 2 - 20, -700, (z_lo + z_hi) / 2), rotation=(math.radians(90), 0, 0))
cam = bpy.context.object; scene.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = width + 30

scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'          # OptiX kernel fails to compile on this machine's driver
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.view_settings.view_transform = 'Standard'
scene.render.resolution_x = 3000
scene.render.resolution_y = int(3000 * (z_hi - z_lo) / cam.data.ortho_scale)
scene.render.filepath = str(OUT / 'heatmap.png')
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'heatmap.blend'))
print('HEATMAP DONE', json.dumps(stats))
