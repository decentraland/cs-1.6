"""Run import_weapon from the Blender MCP; export with Blender's glTF exporter."""

from pathlib import Path
import hashlib
import json
from repeat_clips import add_repeat_clips
import math
import struct
import zlib

import bpy
from mathutils import Euler, Matrix, Vector
from goldsrc import Model

UNIT = 0.025
AXIS = Matrix.Diagonal((-1, 1, 1, 1)) @ Matrix.Rotation(-math.pi / 2, 4, 'Z')


def local_matrix(values):
    return Matrix.Translation(Vector(values[:3]) * UNIT) @ Euler(values[3:], 'XYZ').to_matrix().to_4x4()


def texture_png(texture, path):
    width, height = texture['width'], texture['height']
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    rows = b''.join(b'\0' + texture['indices'][y * width:(y + 1) * width] for y in range(height))
    content = b'\x89PNG\r\n\x1a\n'
    content += chunk(b'IHDR', struct.pack('>2I5B', width, height, 8, 3, 0, 0, 0))
    content += chunk(b'PLTE', texture['palette'])
    if texture['flags'] & 64:
        content += chunk(b'tRNS', b'\xff' * 255 + b'\0')
    content += chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')
    path.write_bytes(content)


def import_weapon(source, output):
    source, output = Path(source), Path(output)
    output.mkdir(parents=True, exist_ok=True)
    model = Model(source)
    name = source.stem
    previous_scene = bpy.context.window.scene
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        raise RuntimeError('Finish the active edit operation before importing weapons')
    scene = bpy.data.scenes.new('CS16 original ' + name)
    bpy.context.window.scene = scene
    scene.render.fps = 30
    scene.unit_settings.system = 'METRIC'
    scene['source_sha256'] = hashlib.sha256(model.data).hexdigest()
    scene['goldsrc_unit_metres'] = UNIT
    textures_dir = output / 'textures' / name
    textures_dir.mkdir(parents=True, exist_ok=True)
    materials = []
    for i, texture in enumerate(model.textures):
        path = textures_dir / (texture['name'] + '.png')
        texture_png(texture, path)
        image = bpy.data.images.load(str(path), check_existing=False)
        image.pack()
        material = bpy.data.materials.new(name + ' ' + texture['name'])
        material.use_nodes = True
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Roughness'].default_value = 1
        shader.inputs['Metallic'].default_value = 0
        shader.inputs['Specular IOR Level'].default_value = 0
        node = material.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = image
        node.interpolation = 'Linear'
        material.node_tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
        if texture['flags'] & 64:
            material.node_tree.links.new(node.outputs['Alpha'], shader.inputs['Alpha'])
        materials.append(material)

    armature = bpy.data.armatures.new(name + ' skeleton')
    rig = bpy.data.objects.new(name, armature)
    scene.collection.objects.link(rig)
    rig.matrix_world = AXIS
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    local_rest, world_rest = [], []
    for bone in model.bones:
        local = local_matrix(bone['values'])
        world = world_rest[bone['parent']] @ local if bone['parent'] >= 0 else local
        local_rest.append(local)
        world_rest.append(world)
        edit = armature.edit_bones.new(bone['name'])
        edit.head, edit.tail = (0, 0, 0), (0, UNIT, 0)
        if bone['parent'] >= 0:
            edit.parent = armature.edit_bones[model.bones[bone['parent']]['name']]
        edit.matrix = world
        edit.length = UNIT
    bpy.ops.object.mode_set(mode='OBJECT')
    objects = []
    skipped_degenerate = 0
    for part in model.meshes:
        mesh = bpy.data.meshes.new(name + ' ' + part['name'])
        vertices = [world_rest[bone] @ (Vector(point) * UNIT) for point, bone in zip(part['points'], part['weights'])]
        # FAMAS has repeated-index strip triangles that crash Blender's custom-normal setter.
        faces = [(face, material) for face, material in zip(part['faces'], part['materials'])
                 if len({corner[0] for corner in face}) == 3]
        skipped_degenerate += len(part['faces']) - len(faces)
        mesh.from_pydata(vertices, [], [[corner[0] for corner in face] for face, _ in faces])
        mesh.update()
        obj = bpy.data.objects.new(mesh.name, mesh)
        scene.collection.objects.link(obj)
        obj.parent = rig
        for material in materials:
            mesh.materials.append(material)
        uv = mesh.uv_layers.new(name='Original GoldSrc UV')
        normals = []
        for poly, (face, material_id) in zip(mesh.polygons, faces):
            poly.material_index = material_id
            poly.use_smooth = True
            texture = model.textures[material_id]
            for loop, corner in zip(poly.loop_indices, face):
                vertex, normal, s, t = corner
                uv.data[loop].uv = (s / texture['width'], 1 - t / texture['height'])
                matrix = world_rest[part['normal_weights'][normal]].to_3x3()
                normals.append((matrix @ Vector(part['normals'][normal])).normalized())
        mesh.normals_split_custom_set(normals)
        for i, bone in enumerate(model.bones):
            indices = [j for j, weight in enumerate(part['weights']) if weight == i]
            if indices:
                obj.vertex_groups.new(name=bone['name']).add(indices, 1, 'REPLACE')
        modifier = obj.modifiers.new('Original rigid bone weights', 'ARMATURE')
        modifier.object = rig
        objects.append(obj)
    rig.animation_data_create()
    durations = {}
    actions = {}
    max_pose_error = 0
    for sequence in model.sequences:
        action = bpy.data.actions.new(name + ' ' + sequence['name'])
        rig.animation_data.action = action
        action.use_fake_user = True
        duration = max(1, sequence['frames'] - 1) / sequence['fps']
        durations[sequence['name']] = duration
        for index, bone in enumerate(model.bones):
            pose_bone = rig.pose.bones[bone['name']]
            pose_bone.rotation_mode = 'QUATERNION'
            inverse = local_rest[index].inverted()
            previous_rotation = None
            for frame in range(sequence['frames']):
                matrix = local_matrix(model.pose(sequence, frame, index))
                basis = inverse @ matrix
                location, rotation, _scale = basis.decompose()
                if previous_rotation is not None and rotation.dot(previous_rotation) < 0:
                    rotation.negate()
                previous_rotation = rotation.copy()
                pose_bone.location = location
                pose_bone.rotation_quaternion = rotation
                at = frame * scene.render.fps / sequence['fps']
                pose_bone.keyframe_insert(data_path='location', frame=at, group=bone['name'])
                pose_bone.keyframe_insert(data_path='rotation_quaternion', frame=at, group=bone['name'])
        slot = rig.animation_data.action_slot
        bag = action.layers[0].strips[0].channelbag(slot)
        for curve in bag.fcurves:
            for key in curve.keyframe_points:
                key.interpolation = 'LINEAR'
        track = rig.animation_data.nla_tracks.new()
        track.name = sequence['name']
        strip = track.strips.new(sequence['name'], 0, action)
        strip.action_slot = slot
        track.mute = True
        actions[sequence['name']] = (action, slot)

        for frame in sorted({0, sequence['frames'] // 2, sequence['frames'] - 1}):
            expected = []
            for i, bone in enumerate(model.bones):
                local = local_matrix(model.pose(sequence, frame, i))
                expected.append(expected[bone['parent']] @ local if bone['parent'] >= 0 else local)
            at = frame * scene.render.fps / sequence['fps']
            scene.frame_set(math.floor(at), subframe=at % 1)
            bpy.context.view_layer.update()
            for i, bone in enumerate(model.bones):
                actual = rig.pose.bones[bone['name']].matrix
                max_pose_error = max(max_pose_error, max(abs(actual[r][c] - expected[i][r][c]) for r in range(4) for c in range(4)))
    assert max_pose_error < 0.0001, max_pose_error
    idle = 'idle_unsil' if 'idle_unsil' in actions else model.sequences[0]['name']
    rig.animation_data.action, rig.animation_data.action_slot = actions[idle]
    scene.frame_set(0)
    bpy.context.view_layer.update()
    points = []
    for obj in objects:
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        points.extend(obj.matrix_world @ vertex.co for vertex in mesh.vertices)
        evaluated.to_mesh_clear()
    # Blender (X,Y,Z) becomes glTF (X,Z,-Y).
    points = [Vector((p.x, p.z, -p.y)) for p in points]
    bounds = {'min': [min(p[a] for p in points) for a in range(3)], 'max': [max(p[a] for p in points) for a in range(3)]}
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [rig, *objects]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    path = output / (name + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
        use_active_scene=True, export_cameras=False, export_lights=False, export_yup=True,
        export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=False,
        export_anim_single_armature=False, export_skins=True, export_extras=True, export_frame_range=False)
    add_repeat_clips(path)
    rig.animation_data.action, rig.animation_data.action_slot = actions[idle]
    scene.frame_set(0)
    bpy.context.view_layer.update()
    bpy.data.libraries.write(str(output / (name + '.blend')), {scene}, fake_user=True)
    report = {'name': name, 'sourceSha256': scene['source_sha256'], 'triangles': sum(len(p['faces']) for p in model.meshes) - skipped_degenerate,
              'skippedDegenerateTriangles': skipped_degenerate,
              'bones': len(model.bones), 'textures': len(model.textures), 'animations': durations,
              'idle': idle, 'idleBounds': bounds, 'unitMetres': UNIT, 'maxPoseMatrixError': max_pose_error,
              'bytes': path.stat().st_size, 'blender': bpy.app.version_string}
    (output / (name + '.json')).write_text(json.dumps(report, indent=2) + '\n')
    bpy.context.window.scene = previous_scene
    return report
