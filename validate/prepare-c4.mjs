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
const client = resolve(destination, 'src/client.ts')
let source = await readFile(client, 'utf8')
source = source.replace(
  'import { initializeC4Effects }',
  "import { initializeC4Review } from './c4-review'\nimport { initializeC4Effects }"
)
source = source.replace('  initializeC4Effects()', '  initializeC4Effects()\n  initializeC4Review()')
await writeFile(client, source)
await writeFile(
  resolve(destination, 'src/c4-review.ts'),
  `import { engine, TextShape, Transform } from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { PlayerAddress, PlayerInventory, PlayerHealth, PlayerEquipment, Weapon } from './components'
import { getPractice } from './practice'
import { getBomb } from './bomb'
import { getC4Animation } from './bomb-client'
export function initializeC4Review() {
 const marker = engine.addEntity()
 Transform.create(marker)
 engine.addSystem(() => {
  const address = myProfile.userId?.toLowerCase()
  for (const [entity, player] of engine.getEntitiesWith(PlayerAddress)) if (player.address === address) {
   TextShape.createOrReplace(marker, { fontSize: 0.001, text: 'review-c4-' + JSON.stringify({ inventory: PlayerInventory.getOrNull(entity), weapon: Weapon.getOrNull(entity), health: PlayerHealth.getOrNull(entity), equipment: PlayerEquipment.getOrNull(entity), match: getPractice(), bomb: getBomb(), animation: getC4Animation() }) })
  }
 })
}
`
)
const path = resolve(destination, 'scene.json'),
  scene = JSON.parse(await readFile(path, 'utf8'))
scene.display.title = 'CS16 C4 Review'
await writeFile(path, JSON.stringify(scene, null, 2) + '\n')
console.log(
  'C4 fixture: AWP, $16000, stationary bots and extended round. Normal C4, weapons and locomotion; tiny TextShape exposes state.'
)

if (process.argv[3] === 'defuse') {
  const path = resolve(destination, 'src/practice.ts')
  let text = await readFile(path, 'utf8')
  const start = '  const navigation = createBotNavigation(start, dust2Navigation, random, (yaw * 180) / Math.PI)'
  assert.ok(text.includes(start))
  text = text.replace(
    start,
    '  if (team === Team.TERRORIST && botAddress(index) === soloBombCarrier([0, 1, 2], Practice.get(roundEntity).round)) start = { x: 32.8375, y: 12.61, z: 46.7017 }\n' +
      start
  )
  await writeFile(path, text)
  console.log(
    'Defuse fixture additionally spawns only the current stationary Terrorist bomb carrier inside A; the ordinary bot bomb logic plants it.'
  )
}
