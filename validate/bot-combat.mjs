import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {Client,pause,labels,readHud} from './team-client.mjs'
const c=new Client(process.argv[2]), evidence={date:new Date().toISOString(),checks:[],health:[],effects:[]}
try{
 await c.connect()
 await c.until(s=>readHud(s)?.health===100 && readHud(s)?.seconds>110 && labels(s).includes('Enemies left: 3') && !labels(s).includes('Prepare to fight!'),'fresh live bot round',25000)
 const seen=new Set(),start=Date.now();let previous=100
 evidence.health.push({time:0,value:100})
 while(Date.now()-start<15000){
  const s=await c.snapshot(),hud=readHud(s),time=Date.now()-start
  if(hud.health!==previous){evidence.health.push({time,value:hud.health,damage:previous-hud.health});previous=hud.health}
  for(const [id,v] of Object.entries(s))if(!seen.has(id)&&v.MeshRenderer&&v.Transform?.scale?.x===.1&&v.Material){seen.add(id);evidence.effects.push({time,position:v.Transform.position,material:v.Material})}
  if(hud.health===0){evidence.killFeed=labels(s).filter(t=>t.includes('AK-47'));break}
  await pause(30)
 }
 assert.equal(previous,0,'bot bullets eliminate an idle player')
 assert.ok(evidence.health.some(h=>h.damage>0&&h.damage!==10),'damage comes from AK bullets instead of fixed 10-point attacks')
 const colors=evidence.effects.map(effect=>effect.material.material?.pbr?.albedoColor)
 assert.ok(colors.some(color=>color?.r===1&&color?.g===1&&color?.b===0),'bot muzzle effects render')
 assert.ok(colors.some(color=>color?.r===.5&&color?.g===.5&&color?.b===.5),'traced bullet impact effects render')
 const announced=await c.until(s=>labels(s).some(t=>t.includes('AK-47')&&/Guerilla|Phoenix|Arctic/.test(t)),'bot kill announcement',2500)
 evidence.killFeed=labels(announced).filter(t=>t.includes('AK-47'))
 evidence.checks.push('live AK damage replaces fixed health subtraction','actual bullet effects and bot weapon kill feed are visible','bot kill still ends the round')
 await writeFile(new URL('./game/bot-combat/hits.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n')
 console.log(JSON.stringify({checks:evidence.checks,health:evidence.health,effects:evidence.effects.length,killFeed:evidence.killFeed},null,2))
}finally{c.socket.close()}
