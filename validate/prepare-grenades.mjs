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
async function replace(file, from, to) {
  const path = resolve(destination, 'src', file),
    text = await readFile(path, 'utf8')
  assert.ok(text.includes(from), `${file}: fixture patch matches`)
  await writeFile(path, text.replace(from, to))
}
await replace(
  'economy.ts',
  'PlayerMoney.getMutable(player).amount = 16000',
  'PlayerMoney.getMutable(player).amount = result.money'
)
await replace('grenade-view.ts', '  Animator,', '  Animator,\n  TextShape,')
await replace(
  'grenade-view.ts',
  '      const age = now - data.activated',
  "      TextShape.createOrReplace(view.model, { text: 'review-grenade-' + JSON.stringify({...data}), fontSize: 0.001 })\n      const age = now - data.activated"
)
await replace(
  'client.ts',
  'import { initializeGrenadeViews }',
  "import { initializeGrenadeReview } from './grenade-review'\nimport { initializeGrenadeViews }"
)
await replace('client.ts', '  initializeGrenadeViews()', '  initializeGrenadeViews()\n  initializeGrenadeReview()')
await writeFile(
  resolve(destination, 'src/grenade-review.ts'),
  `import { engine, TextShape, Transform } from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { PlayerAddress, PlayerInventory, PlayerHealth, PlayerMoney, Weapon, GrenadeFlash, Bot } from './components'
import { getPractice } from './practice'
export function initializeGrenadeReview() {
 const marker = engine.addEntity()
 Transform.create(marker)
 engine.addSystem(() => {
  const address = myProfile.userId?.toLowerCase()
  for (const [entity, player] of engine.getEntitiesWith(PlayerAddress)) if (player.address === address) {
   TextShape.createOrReplace(marker, { fontSize: 0.001, text: 'review-state-' + JSON.stringify({ inventory: PlayerInventory.getOrNull(entity), weapon: Weapon.getOrNull(entity), health: PlayerHealth.getOrNull(entity), money: PlayerMoney.getOrNull(entity), match: getPractice(), flashes: [...engine.getEntitiesWith(GrenadeFlash)].map(([, data]) => data), bots: [...engine.getEntitiesWith(Bot, Transform)].map(([, bot, transform]) => ({...bot, position: transform.position})) }) })
  }
 })
}
`
)
const sceneFile = resolve(destination, 'scene.json'),
  scene = JSON.parse(await readFile(sceneFile, 'utf8'))
scene.display.title = 'CS16 Grenade Review'
await writeFile(sceneFile, JSON.stringify(scene, null, 2) + '\n')
console.log(
  'Grenade fixture: $16000 start, AWP, stationary bots, extended round/buy time; normal purchase deductions and grenade rules. Tiny TextShapes expose replicated state.'
)
