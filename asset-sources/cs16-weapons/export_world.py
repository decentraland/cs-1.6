"""Export original third-person guns relative to the original hand anchor."""
from pathlib import Path
import bpy
import json
import hashlib
import math
from mathutils import Matrix, Vector
from goldsrc import Model
from convert_blender import local_matrix, texture_png, UNIT


def export_world(id, source_directory, output, hand=None):
    if id == 'elite' and hand is None:
        return {side: export_world(id, source_directory, output, side) for side in ['R', 'L']}
    hand = hand or 'R'
    assert hand == 'R' or (id == 'elite' and hand == 'L')
    name = id if hand == 'R' else id + '-left'
    source = Path(source_directory)/('p_'+id+'.mdl')
    model = Model(source)
    previous = bpy.context.window.scene
    world = bpy.data.scenes.new('CS16 held '+name)
    bpy.context.window.scene = world
    output = Path(output)
    textures = Path(source_directory)/'world-textures'/('p_'+id)
    textures.mkdir(parents=True,exist_ok=True)
    materials=[]
    for texture in model.textures:
        path=textures/(texture['name']+'.png')
        texture_png(texture,path)
        image=bpy.data.images.load(str(path),check_existing=False)
        image.pack()
        material=bpy.data.materials.new('p_'+id+' '+texture['name'])
        material.use_nodes=True
        shader=material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Roughness'].default_value=1
        shader.inputs['Metallic'].default_value=0
        shader.inputs['Specular IOR Level'].default_value=0
        node=material.node_tree.nodes.new('ShaderNodeTexImage')
        node.image=image
        material.node_tree.links.new(node.outputs['Color'],shader.inputs['Base Color'])
        materials.append(material)
    matrices=[]
    for i,bone in enumerate(model.bones):
        pose=local_matrix(model.pose(model.sequences[0],0,i))
        matrices.append(matrices[bone['parent']]@pose if bone['parent']>=0 else pose)
    anchor_name = 'Bip01 ' + hand + ' Hand'
    anchor=next(i for i,b in enumerate(model.bones) if b['name']==anchor_name)
    axis=Matrix.Rotation(-math.pi/2,4,'Z')
    inverse=axis@matrices[anchor].inverted()
    def belongs(bone):
        while bone >= 0:
            if bone == anchor: return True
            bone = model.bones[bone]['parent']
        return False
    points=[]
    triangles=0
    source_triangles=0
    for part in model.meshes:
        faces=[]
        for face,mat in zip(part['faces'],part['materials']):
            selected=[belongs(part['weights'][c[0]]) for c in face]
            if id == 'elite':
                assert all(selected) or not any(selected), 'A face crosses hand anchors'
                if not all(selected): continue
            source_triangles+=1
            if len({c[0] for c in face})==3: faces.append((face,mat))
        used=sorted({c[0] for face,_ in faces for c in face})
        if not used: continue
        remap={vertex:index for index,vertex in enumerate(used)}
        vertices=[inverse@matrices[part['weights'][vertex]]@(Vector(part['points'][vertex])*UNIT) for vertex in used]
        mesh=bpy.data.meshes.new(name+' held')
        mesh.from_pydata(vertices,[],[[remap[c[0]] for c in face] for face,_ in faces])
        mesh.update()
        for mat in materials:mesh.materials.append(mat)
        uv=mesh.uv_layers.new(name='Original GoldSrc UV')
        normals=[]
        for poly,(face,mat) in zip(mesh.polygons,faces):
            poly.material_index=mat
            poly.use_smooth=True
            texture=model.textures[mat]
            for loop,corner in zip(poly.loop_indices,face):
                vertex,normal,s,t=corner
                uv.data[loop].uv=(s/texture['width'],1-t/texture['height'])
                normals.append(((inverse@matrices[part['normal_weights'][normal]]).to_3x3()@Vector(part['normals'][normal])).normalized())
        mesh.normals_split_custom_set(normals)
        obj=bpy.data.objects.new(name+' held',mesh)
        world.collection.objects.link(obj)
        obj.select_set(True)
        points.extend(vertices)
        triangles+=len(mesh.polygons)
    path=output/(name+'-world.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=False,export_skins=False,export_cameras=False,export_lights=False)
    bounds={'min':[min(v[i] for v in points) for i in range(3)],'max':[max(v[i] for v in points) for i in range(3)]}
    result={'id':id,'sourceSha256':hashlib.sha256(model.data).hexdigest(),'triangles':triangles,'bytes':path.stat().st_size,'sourceTriangles':source_triangles,'skippedDegenerateTriangles':source_triangles-triangles,'anchor':anchor_name,'blenderBounds':bounds}
    (Path(source_directory)/('p_'+name+'.json')).write_text(json.dumps(result,indent=2)+'\n')
    bpy.context.window.scene=previous
    return result
