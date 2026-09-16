"""Export original dropped guns in their source rest pose."""
from pathlib import Path
import bpy
import json
import hashlib
import math
from mathutils import Matrix, Vector
from goldsrc import Model
from convert_blender import local_matrix, texture_png, UNIT


def export_drop(id, source_directory, output):
    source = Path(source_directory)/('w_'+id+'.mdl')
    model = Model(source)
    previous = bpy.context.window.scene
    world = bpy.data.scenes.new('CS16 dropped '+id)
    bpy.context.window.scene = world
    output = Path(output)
    textures = Path(source_directory)/'drop-textures'/('w_'+id)
    textures.mkdir(parents=True,exist_ok=True)
    materials=[]
    for texture in model.textures:
        path=textures/(texture['name']+'.png')
        texture_png(texture,path)
        image=bpy.data.images.load(str(path),check_existing=False)
        image.pack()
        material=bpy.data.materials.new('w_'+id+' '+texture['name'])
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
    axis=Matrix.Rotation(-math.pi/2,4,'Z')
    inverse=axis
    points=[]
    triangles=0
    source_triangles=0
    for part in model.meshes:
        vertices=[inverse@matrices[bone]@(Vector(point)*UNIT) for point,bone in zip(part['points'],part['weights'])]
        source_triangles += len(part['faces'])
        faces=[]
        for face,mat in zip(part['faces'],part['materials']):
            a,b,c=(vertices[corner[0]] for corner in face)
            if len({corner[0] for corner in face})==3 and (b-a).cross(c-a).length_squared>1e-18:
                faces.append((face,mat))
        mesh=bpy.data.meshes.new(id+' dropped')
        mesh.from_pydata(vertices,[],[[c[0] for c in face] for face,_ in faces])
        mesh.update()
        mesh.validate(clean_customdata=False)
        face_map={tuple(c[0] for c in face):(face,mat) for face,mat in faces}
        for mat in materials:mesh.materials.append(mat)
        uv=mesh.uv_layers.new(name='Original GoldSrc UV')
        normals=[]
        for poly in mesh.polygons:
            face,mat=face_map[tuple(poly.vertices)]
            poly.material_index=mat
            poly.use_smooth=True
            texture=model.textures[mat]
            for loop,corner in zip(poly.loop_indices,face):
                vertex,normal,s,t=corner
                uv.data[loop].uv=(s/texture['width'],1-t/texture['height'])
                normals.append(((inverse@matrices[part['normal_weights'][normal]]).to_3x3()@Vector(part['normals'][normal])).normalized())
        mesh.normals_split_custom_set(normals)
        obj=bpy.data.objects.new(id+' dropped',mesh)
        world.collection.objects.link(obj)
        obj.select_set(True)
        points.extend(vertices)
        triangles+=len(mesh.polygons)
    path=output/(id+'-drop.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_animations=False,export_skins=False,export_cameras=False,export_lights=False)
    bounds={'min':[min(v[i] for v in points) for i in range(3)],'max':[max(v[i] for v in points) for i in range(3)]}
    result={'id':id,'sourceSha256':hashlib.sha256(model.data).hexdigest(),'triangles':triangles,'bytes':path.stat().st_size,'sourceTriangles':source_triangles,'skippedDegenerateTriangles':source_triangles-triangles,'anchor':'Original model origin','blenderBounds':bounds}
    (Path(source_directory)/('w_'+id+'.json')).write_text(json.dumps(result,indent=2)+'\n')
    bpy.context.window.scene=previous
    return result
