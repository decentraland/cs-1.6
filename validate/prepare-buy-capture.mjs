import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { resolve, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../', import.meta.url))
const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination && relative(source, destination).startsWith('..'), 'Use a new directory outside the scene')
await assert.rejects(access(destination), { code: 'ENOENT' })
await mkdir(destination, { recursive: true })
for (const name of ['src', 'assets', 'scripts', 'package.json', 'package-lock.json', 'tsconfig.json'])
  await cp(resolve(source, name), resolve(destination, name), {
    recursive: true,
    filter: (path) => !basename(path).startsWith('.env')
  })
const scene = JSON.parse(await readFile(resolve(source, 'scene.json'), 'utf8'))
scene.multiplayerId = 'cs16-menu-' + randomUUID()
scene.worldConfiguration.name = scene.multiplayerId + '.dcl.eth'
scene.display.title = 'CS16 Menu Capture'
await writeFile(resolve(destination, 'scene.json'), JSON.stringify(scene, null, 2) + '\n')
async function replace(file, from, to) {
  const path = resolve(destination, 'src', file),
    text = await readFile(path, 'utf8')
  assert.ok(text.includes(from), `${file}: fixture patch still matches`)
  await writeFile(path, text.replace(from, to))
}
await replace('economy-rules.ts', 'START_MONEY = 800', 'START_MONEY = 16000')
await replace('economy-rules.ts', 'BUY_SECONDS = 90', 'BUY_SECONDS = 3600')
await replace('practice.ts', 'const ROUND_SECONDS = 120', 'const ROUND_SECONDS = 3600')
await replace(
  'practice.ts',
  'function botLoop(now: number) {',
  'function botLoop(now: number) {\n  if (now >= 0) return'
)
await writeFile(
  resolve(destination, 'src/menu-capture-review.ts'),
  `
import { engine, TextShape, Transform, PointerLock, inputSystem, InputAction, PointerEventType } from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { room } from './index'
import { getLocalPlayerEntity } from './client'
import { getPractice } from './practice'
import { isBuyMenuVisible } from './buy-client'
import { PlayerMoney, Weapon } from './components'
export function initializeCaptureReview() {
  const marker = engine.addEntity()
  Transform.create(marker, { position: { x: 0, y: -50, z: 0 } })
  let requests = 0, spawns = 0
  room.onMessage('practiceSpawn', data => {
    if (data.playerAddress === myProfile.userId?.toLowerCase()) spawns++
  })
  engine.addSystem(() => {
    if (isBuyMenuVisible() && inputSystem.isTriggered(InputAction.IA_JUMP, PointerEventType.PET_DOWN)) {
      requests++
      room.send('resync', { missedSpawn: true })
    }
    const player = getLocalPlayerEntity()
    TextShape.createOrReplace(marker, { text: 'menu-capture:' + JSON.stringify({
      requests, spawns, round: getPractice()?.round, buy: isBuyMenuVisible(),
      locked: PointerLock.getOrNull(engine.CameraEntity)?.isPointerLocked,
      money: player === null ? undefined : PlayerMoney.getOrNull(player)?.amount,
      clip: player === null ? undefined : Weapon.getOrNull(player)?.ammoClip
    }) })
  })
}
`
)
await replace(
  'index.ts',
  'import { engine, Schemas }',
  "import { initializeCaptureReview } from './menu-capture-review'\nimport { engine, Schemas }"
)
await replace('index.ts', 'setupUI()', 'setupUI()\n    initializeCaptureReview()')
console.log(`Created ${destination}. Install dependencies and run npm run start:server -- --port 8034 there.`)
