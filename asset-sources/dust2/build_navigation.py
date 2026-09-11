import json,math,time,collections,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[2]
triangles=json.loads((root/'src/map-collision.ts').read_text().split(' = ',1)[1])
GRID=.5;RADIUS=.3;HEIGHT=1.8;STEP=.48
buckets=collections.defaultdict(list); floors=collections.defaultdict(list)
for t in triangles:
 a=t[:3];u=[t[i+3]-t[i] for i in range(3)];v=[t[i+6]-t[i] for i in range(3)];n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
 entry=(a,u,v,n)
 for ix in range(math.floor(min(t[0::3])),math.floor(max(t[0::3]))+1):
  for iz in range(math.floor(min(t[2::3])),math.floor(max(t[2::3]))+1):
   buckets[ix,iz].append(entry)
   if n[1]<-.7*math.sqrt(sum(c*c for c in n)):floors[ix,iz].append(entry)
def floor_heights(x,z):
 result=[]
 for a,u,v,n in floors[math.floor(x),math.floor(z)]:
  det=u[0]*v[2]-u[2]*v[0]
  p=((x-a[0])*v[2]-(z-a[2])*v[0])/det;q=(u[0]*(z-a[2])-u[2]*(x-a[0]))/det
  if p>=-1e-7 and q>=-1e-7 and p+q<=1+1e-7:
   y=a[1]+u[1]*p+v[1]*q
   if not any(abs(y-prev)<.02 for prev in result):result.append(y)
 return sorted(result)
def clear(a,b):
 d=[b[i]-a[i] for i in range(3)]
 seen=set()
 for ix in range(math.floor(min(a[0],b[0])),math.floor(max(a[0],b[0]))+1):
  for iz in range(math.floor(min(a[2],b[2])),math.floor(max(a[2],b[2]))+1):
   for t in buckets[ix,iz]:
    ident=id(t)
    if ident in seen:continue
    seen.add(ident);p,u,v,n=t
    cross=[d[1]*v[2]-d[2]*v[1],d[2]*v[0]-d[0]*v[2],d[0]*v[1]-d[1]*v[0]];det=sum(u[i]*cross[i] for i in range(3))
    if abs(det)<1e-9:continue
    o=[a[i]-p[i] for i in range(3)];s=sum(o[i]*cross[i] for i in range(3))/det
    if s<0 or s>1:continue
    q=[o[1]*u[2]-o[2]*u[1],o[2]*u[0]-o[0]*u[2],o[0]*u[1]-o[1]*u[0]];r=sum(d[i]*q[i] for i in range(3))/det
    if r<0 or s+r>1:continue
    distance=sum(v[i]*q[i] for i in range(3))/det
    if 1e-5<distance<1-1e-5:return False
 return True
def standing(x,y,z):
 for dx,dz in [(0,0),(-RADIUS,0),(RADIUS,0),(0,-RADIUS),(0,RADIUS)]:
  if not clear((x+dx,y+STEP+.01,z+dz),(x+dx,y+HEIGHT,z+dz)):return False
 for dy in [STEP+.01,1.2,HEIGHT-.05]:
  for dx,dz in [(-RADIUS,0),(RADIUS,0),(0,-RADIUS),(0,RADIUS)]:
   if not clear((x,y+dy,z),(x+dx,y+dy,z+dz)):return False
 return True
def traversable(a,b):
 if abs(a[1]-b[1])>STEP+.001:return False
 dx=b[0]-a[0];dz=b[2]-a[2];length=math.hypot(dx,dz);sx=-dz/length*RADIUS;sz=dx/length*RADIUS
 for offset in [-1,0,1]:
  for height in [STEP+.01,1.2,HEIGHT-.05]:
   if not clear((a[0]+offset*sx,a[1]+height,a[2]+offset*sz),(b[0]+offset*sx,b[1]+height,b[2]+offset*sz)):return False
 return True
start=time.time(); nodes=[]; cells=collections.defaultdict(list)
minx=math.floor(min(t[i] for t in triangles for i in [0,3,6]));maxx=math.ceil(max(t[i] for t in triangles for i in [0,3,6]))
minz=math.floor(min(t[i] for t in triangles for i in [2,5,8]));maxz=math.ceil(max(t[i] for t in triangles for i in [2,5,8]))
print('bounds',minx,maxx,minz,maxz,flush=True)
for ix in range(int(minx/GRID),int(maxx/GRID)+1):
 for iz in range(int(minz/GRID),int(maxz/GRID)+1):
  x=ix*GRID;z=iz*GRID
  for y in floor_heights(x,z):
   if standing(x,y,z):cells[ix,iz].append(len(nodes));nodes.append([x,round(y,4),z,[]])
print('standing nodes',len(nodes),round(time.time()-start,1),flush=True)
for (ix,iz),ids in cells.items():
 for dx,dz in [(1,0),(0,1),(1,1),(1,-1)]:
  for a in ids:
   for b in cells.get((ix+dx,iz+dz),[]):
    if traversable(nodes[a],nodes[b]):nodes[a][3].append(b);nodes[b][3].append(a)
seen=set();components=[]
for i in range(len(nodes)):
 if i in seen:continue
 component=[];q=[i];seen.add(i)
 while q:
  n=q.pop();component.append(n)
  for neighbor in nodes[n][3]:
   if neighbor not in seen:seen.add(neighbor);q.append(neighbor)
 components.append(component)
components.sort(key=len,reverse=True);print('components',list(map(len,components[:20])),round(time.time()-start,1),flush=True)
keep=set(components[0]); mapping={old:new for new,old in enumerate(sorted(keep))}
output=[[nodes[i][0],nodes[i][1],nodes[i][2],[mapping[n] for n in nodes[i][3] if n in keep]] for i in sorted(keep)]
data={'sourceSha256':hashlib.sha256((root/'src/map-collision.ts').read_bytes()).hexdigest(),'spacing':GRID,'radius':RADIUS,'height':HEIGHT,'step':STEP,'positions':[n[:3] for n in output],'links':[n[3] for n in output]}
(root/'src/navigation.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
print('saved',len(output),'nodes',flush=True)
for name,p in [('solo',[95,10.026,52]),('A',[32.84,12.586,46.7]),('B',[104.5,10.026,40.7]),('T',[85.7,13.44,131.2]),('CT',[51.61,6.6127,46.7])]:
 n=min(output,key=lambda n:sum((n[i]-p[i])**2 for i in range(3)));print(name,n[:3],round(math.dist(p,n[:3]),2))
