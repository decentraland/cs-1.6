"""Mask torso/gait animation channels and preserve the source hitbox skeleton."""
import json
import struct
from pathlib import Path
from mathutils import Euler

GAITS = {'idle1', 'walk', 'run', 'crouch_idle', 'crouchrun', 'jump'}
DEATHS = {'death1','death2','death3','head','gutshot','left','back','right','forward','crouch_die'}
FAMILIES = {'carbine','onehanded','dualpistols','rifle','mp5','shotgun','m249','grenade','c4','knife','ak47'}

def included(name):
    return name in GAITS | DEATHS or (name.startswith('ref_') and name.rsplit('_',1)[-1] in FAMILIES)

def gait_bones(model):
    selected=[]
    copy=True
    for i,bone in enumerate(model.bones):
        if bone['name']=='Bip01 Spine': copy=False
        elif bone['parent'] >= 0 and model.bones[bone['parent']]['name']=='Bip01 Pelvis': copy=True
        if copy: selected.append(i)
    return selected

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

    count,offset=model.unpack('2i',156)
    boxes=[]
    for i in range(count):
        bone,group,*bounds=model.unpack('2i6f',offset+i*32)
        if group not in range(1,8): continue
        boxes.append({'bone':bone,'group':group,'center':[(bounds[j]+bounds[j+3])*.0125 for j in range(3)],
                      'half':[(bounds[j+3]-bounds[j])*.0125 for j in range(3)]})
    wanted={box['bone'] for box in boxes}
    for index in list(wanted):
        while model.bones[index]['parent'] >= 0:
            index=model.bones[index]['parent']
            wanted.add(index)
    poses={}
    def compact(values):
        values=[[round(v,7) for v in frame] for frame in values]
        return values[:1] if all(frame==values[0] for frame in values) else values
    for sequence in model.sequences:
        name=sequence['name']
        if name in DEATHS: continue
        tracks={}
        for index in sorted(wanted):
            if (index in lower) != (name in GAITS): continue
            frames=[model.pose(sequence,frame,index) for frame in range(sequence['frames'])]
            positions=compact([[v*.025 for v in frame[:3]] for frame in frames])
            rotations=[]
            previous=None
            for frame in frames:
                q=Euler(frame[3:],'XYZ').to_quaternion()
                if previous is not None and q.dot(previous)<0: q.negate()
                previous=q.copy()
                rotations.append([q.x,q.y,q.z,q.w])
            tracks[str(index)]={'p':positions,'q':compact(rotations)}
        poses[name]={'fps':sequence['fps'],'frames':sequence['frames'],'bones':tracks}
    runtime={'hands':{side:paths['Bip01 '+side+' Hand'] for side in ['R','L']},'durations':durations,
             'parents':[b['parent'] for b in model.bones], 'lower':sorted(lower),'boxes':boxes,'poses':poses}
    (path.parent/(path.stem+'-runtime.json')).write_text(json.dumps(runtime,separators=(',',':'))+'\n')
    return {'hands':runtime['hands'],'durations':durations}
