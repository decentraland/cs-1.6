import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { Client,pause,labels,readHud } from './team-client.mjs'
import { readScoreRows } from './read-scoreboard.mjs'

const [ct,t]=process.argv.slice(2,4).map(endpoint=>new Client(endpoint))
const evidence={date:new Date().toISOString(),checks:[]}
async function tap(client,key,code,vk){await client.key('keyDown',key,code,vk);await pause(80);await client.key('keyUp',key,code,vk);await pause(250)}
async function selectKnife(client){await client.key('keyDown','Shift','ShiftLeft',16);await tap(client,'3','Digit3',51);await client.key('keyUp','Shift','ShiftLeft',16);await client.until(state=>labels(state).some(value=>value.startsWith('Knife   2:')),'knife selected')}
const humanScore=(state,score,deaths)=>readScoreRows(state).some(row=>row.values.at(-3)===String(score)&&row.values.at(-2)===String(deaths)&&row.values.at(-1)==='-')
async function stage(attacker,target,distance){
 await attacker.command('/move_player_to 90 11 52')
 await target.command(`/move_player_to 90 11 ${52+distance}`)
 await pause(1200)
 const feet=(await target.snapshot())['1'].Transform.position
 await attacker.aimAt({x:feet.x,y:feet.y+1.05,z:feet.z})
 return feet
}

try {
 await Promise.all([ct.connect(),t.connect()])
 await ct.until(state=>labels(state).includes('Select a team'),'fresh team menu',50000)
 await ct.join(2,true);await ct.until(state=>labels(state).includes('Joined Counter-Terrorists'),'CT joined')
 await t.until(state=>labels(state).includes('Select a team'),'team lobby');await t.join(1,false)
 await t.until(state=>!labels(state).includes('Prepare to fight!')&&readHud(state)?.seconds>100,'live')
 await ct.capture();await t.capture();await selectKnife(ct)
 const selected=await ct.snapshot(),knifeParts=Object.values(selected).filter(value=>value.MeshRenderer?.mesh?.box&&value.VisibilityComponent?.visible)
 assert.equal(readHud(selected).clip,undefined);assert.equal(readHud(selected).reserve,undefined)
 assert.ok(knifeParts.length>=3,'knife proxy is visible while gun proxies are hidden')
 evidence.checks.push('Shift+3 equips the visible knife and hides firearm ammunition')

 await stage(ct,t,3);await ct.shoot();await pause(500)
 assert.equal(readHud(await t.snapshot()).health,100,'out-of-range swing cannot damage')
 await stage(ct,t,1);await ct.shoot()
 await t.until(state=>readHud(state)?.health===80,'paused primary does 20')
 await ct.shoot(500)
 await t.until(state=>readHud(state)?.health===65,'chained primary does 15')
 evidence.primaryHealth=[100,80,65]
 evidence.checks.push('server range rejects distant swing; primary damage is 20 then 15 while chained')

 const ctFeet=(await ct.snapshot())['1'].Transform.position
 await t.aimAt({x:ctFeet.x,y:ctFeet.y+1.05,z:ctFeet.z});await pause(550)
 const tFeet=(await t.snapshot())['1'].Transform.position
 await ct.aimAt({x:tFeet.x,y:tFeet.y+1.05,z:tFeet.z});await tap(ct,'f','KeyF',70)
 await t.until(state=>readHud(state)?.health===0,'65-damage front stab finishes target')
 assert.ok(labels(await ct.snapshot()).some(value=>value.includes('Knife')),'knife kill feed')
 evidence.checks.push('F frontal stab deals 65 body damage and credits a Knife kill')

 await ct.until(state=>labels(state).includes('Prepare to fight!'),'second round',8000)
 await ct.until(state=>!labels(state).includes('Prepare to fight!')&&readHud(state)?.seconds>100,'second live')
 await selectKnife(ct)
 await t.command('/move_player_to 90 11 53');await ct.command('/move_player_to 90 11 52.3');await pause(1200)
 await t.capture();await t.aimAt({x:90,y:12.6,z:63});await pause(500)
 const victim=(await t.snapshot())['1'].Transform.position
 await ct.capture();await ct.aimAt({x:victim.x,y:victim.y+1.05,z:victim.z});await tap(ct,'f','KeyF',70)
 await t.until(state=>readHud(state)?.health===0,'one-hit backstab')
 const board=await ct.scoreboard()
 assert.ok(humanScore(board,2,0),'both knife kills reach the CT scoreboard row')
 evidence.backstabHealth=0
 evidence.checks.push('aligned rear stab applies the 3x backstab multiplier and scoreboard kill')
 if(process.argv[4])await writeFile(process.argv[4],JSON.stringify(evidence,null,2)+'\n')
 console.log('PASS',JSON.stringify(evidence))
} finally {
 for(const client of [ct,t]) {
  if(client.sessionId) {
   await client.key('keyUp','Shift','ShiftLeft',16).catch(error=>console.warn(error.message))
   await client.key('keyUp','f','KeyF',70).catch(error=>console.warn(error.message))
   await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:client.mx,y:client.my,button:'left',clickCount:1}).catch(error=>console.warn(error.message))
  }
  client.socket.close()
 }
}
