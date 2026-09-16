import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination, 'Pass a fresh isolated fixture')
execFileSync(process.execPath, [fileURLToPath(new URL('./prepare-movement.mjs', import.meta.url)), destination], {
  stdio: 'inherit'
})
async function edit(name, a, b) {
  const p = resolve(destination, 'src', name),
    s = await readFile(p, 'utf8')
  assert.ok(s.includes(a), name + ': fixture patch')
  await writeFile(p, s.replace(a, b))
}
await edit(
  'index.ts',
  '  playerFlinch: Schemas.Map',
  '  reviewMovementHit: Schemas.Map({large:Schemas.Boolean}),\n  playerFlinch: Schemas.Map'
)
await edit('index.ts', 'import ', "import { initializeMovementHits } from './movement-hits-review'\nimport ")
await edit(
  'index.ts',
  "  console.log('Starting CS 1.6 scene :)')",
  "  initializeMovementHits()\n  console.log('Starting CS 1.6 scene :)')"
)
await edit(
  'movement-review.ts',
  'import { engine,',
  "import { movementState } from './cs-movement'\nimport { AvatarMovement, AvatarMovementInfo } from './bevy-movement'\nimport { engine,"
)
await edit(
  'movement-review.ts',
  'weapon:Weapon.getOrNull(player)',
  'weapon:Weapon.getOrNull(player),control:movementState(),requested:AvatarMovement.getOrNull(engine.PlayerEntity),native:AvatarMovementInfo.getOrNull(engine.PlayerEntity)'
)
await writeFile(
  resolve(destination, 'src/movement-hits-review.ts'),
  `import { engine, inputSystem, InputAction, PointerEventType, Transform } from '@dcl/sdk/ecs'
import { isServer } from '@dcl/sdk/network'
import { room } from './index'
import { playerEntities, applyPlayerDamage } from './server'
import { PlayerHealth, PlayerTeam } from './components'
import { getPractice, playerPosition } from './practice'
export function initializeMovementHits() {
 if(isServer()) room.onMessage('reviewMovementHit',(data,ctx)=>{
  if(!ctx||getPractice()?.phase!=='live')return
  const address=ctx.from.toLowerCase(),player=playerEntities.get(address),position=playerPosition(address)
  if(player===undefined||!position)return
  PlayerHealth.getMutable(player).current=100
  applyPlayerDamage({address:'review-attacker',name:'Review attacker',team:1,weapon:data.large?'AK-47':'Glock-18'},player,1,data.large?'arms':'legs',{x:position.x,y:position.y+1.6,z:position.z+5},.775)
 })
 else engine.addSystem(()=>{
  if(inputSystem.isTriggered(InputAction.IA_PRIMARY,PointerEventType.PET_DOWN))room.send('reviewMovementHit',{large:true})
  if(inputSystem.isTriggered(InputAction.IA_SECONDARY,PointerEventType.PET_DOWN))room.send('reviewMovementHit',{large:false})
 })
}
`
)
await edit(
  'movement-review.ts',
  'import { engine, TextShape, Transform, Entity }',
  'import { engine, TextShape, Transform, Entity, MeshCollider, MeshRenderer }'
)
await edit(
  'movement-review.ts',
  'export function initializeMovementReview() {',
  `export function initializeMovementReview() {
 {const ceiling=engine.addEntity();Transform.create(ceiling,{position:{x:53,y:42.3,z:51},scale:{x:3,y:.2,z:10}});MeshCollider.setBox(ceiling);MeshRenderer.setBox(ceiling)}
 for (const x of [29,35,41,47,53]) { const base=engine.addEntity(); Transform.create(base,{position:{x,y:40,z:51},scale:{x:3,y:.2,z:30}}); MeshCollider.setBox(base); MeshRenderer.setBox(base) }
 for (const [x,z,height] of [[29,49,.2],[29,50,.4],[29,51,.6],[35,51,.45],[41,51,2],[47,51,.5],[53,51,.2]]) {const step=engine.addEntity();Transform.create(step,{position:{x,y:40.1+height/2,z},scale:{x:3,y:height,z:x===29?1:3}});MeshCollider.setBox(step);MeshRenderer.setBox(step)}

 for (const height of [14,24]) { const platform=engine.addEntity(); Transform.create(platform,{position:{x:21,y:height,z:51},scale:{x:3,y:0.2,z:3}}); MeshRenderer.setBox(platform); MeshCollider.setBox(platform) }`
)
await edit(
  'server.ts',
  'import { dropDeadPlayer }',
  "import { TextShape } from '@dcl/sdk/ecs'\nimport { dropDeadPlayer }"
)
await edit(
  'server.ts',
  '  health.current = result.health',
  `  const marker=engine.addEntity()
  TextShape.create(marker,{fontSize:0.001,text:'review-fall-'+JSON.stringify({address,speed,position,previousHealth:health.current,result,at:Date.now()/1000})})
  syncEntity(marker,[TextShape.componentId])
  health.current = result.health`
)
console.log(
  'CS movement fixture: real inputs and native velocity feedback; E/F cause server-confirmed rifle/pistol hits for repeatable flinch checks.'
)
