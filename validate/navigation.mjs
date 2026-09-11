import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { Client, pause, labels, readHud } from './team-client.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)),output=mkdtempSync(join(tmpdir(),'cs16-nav-runtime-'))
execFileSync(process.execPath,[join(root,'node_modules','typescript','bin','tsc'),join(root,'src','navigation.ts'),join(root,'src','world-query.ts'),'--target','es2020','--module','commonjs','--outDir',output,'--skipLibCheck','--resolveJsonModule','--esModuleInterop'])
const require=createRequire(import.meta.url),{dust2Navigation:graph,nearestNavNode,navPoint,navDistance}=require(join(output,'navigation.js'))
const {mapDistance}=require(join(output,'world-query.js'))
const c=new Client(process.argv[2]), directory=join(root,'validate','game','navigation'), evidence={date:new Date().toISOString(),checks:[],samples:[]}
const bots=s=>Object.entries(s).filter(([,v])=>v.MeshCollider&&v.Transform&&v.AvatarShape).map(([id,v])=>({id,name:v.AvatarShape.name,position:{...v.Transform.position}}))
try{
 await c.connect()
 const live=await c.until(s=>readHud(s)?.health===100 && readHud(s)?.seconds>110 && !labels(s).includes('Prepare to fight!'),'fresh live solo round',40000)
 const initial=bots(live);assert.equal(initial.length,3)
 await c.command('/move_player_to 85.74417 14.5 131.18173')
 const started=Date.now()
 let last=initial,lastAt=started,hit=false
 while(Date.now()-started<35000){
  await pause(200)
  const s=await c.snapshot(),now=Date.now(),current=bots(s),elapsed=(now-started)/1000,hud=readHud(s)
  if(labels(s).includes('Prepare to fight!'))throw new Error('round reset during navigation observation')
  assert.equal(current.length,3)
  for(const bot of current){
   const before=last.find(b=>b.id===bot.id);assert.ok(before,'bot identity retained')
   assert.ok(navDistance(bot.position,before.position)<=((now-lastAt)/1000+.2)*5.525+.3,'bot displacement respects movement speed')
   const node=nearestNavNode(graph,bot.position,1.2);assert.notEqual(node,undefined,'bot remains on navigation surface')
   const floor=mapDistance({...bot.position,y:bot.position.y+.55},{x:0,y:-1,z:0},1.2)
   assert.ok(floor<1.1,'actual collision floor supports bot')
  }
  evidence.samples.push({seconds:Number(elapsed.toFixed(2)),health:hud.health,bots:current})
  if(elapsed<5)assert.equal(hud.health,100,'distant walls prevent bot damage')
  last=current;lastAt=now
  if(hud.health<100){hit=true;break}
 }
 const final=evidence.samples.at(-1)
 const movements=final.bots.map(b=>({id:b.id,distance:navDistance(b.position,initial.find(a=>a.id===b.id).position)}))
 assert.ok(movements.filter(b=>b.distance>20).length>=2,'at least two bots traverse beyond their original encounter')
 assert.ok(movements.some(b=>b.distance>50),'one bot crosses the map toward T spawn')
 assert.ok(hit,'a patrolling bot reacquires the distant player and attacks')
 evidence.movements=movements;evidence.checks.push('three server-owned bots remain floor-supported and speed-limited across Dust2','hidden player receives no distant through-wall damage','bots patrol beyond the original encounter and reacquire the player near T spawn')
 await mkdir(directory,{recursive:true});await writeFile(join(directory,'routes.json'),JSON.stringify(evidence,null,2)+'\n')
 await c.evaluate('document.exitPointerLock()');await c.capture()
 const target=final.bots.sort((a,b)=>navDistance(a.position,{x:85.74417,y:13.4393,z:131.18173})-navDistance(b.position,{x:85.74417,y:13.4393,z:131.18173}))[0]
 await c.aimAt({...target.position,y:target.position.y+1.4})
 await promisify(execFile)('agent-browser',['--session','cs16-navigation','screenshot',join(directory,'patrol.png')],{timeout:45000})
 console.log(JSON.stringify({checks:evidence.checks,movements,seconds:final.seconds,health:final.health},null,2))
}finally{c.socket.close();rmSync(output,{recursive:true,force:true})}
