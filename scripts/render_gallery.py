"""Render the ANSUR hand-size gallery of generated grips.

Run:
  blender --background --python scripts/render_gallery.py -- <stl_dir> <out_dir>

Lines the 10 ANSUR II anchor grips up smallest -> largest hand, front view
(finger grooves to camera), orthographic so sizes compare honestly.
Writes gallery.png (white bg, labelled), gallery_transparent.png (no bg,
no labels) and gallery.blend for further tweaking.
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
STL_DIR, OUT = Path(argv[0]).resolve(), Path(argv[1]).resolve()
OUT.mkdir(parents=True, exist_ok=True)

index = {r['name']: r for r in json.loads((STL_DIR / 'gallery_index.json').read_text())}
names = sorted((n for n in index if n != 'baseline_reference' and 'error' not in index[n]),
               key=lambda n: (index[n]['hand_length'], index[n]['hand_breadth']))

# ---- clean scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))

SMALL, LARGE = (0.30, 0.62, 0.48, 1), (0.02, 0.17, 0.11, 1)   # light -> deep green (linear)
GAP = 22.0          # mm between grips
x = 0.0
grips = []
for i, name in enumerate(names):
    bpy.ops.wm.stl_import(filepath=str(STL_DIR / f'{name}.stl'))
    ob = bpy.context.selected_objects[0]
    ob.name = name
    # Long axis is source +Y -> stand it up (Z). Turned 3/4 so the finger
    # grooves face the camera while their profile still shows on the silhouette.
    ob.rotation_euler = (math.radians(90), 0, math.radians(30))
    bpy.context.view_layer.update()
    bpy.ops.object.transform_apply(rotation=True)
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    w = max(v.x for v in bb) - min(v.x for v in bb)
    h = max(v.z for v in bb) - min(v.z for v in bb)
    ob.location = (x + w / 2, 0, h / 2)
    x += w + GAP
    for p in ob.data.polygons:
        p.use_smooth = True

    t = i / max(1, len(names) - 1)
    mat = bpy.data.materials.new(f'mat_{name}')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = lerp(SMALL, LARGE, t)
    bsdf.inputs['Roughness'].default_value = 0.45
    ob.data.materials.append(mat)
    grips.append((ob, w, h))

total_w = x - GAP
max_h = max(h for _, _, h in grips)

# ---- labels (white render only)
def text(body, loc, size, color):
    bpy.ops.object.text_add(location=loc, rotation=(math.radians(90), 0, 0))
    t = bpy.context.object
    t.data.body = body
    t.data.size = size
    t.data.align_x = 'CENTER'
    # Emission (unlit) so the floor plane above the labels can't shade them.
    m = bpy.data.materials.new('txt')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes['Principled BSDF'])
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = color
    nt.links.new(em.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    t.data.materials.append(m)
    return t

labels = []
for ob, w, h in grips:
    r = index[ob.name]
    sex, pct = ob.name.split('_')
    tag = f"{'F' if sex == 'female' else 'M'} {pct}"
    labels.append(text(tag, (ob.location.x, -40, -14), 9, (0.08, 0.08, 0.08, 1)))
    labels.append(text(f"hand {r['hand_length']:.0f} × {r['hand_breadth']:.0f} mm", (ob.location.x, -40, -25), 6, (0.35, 0.35, 0.35, 1)))
    labels.append(text(f"{r['stats']['handle_length_mm']:.0f} mm grip", (ob.location.x, -40, -34), 6, (0.35, 0.35, 0.35, 1)))

# ---- floor (shadow catcher) + lights + camera
bpy.ops.mesh.primitive_plane_add(size=4000, location=(total_w / 2, 0, 0))
floor = bpy.context.object
floor.is_shadow_catcher = True

# Scene is in mm but Blender treats units as metres, so the lights are huge;
# energies are tuned for that scale. Key from upper-left at a raking angle
# to bring out the finger grooves; soft fill from the right; rim from behind.
def area(loc, rot, energy, size):
    bpy.ops.object.light_add(type='AREA', location=loc)
    l = bpy.context.object
    l.data.energy = energy; l.data.size = size
    l.rotation_euler = tuple(math.radians(a) for a in rot)
    return l
area((-150, -250, 300), (45, 0, -40), 2.2e6, 250)                 # key
area((total_w + 150, -300, 120), (70, 0, 35), 0.5e6, 400)         # fill
area((total_w / 2, 250, 250), (-50, 0, 0), 1.2e6, 500)            # rim

# World: dim ambient for lighting, but pure white where the camera sees it.
world = bpy.data.worlds.new('w'); scene.world = world
world.use_nodes = True
wn = world.node_tree.nodes; wl = world.node_tree.links
bg = wn['Background']
bg.inputs['Color'].default_value = (1, 1, 1, 1)
bg.inputs['Strength'].default_value = 0.12
seen = wn.new('ShaderNodeBackground')
seen.inputs['Color'].default_value = (1, 1, 1, 1)
seen.inputs['Strength'].default_value = 1.0
path = wn.new('ShaderNodeLightPath')
mix = wn.new('ShaderNodeMixShader')
wl.new(path.outputs['Is Camera Ray'], mix.inputs[0])
wl.new(bg.outputs[0], mix.inputs[1])
wl.new(seen.outputs[0], mix.inputs[2])
wl.new(mix.outputs[0], wn['World Output'].inputs['Surface'])

bpy.ops.object.camera_add(location=(total_w / 2, -600, max_h * 0.38), rotation=(math.radians(90), 0, 0))
cam = bpy.context.object; scene.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = total_w * 1.08

# ---- render settings
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.cycles.device = 'CPU'   # OptiX kernel fails to compile on this machine's driver
# Standard keeps a 1.0 white background pure white (AgX would grey it).
scene.view_settings.view_transform = 'Standard'
scene.render.resolution_x = 3600
scene.render.film_transparent = True

def render(path, with_labels, z_lo, z_hi):
    """Frame the vertical range z_lo..z_hi (mm); width is fixed by ortho_scale."""
    for t in labels:
        t.hide_render = not with_labels
    scene.render.resolution_y = int(3600 * (z_hi - z_lo) / cam.data.ortho_scale)
    cam.location.z = (z_lo + z_hi) / 2
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)

# Transparent, grips only
render(OUT / 'gallery_transparent.png', False, -10, max_h + 12)
# Labelled; composite onto white
scene.render.film_transparent = False
floor.is_shadow_catcher = False
fm = bpy.data.materials.new('floor'); fm.use_nodes = True
fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (1, 1, 1, 1)
fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1
floor.data.materials.append(fm)
render(OUT / 'gallery.png', True, -44, max_h + 14)

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'gallery.blend'))
print('GALLERY DONE', names)
