import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination, 'Pass a new review directory outside the scene repo')
execFileSync(process.execPath, [fileURLToPath(new URL('./prepare-arsenal.mjs', import.meta.url)), destination], {
  stdio: 'inherit'
})
async function replace(name, from, to) {
  const path = resolve(destination, 'src', name),
    source = await readFile(path, 'utf8')
  assert.ok(source.includes(from), name + ': fixture patch matches')
  await writeFile(path, source.replace(from, to))
}
await replace(
  'client.ts',
  'import { initializeC4Effects }',
  "import { initializeMovementReview } from './movement-review'\nimport { initializeC4Effects }"
)
await replace('client.ts', '  initializeFootsteps()', '  initializeFootsteps()\n  initializeMovementReview()')
await replace(
  'footsteps.ts',
  'import { AudioSource',
  "import { traceFootsteps } from './movement-review'\nimport { AudioSource"
)
await replace(
  'footsteps.ts',
  '  if (!sound) return',
  '  traceFootsteps(address, position, walker.motion, grounded, floor.material, sound)\n  if (!sound) return'
)
await writeFile(
  resolve(destination, 'src/movement-review.ts'),
  `import { engine, TextShape, Transform, Entity } from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { getPractice } from './practice'
import { PlayerAddress, PlayerHealth, Weapon } from './components'
import { MovementPoint, StepSound, FootstepMotion } from './footstep-rules'
const traces = new Map<string, { entity: Entity; total: number; events: unknown[] }>()
export function traceFootsteps(address: string, position: MovementPoint, motion: FootstepMotion, grounded: boolean, material: string, sound: StepSound | undefined) {
 let trace = traces.get(address)
 if (!trace) { const entity=engine.addEntity(); Transform.create(entity); trace={ entity, total:0, events:[] }; traces.set(address,trace) }
 if (sound) { trace.total++; trace.events.push({ ...sound, at:Date.now()/1000, position:{...position} }); if(trace.events.length>32) trace.events.shift() }
 TextShape.createOrReplace(trace.entity,{fontSize:0.001,text:'review-movement-'+JSON.stringify({address,position,grounded,material,horizontal:motion.horizontal,vertical:motion.vertical,total:trace.total,events:trace.events})})
}
export function initializeMovementReview() {
 const entity=engine.addEntity(); Transform.create(entity)
 engine.addSystem(() => {
  for (const [player, address] of engine.getEntitiesWith(PlayerAddress)) if (address.address === myProfile.userId?.toLowerCase()) {
   TextShape.createOrReplace(entity,{fontSize:0.001,text:'review-move-state-'+JSON.stringify({address:address.address,match:getPractice(),health:PlayerHealth.getOrNull(player),weapon:Weapon.getOrNull(player)})})
  }
 })
}
`
)
if (process.argv[3] === 'bots')
  await replace(
    'practice.ts',
    'function botLoop(now: number) {\n  if (now > 0) return',
    'function botLoop(now: number) {'
  )
const path = resolve(destination, 'scene.json'),
  scene = JSON.parse(await readFile(path, 'utf8'))
scene.display.title = 'CS16 Movement Review'
await writeFile(path, JSON.stringify(scene, null, 2) + '\n')
console.log(
  'Movement fixture: isolated room, extended rounds, tiny diagnostic TextShapes; bots stationary unless bots argument is used.'
)
