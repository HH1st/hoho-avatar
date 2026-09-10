"""Build the original Mochi character in Blender and export its animated GLB.
Run: blender --background --python scripts/blender/create_mochi.py
Coordinates: Z up, face toward -Y (glTF exports Y up, face toward +Z).
"""
import math
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'models' / 'mochi'
SOURCE = ROOT / 'assets' / 'blender'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, metallic=0, roughness=0.35, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Emission Color'].default_value = (*color, 1)
    shader.inputs['Emission Strength'].default_value = emission
    return mat

cream = material('Warm porcelain', (0.86, 0.79, 0.64), roughness=0.29)
face = material('Face / ivory', (0.98, 0.93, 0.80), roughness=0.4)
coral = material('Persimmon orange', (0.85, 0.18, 0.09), roughness=0.3)
dark = material('Ink / eyes and mouth', (0.019, 0.042, 0.048), roughness=0.3)
teal = material('Mint enamel', (0.12, 0.48, 0.40), metallic=0.18)
joint = material('Joint graphite', (0.10, 0.14, 0.14), metallic=0.45)
light = material('Soft signal light', (0.25, 0.85, 0.65), emission=0.8)
pink = material('Cheek blush', (0.98, 0.48, 0.29), roughness=0.55)

parts = []
def finish(obj, name, mat):
    obj.name = name
    obj.data.materials.append(mat)
    for poly in obj.data.polygons: poly.use_smooth = True
    parts.append(obj)
    return obj

def sphere(name, pos, scale, mat, segments=40, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=pos)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat)

def box(name, pos, scale, bevel, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = obj.modifiers.new('Soft manufactured edges', 'BEVEL')
    mod.width = bevel
    mod.segments = 6
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(obj, name, mat)

def rod(name, a, b, radius, mat):
    delta = Vector(b) - Vector(a)
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=delta.length, location=(Vector(a)+Vector(b))/2)
    obj = bpy.context.object
    obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    return finish(obj, name, mat)

# Rounded ceramic companion, assembled as editable Blender meshes.
sphere('Body', (0, 0, 1.14), (0.73, 0.50, 0.81), cream)
sphere('Belly panel', (0, -0.443, 1.12), (0.48, 0.10, 0.49), coral)
box('Chest badge', (0, -0.545, 1.29), (0.32, 0.045, 0.18), 0.065, cream)
for x in [-0.08, 0, 0.08]: sphere('Badge signal', (x, -0.576, 1.29), (0.022, 0.014, 0.022), teal, 20, 12)
rod('Neck', (0, 0, 1.68), (0, 0, 2.03), 0.31, joint)
box('Head shell', (0, 0, 2.49), (1.94, 1.32, 1.47), 0.49, cream)
box('Face surround', (0, -0.615, 2.47), (1.71, 0.20, 1.13), 0.36, coral)
box('Face plate', (0, -0.724, 2.48), (1.58, 0.17, 1.01), 0.33, face)
for side in [-1, 1]:
    sphere('Ear pod', (side*1.01, 0, 2.54), (0.19, 0.37, 0.42), coral)
    sphere('Ear cushion', (side*1.14, 0, 2.54), (0.09, 0.24, 0.26), teal)
    sphere('Shoulder', (side*0.67, 0, 1.38), (0.23, 0.26, 0.25), joint)
    arm = sphere('Arm', (side*0.84, -0.015, 1.07), (0.23, 0.27, 0.45), cream)
    arm.rotation_euler.y = side * -0.25
    sphere('Hand', (side*0.94, -0.055, 0.76), (0.24, 0.28, 0.24), teal)
    sphere('Leg', (side*0.34, 0, 0.47), (0.24, 0.28, 0.31), joint)
    sphere('Boot', (side*0.37, -0.13, 0.26), (0.32, 0.46, 0.23), coral)
    eye = sphere('Eye_L' if side < 0 else 'Eye_R', (side*0.34, -0.831, 2.64), (0.104, 0.057, 0.145), dark, 32, 20)
    eye.shape_key_add(name='Basis')
    key = eye.shape_key_add(name='blink')
    for vertex in key.data: vertex.co.z *= 0.08
    sphere('Cheek', (side*0.54, -0.817, 2.38), (0.106, 0.022, 0.06), pink, 24, 16)

# A recessed-looking mouth whose opening changes through glTF morph targets.
mouth = sphere('Mouth', (0, -0.835, 2.31), (0.16, 0.032, 0.025), dark, 48, 24)
mouth.shape_key_add(name='Basis')
for name, width, height in [('mouth_small', 0.19, 0.095), ('mouth_large', 0.235, 0.195), ('mouth_wide', 0.31, 0.095), ('mouth_round', 0.13, 0.17)]:
    key = mouth.shape_key_add(name=name)
    for vertex in key.data:
        vertex.co.x *= width / 0.16
        vertex.co.z *= height / 0.025
rod('Antenna stem', (0, 0.03, 3.17), (0.12, 0.03, 3.54), 0.045, joint)
sphere('Antenna light', (0.12, 0.03, 3.57), (0.135, 0.135, 0.135), light)
for x in [-0.24, 0, 0.24]:
    box('Back vent', (x, 0.665, 2.47), (0.10, 0.025, 0.45), 0.045, joint)

root = bpy.data.objects.new('Mochi', None)
bpy.context.collection.objects.link(root)
for obj in parts: obj.parent = root
root['author'] = 'Hoho Avatar / original Blender model'
root['license'] = 'MIT'
root['mouth_targets'] = 'mouth_small,mouth_large,mouth_wide,mouth_round'

bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for obj in parts: obj.select_set(True)
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(filepath=str(OUT / 'mochi.glb'), export_format='GLB', use_selection=True, export_yup=True, export_morph=True, export_animations=False)

# Save a useful studio scene for further hand editing in Blender.
bpy.ops.mesh.primitive_plane_add(size=200)
floor = bpy.context.object
floor.name = 'Studio ground (not exported)'
floor.data.materials.append(material('Studio sand', (0.37, 0.43, 0.37), roughness=0.8))
def aim(obj, target): obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z', 'Y').to_euler()
for name, loc, power, size in [('Key', (4,-5,7), 650, 5), ('Fill', (-4,-2,4), 450, 4), ('Rim', (2,4,5), 800, 3)]:
    bpy.ops.object.light_add(type='AREA', location=loc)
    lamp = bpy.context.object
    lamp.name = name
    lamp.data.energy = power
    lamp.data.shape = 'DISK'
    lamp.data.size = size
    aim(lamp, (0,0,1.8))
bpy.ops.object.camera_add(location=(5,-10,4.3))
camera = bpy.context.object
aim(camera, (0,0,1.8))
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 4.7
scene = bpy.context.scene
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.render.resolution_x = 900
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.world.color = (0.3,0.3,0.3)
scene.view_settings.view_transform = 'AgX'
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'mochi.blend'))
scene.render.filepath = str(ROOT / 'tmp' / 'mochi-blender.png')
bpy.ops.render.render(write_still=True)
print('Exported Mochi: .blend source + GLB with mouth and blink shape keys')
