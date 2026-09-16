import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination, 'Pass a fresh fixture directory')
execFileSync(process.execPath, [fileURLToPath(new URL('./prepare-movement.mjs', import.meta.url)), destination], {
  stdio: 'inherit'
})
async function replace(name, from, to) {
  const file = resolve(destination, 'src', name),
    source = await readFile(file, 'utf8')
  assert.ok(source.includes(from), name + ': fixture patch matches')
  await writeFile(file, source.replace(from, to))
}
await replace(
  'movement-review.ts',
  'import { engine, TextShape, Transform, Entity }',
  "import { getPainPunch } from './fps-camera'\nimport { room } from './index'\nimport { engine, TextShape, Transform, Entity, MeshRenderer, MeshCollider }"
)
await replace(
  'movement-review.ts',
  'PlayerAddress, PlayerHealth, Weapon',
  'PlayerAddress, PlayerHealth, PlayerStats, PlayerMoney, PlayerEquipment, Weapon'
)
await replace(
  'movement-review.ts',
  'weapon:Weapon.getOrNull(player)',
  'weapon:Weapon.getOrNull(player),stats:PlayerStats.getOrNull(player),money:PlayerMoney.getOrNull(player),equipment:PlayerEquipment.getOrNull(player),punch:getPainPunch(Date.now()/1000)'
)
await replace(
  'movement-review.ts',
  'export function initializeMovementReview() {',
  `export function initializeMovementReview() {
 for (const height of [14,24]) { const platform=engine.addEntity(); Transform.create(platform,{position:{x:21,y:height,z:51},scale:{x:3,y:0.2,z:3}}); MeshRenderer.setBox(platform); MeshCollider.setBox(platform) }
 let sent=false
 engine.addSystem(() => { const match=getPractice(); if(!sent && match?.phase==='live') { sent=true; room.send('playerLanding',{round:match.round,sequence:0.5,speed:40,position:{...Transform.get(engine.PlayerEntity).position}}) } })`
)
await replace(
  'server.ts',
  'import { dropDeadPlayer }',
  "import { TextShape } from '@dcl/sdk/ecs'\nimport { dropDeadPlayer }"
)
await replace(
  'server.ts',
  '  health.current = result.health',
  `  const marker=engine.addEntity()
  TextShape.create(marker,{fontSize:0.001,text:'review-fall-'+JSON.stringify({address,speed,position,previousHealth:health.current,armor:health.armor,result,at:Date.now()/1000})})
  syncEntity(marker,[TextShape.componentId])
  health.current = result.health`
)
if (process.argv[3] === 'no-reports')
  await replace('footsteps.ts', "    room.send('playerLanding',", "    if (false) room.send('playerLanding',")
console.log(
  'Fall fixture adds three takeoff platforms and a rejected grounded landing claim; damage, scores, rounds and movement are production rules.'
)
