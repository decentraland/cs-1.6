"""Extract the original point hull and material faces for authoritative bullet traces."""
from pathlib import Path
import hashlib,json,re,struct,sys

def export(bsp_path, materials_path, output):
    data=Path(bsp_path).read_bytes()
    assert struct.unpack_from('<i',data)[0]==30
    lumps=[struct.unpack_from('<2i',data,4+8*i) for i in range(15)]
    def records(lump,fmt):
        offset,length=lumps[lump];size=struct.calcsize(fmt);assert length%size==0
        return [struct.unpack_from(fmt,data,at) for at in range(offset,offset+length,size)]
    def world(p):return [round(63.5575-p[0]*2/75,8),round(10.026+p[2]*2/75,8),round(112.4084-p[1]*2/75,8)]
    offset,length=lumps[0]
    entities=[dict(re.findall(r'"([^"\n]+)"\s*"([^"\n]*)"',block)) for block in re.findall(r'\{([^}]+)\}',data[offset:offset+length].decode('latin1'))]
    solid_models={0}|{int(e['model'][1:]) for e in entities if e.get('classname') in ['func_wall','func_breakable','func_door','func_door_rotating'] and e.get('model','').startswith('*')}
    models=records(14,'<9f7i')
    leaves=records(10,'<2i6h2H4B')
    nodes=[]
    for node in records(5,'<i2h6h2H'):
        nodes.append([node[0],*[(child if child>=0 else (-2 if leaves[-child-1][0]==-2 else -1)) for child in node[1:3]]])
    planes=[]
    for x,y,z,d,_ in records(1,'<4fi'):
        n=[-x,z,-y];planes.append([*n,round(d*2/75+n[0]*63.5575+n[1]*10.026+n[2]*112.4084,8)])
    vertices=[world(v) for v in records(3,'<3f')]
    edges=records(12,'<2H');surfedges=[e[0] for e in records(13,'<i')]
    texinfo=records(6,'<8f2i');texture_start=lumps[2][0];count=struct.unpack_from('<i',data,texture_start)[0]
    textures=[]
    for i in range(count):
        at=struct.unpack_from('<i',data,texture_start+4+i*4)[0]
        textures.append(data[texture_start+at:texture_start+at+16].split(b'\0')[0].decode('latin1') if at>=0 else '')
    materials={}
    for line in Path(materials_path).read_text().splitlines():
        fields=line.strip().split()
        if len(fields)>=2 and len(fields[0])==1 and fields[0].isalpha():materials[fields[1][:16].lower()]=fields[0].upper()
    def material(texture):
        if texture.startswith(('+','-')):texture=texture[2:]
        if texture.startswith(('{','!','~',' ')):texture=texture[1:]
        return materials.get(texture[:16].lower(),'C')
    faces=records(7,'<2Hi2H4Bi');surfaces=[];roots=[]
    for model_index in sorted(solid_models):
        model=models[model_index];roots.append(model[9])
        for face in faces[model[14]:model[14]+model[15]]:
            planenum,side,firstedge,numedges,texid,*_=face
            polygon=[]
            for j in range(firstedge,firstedge+numedges):
                edge=surfedges[j];polygon.append(edges[abs(edge)][0 if edge>=0 else 1])
            texture=textures[texinfo[texid][8]]
            surfaces.append([planenum,material(texture),texture,polygon])
    used=sorted({n[0] for n in nodes}|{s[0] for s in surfaces});remap={p:i for i,p in enumerate(used)}
    for node in nodes:node[0]=remap[node[0]]
    for face in surfaces:face[0]=remap[face[0]]
    payload={'sourceSha256':hashlib.sha256(data).hexdigest(),'materialsSha256':hashlib.sha256(Path(materials_path).read_bytes()).hexdigest(),'planes':[planes[p] for p in used],'nodes':nodes,'roots':roots,'vertices':vertices,'surfaces':surfaces}
    text='import type { SolidMap } from \'./solid-trace\'\nexport const DUST2_SOLIDS: SolidMap = '+json.dumps(payload,separators=(',',':'))+'\n'
    Path(output).write_text(text)
    print(json.dumps({'planes':len(used),'nodes':len(nodes),'roots':len(roots),'faces':len(surfaces),'vertices':len(vertices),'bytes':len(text),'sourceSha256':payload['sourceSha256']}))
if __name__=='__main__':export(*sys.argv[1:])
