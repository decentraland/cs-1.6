import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination, 'Pass a fresh isolated directory')
execFileSync(process.execPath, [fileURLToPath(new URL('./prepare-arsenal.mjs', import.meta.url)), destination], {
  stdio: 'inherit'
})
async function edit(file, from, to) {
  const path = resolve(destination, 'src', file),
    text = await readFile(path, 'utf8')
  assert.ok(text.includes(from), file + ': fixture anchor')
  await writeFile(path, text.replace(from, to))
}
await edit('inventory.ts', "SPAWN_PRIMARY: GunId | undefined = 'awp'", "SPAWN_PRIMARY: GunId | undefined = 'famas'")
await edit(
  'client.ts',
  'import { initializeC4Effects }',
  "import { initializeBurstReview, recordBurstShot } from './burst-review'\nimport { initializeC4Effects }"
)
await edit('client.ts', '  initializeC4Effects()', '  initializeC4Effects()\n  initializeBurstReview()')
await edit(
  'client.ts',
  "    room.send('playerShoot', {",
  "    recordBurstShot({ gun: profile.id, mode: equipped.mode, index: burstIndex, id: shotId, at: currentTime, clip: equipped.ammoClip, held: firing })\n    room.send('playerShoot', {"
)
await edit(
  'server.ts',
  'import { dropDeadPlayer }',
  "import { recordBurstShot } from './burst-review'\nimport { dropDeadPlayer }"
)
await edit(
  'server.ts',
  "      console.log('[SERVER] Shot accepted:'",
  "      recordBurstShot({ gun: profile.id, mode: weapon.mode, index: burstIndex, id: data.shotId, at: scheduledTime, clip: weapon.ammoClip, held: isPlayerTriggerHeld(shooterAddress) })\n      console.log('[SERVER] Shot accepted:'"
)
await writeFile(
  resolve(destination, 'src/burst-review.ts'),
  `import { engine, Entity, TextShape, Transform, inputSystem, InputAction } from '@dcl/sdk/ecs'
import { myProfile, isServer, syncEntity } from '@dcl/sdk/network'
import { PlayerAddress, PlayerHealth, Weapon } from './components'
import { getPractice } from './practice'
import { isFireInputReady } from './client'
type Shot = { gun: string; mode: number; index: number; id: number; at: number; clip: number; held: boolean }
const shots: Shot[] = []
let serverMarker: Entity | undefined
export function recordBurstShot(shot: Shot) {
 shots.push(shot)
 if (shots.length > 200) shots.shift()
 if (isServer()) {
  if (serverMarker === undefined) {
   serverMarker = engine.addEntity()
   Transform.create(serverMarker)
   TextShape.create(serverMarker, { fontSize: 0.001, text: '' })
   syncEntity(serverMarker, [Transform.componentId, TextShape.componentId])
  }
  TextShape.getMutable(serverMarker).text = 'review-burst-server-' + JSON.stringify(shots)
 }
}
export function initializeBurstReview() {
 const marker = engine.addEntity()
 Transform.create(marker)
 engine.addSystem(() => {
  const address = myProfile.userId?.toLowerCase()
  for (const [entity, player] of engine.getEntitiesWith(PlayerAddress)) if (player.address === address) {
   TextShape.createOrReplace(marker, { fontSize: 0.001, text: 'review-burst-client-' + JSON.stringify({ shots, input: { pointer: inputSystem.isPressed(InputAction.IA_POINTER), ready: isFireInputReady() }, weapon: Weapon.getOrNull(entity), health: PlayerHealth.getOrNull(entity), match: getPractice() }) })
  }
 })
}
`
)
console.log(
  'Burst fixture: FAMAS spawn, parked bots and arsenal buy setup; original magazines and firing rules. Read-only client request/server acceptance traces.'
)
