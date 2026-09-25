import assert from 'node:assert/strict'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

assert.ok(process.argv[2], 'Pass a fixture already created by prepare-touch-controls.mjs')
const target = await realpath(process.argv[2])
assert.notEqual(target, await realpath(fileURLToPath(new URL('../', import.meta.url))))
async function edit(name, from, to) {
  const path = join(target, 'src', name),
    text = await readFile(path, 'utf8')
  assert.ok(text.includes(from), name + ': expected fixture source')
  await writeFile(path, text.replace(from, to))
}
await edit('practice.ts', 'const ROUND_SECONDS = 3600', 'const ROUND_SECONDS = 12')
await edit('practice.ts', 'const RESULT_SECONDS = 5', 'const RESULT_SECONDS = 25')
await edit('practice.ts', 'function botLoop(now: number) {\n  if (now >= 0) return', 'function botLoop(now: number) {')
await edit(
  'practice.ts',
  'target: enemy && !isBombBusy(botAddress(bot.index)) ? enemy.aim : undefined,',
  'target: undefined,'
)
await edit('inventory.ts', 'SPAWN_PRIMARY: GunId | undefined = undefined', "SPAWN_PRIMARY: GunId | undefined = 'm4a1'")
await edit(
  'inventory-rules.ts',
  '  return inventory\n}',
  "  inventory.items.push({ id: 'hegrenade', clip: -1, reserve: 1 })\n  return inventory\n}"
)
await edit('index.ts', 'import { engine', "import { initializeRoundReview } from './round-review'\nimport { engine")
await edit('index.ts', '    setupUI()', '    setupUI()\n    initializeRoundReview()')
await writeFile(
  join(target, 'src/round-review.ts'),
  `
import { engine, TextShape, Transform } from '@dcl/sdk/ecs'
import { getLocalPlayerEntity } from './client'
import { PlayerInventory, PlayerHealth, Weapon, Bot, GrenadeProjectile } from './components'
import { getPractice } from './practice'
export function initializeRoundReview() {
  const marker = engine.addEntity()
  Transform.create(marker)
  engine.addSystem(() => {
    const player = getLocalPlayerEntity()
    if (player === null) return
    const match = getPractice()
    TextShape.createOrReplace(marker, {fontSize: .001, text: 'review-round-' + JSON.stringify({
      match: match && {phase: match.phase, round: match.round, timeLeft: match.timeLeft, ctScore: match.ctScore, tScore: match.tScore},
      weapon: Weapon.getOrNull(player), health: PlayerHealth.getOrNull(player), inventory: PlayerInventory.getOrNull(player),
      bots: [...engine.getEntitiesWith(Bot, Transform)].map(([entity, bot, t]) => ({entity, position: t.position, alive: bot.alive})),
      grenades: [...engine.getEntitiesWith(GrenadeProjectile)].map(([entity, grenade]) => ({entity, kind: grenade.kind, phase: grenade.phase}))
    })})
  })
}
`
)
console.log('Round fixture: forced mobile, M4/HE, 12-second round, 25-second result; moving bots do not shoot.')
