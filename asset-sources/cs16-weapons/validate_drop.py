"""Validate a rest-pose ground model through the connected Blender MCP."""
from pathlib import Path
import hashlib
import math
import bpy
from mathutils import Matrix, Vector
from goldsrc import Model
from convert_blender import local_matrix, UNIT


def validate_drop(name, source_directory, output):
    source = Path(source_directory) / ('w_' + name + '.mdl')
    model = Model(source)
    matrices = []
    for i, bone in enumerate(model.bones):
        local = local_matrix(model.pose(model.sequences[0], 0, i))
        matrices.append(matrices[bone['parent']] @ local if bone['parent'] >= 0 else local)
    axis = Matrix.Rotation(-math.pi / 2, 4, 'Z')
    expected = []
    for part in model.meshes:
        for face in part['faces']:
            triangle = [axis @ matrices[part['weights'][corner[0]]] @
                        (Vector(part['points'][corner[0]]) * UNIT) for corner in face]
            if (triangle[1]-triangle[0]).cross(triangle[2]-triangle[0]).length_squared > 1e-18:
                expected.append(triangle)
    previous = bpy.context.window.scene
    scene = bpy.data.scenes.new('CS16 validate dropped ' + name)
    try:
        bpy.context.window.scene = scene
        path = Path(output) / (name + '-drop.glb')
        bpy.ops.import_scene.gltf(filepath=str(path))
        bpy.context.view_layer.update()
        actual = []
        for obj in scene.objects:
            assert obj.type == 'MESH', 'Only ground model meshes may be exported'
            obj.data.calc_loop_triangles()
            for face in obj.data.loop_triangles:
                actual.append([obj.matrix_world @ obj.data.vertices[i].co for i in face.vertices])
        assert len(actual) == len(expected)
        remaining = list(actual)
        error = 0
        for triangle in expected:
            choices = [(min(max((triangle[i] - candidate[(i + shift) % 3]).length for i in range(3))
                            for shift in range(3)), index) for index, candidate in enumerate(remaining)]
            distance, index = min(choices)
            assert distance < 0.00001, 'Original triangle geometry or winding changed'
            error = max(error, distance)
            remaining.pop(index)
        points = [point for face in actual for point in face]
        bounds = {label: [operation(point[i] for point in points) for i in range(3)]
                  for label, operation in [('min', min), ('max', max)]}
        return {'blenderVersion': bpy.app.version_string, 'triangles': len(actual),
                'maxTriangleError': error, 'blenderWorldBounds': bounds,
                'sourceSha256': hashlib.sha256(model.data).hexdigest(),
                'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
    finally:
        bpy.context.window.scene = previous
