from pathlib import Path
import json,struct,sys,re
src=Path(__file__).resolve().parent;r=src.parent.parent
sounds=set();events={};manifest=json.loads((src/'manifest.json').read_text())
for id,m in manifest.items():
 data=(src/('fixed_v_'+id+'.mdl')).read_bytes();n,off=struct.unpack_from('<2i',data,164);clips={}
 for i in range(n):
  at=off+i*176;name=data[at:at+32].split(b'\0')[0].decode();fps=struct.unpack_from('<f',data,at+32)[0];num,ev=struct.unpack_from('<2i',data,at+48)
  steps=[]
  for e in range(num):
   frame,code,kind=struct.unpack_from('<3i',data,ev+e*76);option=data[ev+e*76+12:ev+e*76+76].split(b'\0')[0].decode()
   if code==5004 and option.startswith('weapons/'):
    sound=option.split('/')[-1]; sounds.add(sound);steps.append({'at':frame/fps,'sound':sound})
  if steps:clips[name]=steps
 events[id]=clips
(src/'animation-sounds.json').write_text(json.dumps(events,indent=2)+'\n')
(r/'src/weapon-animation-sounds.ts').write_text("import { WeaponId } from './weapon-profiles'\nexport const WEAPON_ANIMATION_SOUNDS: Partial<Record<WeaponId, Record<string, {at: number; sound: string}[]>>> = "+json.dumps(events,indent=2)+'\n')
(src/'animation-sound-files.json').write_text(json.dumps(sorted(sounds),indent=2)+'\n')
print(len(sounds),'animation sounds;',sum(len(clips) for clips in events.values()),'animated sequences')
