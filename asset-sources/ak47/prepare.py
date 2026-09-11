import bpy
import bmesh
import math
from mathutils import Vector, Matrix
from pathlib import Path

ROOT = Path('/Users/boedo/Documents/Decentraland/cs-1.6')
SOURCE = ROOT / 'asset-sources/ak47/Ak47.obj'
OUT = ROOT / 'assets/scene/weapons'
OUT.mkdir(parents=True, exist_ok=True)
previous_scene = bpy.context.window.scene
scene = bpy.data.scenes.new('CS16 AK47 Export')
bpy.context.window.scene = scene
bpy.ops.wm.obj_import(filepath=str(SOURCE))
bpy.context.view_layer.update()
parts = [o for o in scene.objects if o.type == 'MESH']
parts.sort(key=lambda o: sum((o.matrix_world @ v.co).y for v in o.data.vertices) / len(o.data.vertices))

def material(name, color, metallic):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1)
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = 0.78
    return mat

steel = material('AK47 blued steel', (0.075, 0.085, 0.093), 0.25)
wood = material('AK47 walnut', (0.32, 0.115, 0.038), 0.0)
scale = 0.87 / 9.019622325897217
axis = Matrix.Rotation(math.pi, 4, 'Z')
part_names = ['stock_grip', 'receiver', 'magazine', 'handguard', 'barrel']

for obj, name in zip(parts, part_names):
    world = obj.matrix_world.copy()
    for vertex in obj.data.vertices:
        point = (world @ vertex.co - Vector((0, -1.6, 0.9))) * scale
        vertex.co = axis @ point
    obj.matrix_world = Matrix.Identity(4)
    obj.name = 'ak47_' + name
    obj.data.materials.clear()
    obj.data.materials.append(wood if name in ('stock_grip', 'handguard') else steel)
    group = obj.vertex_groups.new(name='magazine' if name == 'magazine' else 'weapon')
    group.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')

bpy.ops.object.select_all(action='DESELECT')
for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
mesh = bpy.context.object
mesh.name = 'ak47'
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bm = bmesh.from_edit_mesh(mesh.data)
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
bmesh.update_edit_mesh(mesh.data)
bpy.ops.uv.smart_project(island_margin=0.025)
bpy.ops.object.mode_set(mode='OBJECT')

armature = bpy.data.armatures.new('AK47 rig')
rig = bpy.data.objects.new('AK47', armature)
scene.collection.objects.link(rig)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
root = armature.edit_bones.new('weapon')
root.head = (0, 0, 0)
root.tail = (0, -0.1, 0)
mag = armature.edit_bones.new('magazine')
mag.head = (0, -0.17, 0)
mag.tail = (0, -0.17, -0.1)
mag.parent = root
bpy.ops.object.mode_set(mode='OBJECT')
mesh.parent = rig
modifier = mesh.modifiers.new('Weapon rig', 'ARMATURE')
modifier.object = rig
rig.animation_data_create()
scene.render.fps = 30

def clip(name, poses):
    action = bpy.data.actions.new(name)
    rig.animation_data.action = action
    for frame, location, rotation, magazine in poses:
        for bone_name in ('weapon', 'magazine'):
            bone = rig.pose.bones[bone_name]
            bone.rotation_mode = 'XYZ'
            bone.location = location if bone_name == 'weapon' else magazine
            bone.rotation_euler = rotation if bone_name == 'weapon' else (0, 0, 0)
            bone.keyframe_insert(data_path='location', frame=frame)
            bone.keyframe_insert(data_path='rotation_euler', frame=frame)
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, action)
    track.mute = True

zero = (0, 0, 0)
clip('idle', [(1, zero, zero, zero), (31, zero, zero, zero)])
clip('draw', [(1, (0, 0, -0.18), (0.6, 0, 0), zero), (12, zero, zero, zero)])
clip('fire', [(1, zero, zero, zero), (2, (0, 0.025, 0.005), (-0.035, 0, 0), zero), (4, zero, zero, zero)])
clip('reload', [
    (1, zero, zero, zero),
    (10, (0, 0, -0.04), (0.08, 0.12, -0.25), zero),
    (22, (0, 0, -0.04), (0.08, 0.12, -0.25), (0, 0, -0.22)),
    (40, (0, 0, -0.04), (0.08, 0.12, -0.25), (0, 0, -0.22)),
    (57, (0, 0, -0.04), (0.08, 0.12, -0.25), zero),
    (75, zero, zero, zero),
])
rig.animation_data.action = None
for bone in rig.pose.bones:
    bone.location = zero
    bone.rotation_euler = zero
scene.frame_set(1)
bpy.context.view_layer.update()
mesh.select_set(True)
rig.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'ak47.glb'), export_format='GLB', use_selection=True, use_active_scene=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_skins=True, export_extras=True)
bpy.data.libraries.write(str(ROOT / 'asset-sources/ak47/ak47.blend'), {scene}, fake_user=True)
mesh.data.calc_loop_triangles()
result = {'output':str(OUT / 'ak47.glb'), 'triangles':len(mesh.data.loop_triangles), 'parts':part_names, 'animations':['idle','draw','fire','reload'], 'materials':[m.name for m in mesh.data.materials], 'status':'geometry and animation draft; textures and hands still required'}
bpy.context.window.scene = previous_scene
