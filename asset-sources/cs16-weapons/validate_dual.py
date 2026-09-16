"""Run validate_dual through Blender MCP after export_world('elite', ...)."""
from pathlib import Path
import hashlib
import math
import bpy
from mathutils import Matrix, Vector
from goldsrc import Model
from convert_blender import local_matrix, UNIT


def validate_dual(source_directory, output):
    source = Path(source_directory) / 'p_elite.mdl'
    model = Model(source)
    matrices = []
    for i, bone in enumerate(model.bones):
        local = local_matrix(model.pose(model.sequences[0], 0, i))
        matrices.append(matrices[bone['parent']] @ local if bone['parent'] >= 0 else local)
    previous = bpy.context.window.scene
    results = {}
    covered = set()
    for side, name in [('R', 'elite'), ('L', 'elite-left')]:
        anchor = next(i for i, bone in enumerate(model.bones) if bone['name'] == 'Bip01 ' + side + ' Hand')
        transform = Matrix.Rotation(-math.pi / 2, 4, 'Z') @ matrices[anchor].inverted()
        expected = []
        for part_index, part in enumerate(model.meshes):
            for face_index, face in enumerate(part['faces']):
                ancestors = set()
                for corner in face:
                    bone = part['weights'][corner[0]]
                    while bone >= 0:
                        ancestors.add(bone)
                        bone = model.bones[bone]['parent']
                if anchor not in ancestors:
                    continue
                key = (part_index, face_index)
                assert key not in covered, 'A source face was duplicated across the two hands'
                covered.add(key)
                expected.append([transform @ matrices[part['weights'][corner[0]]] @
                                 (Vector(part['points'][corner[0]]) * UNIT) for corner in face])
        scene = bpy.data.scenes.new('CS16 verify ' + name)
        bpy.context.window.scene = scene
        path = Path(output) / (name + '-world.glb')
        bpy.ops.import_scene.gltf(filepath=str(path))
        bpy.context.view_layer.update()
        actual = []
        for obj in scene.objects:
            if obj.type != 'MESH':
                continue
            assert obj.scale == Vector((1, 1, 1)), 'No hidden model scale'
            obj.data.calc_loop_triangles()
            for face in obj.data.loop_triangles:
                actual.append([obj.matrix_world @ obj.data.vertices[i].co for i in face.vertices])
        assert len(actual) == len(expected) == 104
        unmatched = list(actual)
        error = 0
        for triangle in expected:
            choices = []
            for index, candidate in enumerate(unmatched):
                distance = min(max((triangle[i] - candidate[(i + shift) % 3]).length for i in range(3))
                               for shift in range(3))
                choices.append((distance, index))
            distance, index = min(choices)
            assert distance < 0.00001, 'Exported triangle differs from the original hand geometry'
            error = max(error, distance)
            unmatched.pop(index)
        points = [point for face in actual for point in face]
        bounds = {label: [operation(point[i] for point in points) for i in range(3)]
                  for label, operation in [('min', min), ('max', max)]}
        assert max(abs(value) for values in bounds.values() for value in values) < 0.3
        results[side] = {'triangles': len(actual), 'maxTriangleError': error, 'blenderWorldBounds': bounds,
                         'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    assert len(covered) == sum(len(part['faces']) for part in model.meshes) == 208
    bpy.context.window.scene = previous
    return {'sourceSha256': hashlib.sha256(model.data).hexdigest(), 'coveredSourceFaces': len(covered), 'hands': results}
