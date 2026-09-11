import bpy
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
previous = bpy.context.window.scene
scene = bpy.data.scenes.new('Dust2 collision export')
try:
    bpy.context.window.scene = scene
    bpy.ops.import_scene.gltf(filepath=str(root / 'assets/scene/de_dust2_-_cs_map.glb'))
    triangles = []
    for obj in scene.objects:
        if obj.type != 'MESH':
            continue
        points = []
        for vertex in obj.data.vertices:
            point = obj.matrix_world @ vertex.co
            # Bevy rotates GLTF roots by pi; DCL's Z conversion cancels the Z flip.
            points.append([round(-point.x * 2 + 63.5575, 4), round(point.z * 2 - 2005.974, 4), round(-point.y * 2 - 2351.5916, 4)])
        obj.data.calc_loop_triangles()
        triangles.extend([axis for index in triangle.vertices for axis in points[index]] for triangle in obj.data.loop_triangles)
    output = 'export const MAP_TRIANGLES: readonly (readonly number[])[] = ' + json.dumps(triangles, separators=(',', ':')) + '\n'
    (root / 'src/map-collision.ts').write_text(output)
finally:
    bpy.context.window.scene = previous
