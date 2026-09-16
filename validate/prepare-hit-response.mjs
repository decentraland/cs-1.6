import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination, 'Pass a new isolated fixture directory')
execFileSync(process.execPath, [fileURLToPath(new URL('./prepare-arsenal.mjs', import.meta.url)), destination], {
  stdio: 'inherit'
})
async function replace(name, from, to) {
  const file = resolve(destination, 'src', name),
    source = await readFile(file, 'utf8')
  assert.ok(source.includes(from), name + ': fixture patch matches')
  await writeFile(file, source.replace(from, to))
}
await replace(
  'index.ts',
  '  playerVoice: Schemas.Map(',
  '  reviewHit: Schemas.Map({step:Schemas.Int}),\n  playerVoice: Schemas.Map('
)
await replace('index.ts', 'import ', "import { initializeHitReview } from './hit-review'\nimport ")
await replace(
  'index.ts',
  "  console.log('Starting CS 1.6 scene :)')",
  "  initializeHitReview()\n  console.log('Starting CS 1.6 scene :)')"
)
await replace(
  'practice.ts',
  '  const bot = Bot.getMutable(target)',
  "  const marker=engine.addEntity(); TextShape.create(marker,{fontSize:0.001,text:'review-bot-hit-'+JSON.stringify({target:Bot.get(target).index,group,damage,previous:Bot.get(target).health})}); syncEntity(marker,[TextShape.componentId])\n  const bot = Bot.getMutable(target)"
)
await replace(
  'practice.ts',
  'import { avatarForward,',
  "import { TextShape } from '@dcl/sdk/ecs'\nimport { avatarForward,"
)
await writeFile(
  resolve(destination, 'src/hit-review.ts'),
  `import { engine, TextShape, Transform, Entity, inputSystem, InputAction, PointerEventType, Quaternion as Unused } from '@dcl/sdk/ecs'
import { Quaternion } from '@dcl/sdk/math'
import { isServer, myProfile, syncEntity } from '@dcl/sdk/network'
import { room } from './index'
import { PlayerHealth, PlayerEquipment, PlayerAddress, PlayerTeam, PlayerStats, PlayerMoney, Bot, Weapon, Dead } from './components'
import { getPractice, playerPosition } from './practice'
import { applyPlayerDamage, playerEntities } from './server'
import { fireGunShot, HitGroup, PLAYER_HIT_REGIONS } from './ballistics'
import { damageBatches } from './hit-regions'
import { freshGunAccuracy } from './gun-accuracy'
import { GUNS, GunId } from './weapon-profiles'
import { getPainPunch } from './fps-camera'
let step=0
export function initializeHitReview() {
 if(isServer()) {
  room.onMessage('reviewHit',(data,context)=> {
   if(!context || getPractice()?.phase!=='live') return
   const address=context.from.toLowerCase(), target=playerEntities.get(address)
   if(target===undefined) return
   const feet=playerPosition(address)
   if(!feet) return
   if(data.step===100) {
    let i=0
    for(const [entity,bot] of engine.getEntitiesWith(Bot)) {
     const mutable=Bot.getMutable(entity); mutable.health=100; mutable.alive=true
     Transform.getMutable(entity).position={x:88,y:10.026,z:52+i*2}; Transform.getMutable(entity).rotation=Quaternion.fromEulerDegrees(0,90,0); i++
    }
    return
   }
   const cases: {name:string;gun:GunId;group:HitGroup;height:number;armor:number;helmet:boolean;health?:number;side?:number}[]=[
    {name:'chest',gun:'ak47',group:'body',height:1.2,armor:0,helmet:false},
    {name:'stomach',gun:'ak47',group:'stomach',height:0.8,armor:0,helmet:false},
    {name:'arm',gun:'ak47',group:'arms',height:1.1,side:0.34,armor:0,helmet:false},
    {name:'leg',gun:'ak47',group:'legs',height:0.3,armor:100,helmet:true},
    {name:'kevlar',gun:'ak47',group:'stomach',height:0.8,armor:100,helmet:true},
    {name:'helmet',gun:'glock18',group:'head',height:1.6,armor:100,helmet:true},
    {name:'head',gun:'glock18',group:'head',height:1.6,armor:0,helmet:false},
    {name:'exhausted-helmet',gun:'glock18',group:'head',height:1.6,armor:1,helmet:true},
    {name:'shotgun',gun:'xm1014',group:'stomach',height:0.8,armor:100,helmet:true},
    {name:'death',gun:'ak47',group:'head',height:1.6,armor:0,helmet:false}
   ]
   const config=cases[data.step]
   if(!config || Dead.has(target)) return
   const health=PlayerHealth.getMutable(target);health.current=100;health.armor=config.armor
   PlayerEquipment.getMutable(target).helmet=config.helmet
   const origin={x:feet.x+7,y:feet.y+1.6,z:feet.z}, point={x:feet.x,y:feet.y+config.height,z:feet.z-(config.side??0)}
   const delta={x:point.x-origin.x,y:point.y-origin.y,z:point.z-origin.z}, length=Math.hypot(delta.x,delta.y,delta.z)
   const gun=GUNS[config.gun]
   const shot=fireGunShot({gun:config.gun,feet:{...origin,y:feet.y},aim:{x:delta.x/length,y:delta.y/length,z:delta.z/length},accuracy:freshGunAccuracy(config.gun),triggerHeld:true,speed:0,grounded:true,now:Date.now()/1000,damage:gun.damage,targets:[{id:target,center:feet,yaw:Math.PI/2,regions:PLAYER_HIT_REGIONS}],random:()=>0.5})
   if(!shot) return
   const batches=damageBatches(shot.impacts)
   for(const hit of batches) applyPlayerDamage({address:'bot:0',name:'Review bot',weapon:gun.name,team:1},hit.target,hit.damage,hit.group,origin,gun.armorRatio,false,hit.traces)
   const marker=engine.addEntity()
   TextShape.create(marker,{fontSize:0.001,text:'review-hit-'+JSON.stringify({address,step:data.step,config,batches,health:PlayerHealth.get(target),equipment:PlayerEquipment.get(target),stats:PlayerStats.get(target),money:PlayerMoney.get(target)})})
   syncEntity(marker,[TextShape.componentId])
  })
 } else {
  const marker=engine.addEntity()
  engine.addSystem(()=>{
   for(const [entity,address] of engine.getEntitiesWith(PlayerAddress)) if(address.address===myProfile.userId?.toLowerCase()) {
    TextShape.createOrReplace(marker,{fontSize:0.001,text:'review-hit-state-'+JSON.stringify({match:getPractice(),health:PlayerHealth.getOrNull(entity),equipment:PlayerEquipment.getOrNull(entity),weapon:Weapon.getOrNull(entity),punch:getPainPunch(Date.now()/1000),bots:[...engine.getEntitiesWith(Bot,Transform)].map(([e,b,t])=>({index:b.index,alive:b.alive,health:b.health,position:t.position}))})})
   }
   if(inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) room.send('reviewHit',{step:step++})
   if(inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)) room.send('reviewHit',{step:100})
  })
 }
}
`.replace(', Quaternion as Unused', '')
)
console.log(
  'Hit fixture: E steps through deterministic incoming shots, F parks bots for real outgoing shots. Only test state setup/diagnostics differ from production.'
)
