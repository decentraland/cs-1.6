import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination, 'Pass a fresh isolated fixture directory')
execFileSync(process.execPath, [fileURLToPath(new URL('./prepare-arsenal.mjs', import.meta.url)), destination], {
  stdio: 'inherit'
})
async function edit(name, from, to) {
  const path = resolve(destination, 'src', name),
    source = await readFile(path, 'utf8')
  assert.ok(source.includes(from), name + ': fixture anchor')
  await writeFile(path, source.replace(from, to))
}
await edit(
  'index.ts',
  '  playerFlinch: Schemas.Map',
  '  reviewHeldMode: Schemas.Map({mode:Schemas.Int}),\n  playerFlinch: Schemas.Map'
)
await edit('client.ts', '  initializeFootsteps()', '  initializeFootsteps()\n  initializeDualReview()')
await edit(
  'client.ts',
  'import { initializeC4Effects }',
  "import { initializeDualReview } from './dual-review'\nimport { initializeC4Effects }"
)
await writeFile(
  resolve(destination, 'src/dual-review.ts'),
  `import {engine,inputSystem,InputAction,PointerEventType} from '@dcl/sdk/ecs'
import {room} from './index'
export function initializeDualReview(){let mode=0;engine.addSystem(()=>{if(inputSystem.isTriggered(InputAction.IA_ACTION_6,PointerEventType.PET_DOWN))room.send('reviewHeldMode',{mode:++mode})})}
`
)
await edit('practice.ts', 'import { AvatarShape, engine,', 'import { TextShape, AvatarShape, engine,')
await edit(
  'practice.ts',
  'createBotNavigation(start, dust2Navigation',
  'createBotNavigation(index===0?{x:21,y:10.44,z:60}:start, dust2Navigation'
)
await edit('practice.ts', '(yaw * 180) / Math.PI)', 'index===0?180:(yaw * 180) / Math.PI)')
await edit(
  'practice.ts',
  "const gun = (gunProfile(account.inventory.active) ?? GUNS[team === 2 ? 'usp' : 'glock18']).id",
  "const gun = index===0?'elite':team === Team.COUNTER_TERRORIST ? 'm4a1' : 'ak47'"
)
await edit(
  'practice.ts',
  'export function initializePractice() {',
  `export function initializePractice() {
 let mode=0,walkingTime=0
 room.onMessage('reviewHeldMode',(data,context)=>{
  if(!context||getPractice()?.phase!=='live'||data.mode<1||data.mode>5)return
  mode=data.mode
  if(mode===5){clearBots();return}
  const entity=botEntities[0];if(!Bot.getOrNull(entity)?.alive)return
  Bot.getMutable(entity).weapon=mode===1?'ak47':mode===3?'knife':'elite'
 })
 const probe=engine.addEntity();Transform.create(probe);syncEntity(probe,[TextShape.componentId])
 engine.addSystem((dt)=>{
  const entity=botEntities[0],bot=Bot.getOrNull(entity),nav=botNavigation.get(entity)
  if(mode===2&&bot?.alive&&nav){walkingTime+=dt;nav.position={x:21+Math.min(3,walkingTime),y:nav.position.y,z:60};Transform.getMutable(entity).position=nav.position}
  TextShape.createOrReplace(probe,{fontSize:.0001,text:'review-held-state-'+JSON.stringify({mode,bot,position:nav?.position})})
 })`
)
console.log(
  'Dual-hand fixture: isolated arsenal room, parked/non-firing bots, bot 0 holds original Elites. Key 4 cycles AK / walking Elites / knife / Elites / despawn; real shots still use production damage.'
)
