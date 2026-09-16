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
await edit('inventory.ts', "SPAWN_PRIMARY: GunId | undefined = 'awp'", "SPAWN_PRIMARY: GunId | undefined = 'm4a1'")
await edit('systems.ts', '    ammoClip: clip,', '    ammoClip: Math.min(clip, 3),')
await edit(
  'client.ts',
  'import { initializeC4Effects }',
  "import { initializeReloadReview } from './reload-review'\nimport { initializeC4Effects }"
)
await edit('client.ts', '  initializeC4Effects()', '  initializeC4Effects()\n  initializeReloadReview()')
await writeFile(
  resolve(destination, 'src/reload-review.ts'),
  `import { engine, TextShape, Transform, inputSystem, InputAction } from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { PlayerAddress, PlayerInventory, PlayerHealth, Weapon } from './components'
import { getPractice } from './practice'
import { isFireInputReady } from './client'
export function initializeReloadReview() {
 const marker = engine.addEntity()
 Transform.create(marker)
 engine.addSystem(() => {
  const address = myProfile.userId?.toLowerCase()
  for (const [entity, player] of engine.getEntitiesWith(PlayerAddress)) if (player.address === address) {
   TextShape.createOrReplace(marker, { fontSize: 0.001, text: 'review-reload-' + JSON.stringify({ input: { pointer: inputSystem.isPressed(InputAction.IA_POINTER), ready: isFireInputReady() }, inventory: PlayerInventory.getOrNull(entity), weapon: Weapon.getOrNull(entity), health: PlayerHealth.getOrNull(entity), match: getPractice() }) })
  }
 })
}
`
)
console.log(
  'Empty-reload fixture: M4A1 spawn; newly equipped guns start with at most three loaded rounds. Production capacity, reserve, reload, trigger, cadence and buy rules; read-only input/state diagnostics.'
)
