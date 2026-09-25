"""Mask torso/gait animation channels and preserve the source hitbox skeleton."""
import json
import struct
from pathlib import Path
from player_collision import GAITS, DEATHS, gait_bones, collision_data
FAMILIES = {'carbine','onehanded','dualpistols','rifle','mp5','shotgun','m249','grenade','c4','knife','ak47'}

def included(name):
    return name in GAITS | DEATHS or (name.startswith('ref_') and name.rsplit('_',1)[-1] in FAMILIES)

def prepare_player(path, model):
    path=Path(path)
    data=path.read_bytes()
    length=struct.unpack_from('<I',data,12)[0]
    gltf=json.loads(data[20:20+length])
    nodes=gltf['nodes']
    root=next(i for i,n in enumerate(nodes) if n.get('name','').split('.')[0] == path.stem)
    nodes[root]['name']='Body'
    paths={}
    def visit(index,parent=''):
        node=nodes[index]
        here=parent+'/'+node.get('name',str(index)) if parent else node.get('name',str(index))
        paths[node.get('name',str(index))]=here
        for child in node.get('children',[]): visit(child,here)
    for index in gltf['scenes'][gltf.get('scene',0)]['nodes']: visit(index)
    lower=set(gait_bones(model))
    lower_names={model.bones[i]['name'] for i in lower}
    clips=[]
    durations={}
    for clip in gltf.get('animations',[]):
        name=clip['name'].split(' ',1)[-1].split('.')[0]
        if not included(name): continue
        clip['name']=name
        if name in GAITS or name.startswith('ref_'):
            clip['channels']=[channel for channel in clip['channels']
                if (nodes[channel['target']['node']].get('name') in lower_names) == (name in GAITS)]
        clips.append(clip)
        durations[name]=max(gltf['accessors'][s['input']]['max'][0] for s in clip['samplers'])
        if name not in GAITS and not name.startswith('ref_aim_'):
            clips.append(dict(clip,name=name+'__repeat'))
    assert all(name in durations for name in ('idle1','walk','run','head','ref_aim_ak47')), [clip['name'] for clip in gltf.get('animations',[])]
    gltf['animations']=clips
    chunk=json.dumps(gltf,separators=(',',':')).encode()
    chunk+=b' '*(-len(chunk)%4)
    tail=data[20+length:]
    path.write_bytes(struct.pack('<4sIIII',b'glTF',2,20+len(chunk)+len(tail),len(chunk),0x4e4f534a)+chunk+tail)

    runtime={'hands':{side:paths['Bip01 '+side+' Hand'] for side in ['R','L']},
             'durations':durations, **collision_data(model)}
    (path.parent/(path.stem+'-runtime.json')).write_text(json.dumps(runtime,separators=(',',':'))+'\n')
    return {'hands':runtime['hands'],'durations':durations}
