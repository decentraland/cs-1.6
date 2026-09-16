import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
const source = fileURLToPath(new URL('../', import.meta.url))
const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination && destination !== resolve(source), 'Pass a new, separate review directory')
assert.ok(relative(source, destination).startsWith('..'), 'Use a directory outside the source project')
let exists = false
try {
  await access(destination)
  exists = true
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
assert.ok(!exists, 'The review directory must not already exist')
await mkdir(destination, { recursive: true })
for (const name of ['src', 'assets', 'scripts', 'package.json', 'tsconfig.json'])
  await cp(resolve(source, name), resolve(destination, name), { recursive: true })
const scene = JSON.parse(await readFile(resolve(source, 'scene.json'), 'utf8'))
scene.multiplayerId = 'cs16-arsenal-' + randomUUID()
scene.worldConfiguration.name = scene.multiplayerId + '.dcl.eth'
scene.display.title = 'CS16 Arsenal Review'
await writeFile(resolve(destination, 'scene.json'), JSON.stringify(scene, null, 2) + '\n')
async function replace(file, from, to) {
  const path = resolve(destination, 'src', file),
    text = await readFile(path, 'utf8')
  assert.ok(text.includes(from), `${file}: review patch still matches`)
  await writeFile(path, text.replace(from, to))
}
await replace('economy-rules.ts', 'START_MONEY = 800', 'START_MONEY = 16000')
await replace(
  'bot-economy.ts',
  "  if (!context.inZone || !context.alive || !context.eligible || context.phase !== 'freeze') return []",
  `  if (round > 0) {
    account.inventory = startingInventory(context.team, context.team === 2 ? 'm4a1' : 'ak47')
    return []
  }`
)
await replace(
  'inventory.ts',
  'SPAWN_PRIMARY: GunId | undefined = undefined',
  "SPAWN_PRIMARY: GunId | undefined = 'awp'"
)
await replace('practice.ts', 'const ROUND_SECONDS = 120', 'const ROUND_SECONDS = 3600')
await replace(
  'practice.ts',
  'function botLoop(now: number) {',
  'function botLoop(now: number) {\n  if (now > 0) return'
)
await replace('economy.ts', 'elapsed: roundElapsed(),', 'elapsed: 0,')
await replace(
  'economy.ts',
  'PlayerMoney.getMutable(player).amount = result.money',
  'PlayerMoney.getMutable(player).amount = 16000'
)
console.log(
  `Created isolated arsenal review at ${destination}. Bots retain fixed review rifles and skip buying; this fixture does not test bot economy. Run npm install, then npm run start:server -- --port 8011 there.`
)
