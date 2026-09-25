import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { resolve, relative, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../', import.meta.url))
const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination && relative(source, destination).startsWith('..'), 'Use a new directory outside the scene')
let exists = false
try {
  await access(destination)
  exists = true
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
assert.ok(!exists, 'The review directory must not already exist')
await mkdir(destination, { recursive: true })
for (const name of ['src', 'assets', 'scripts', 'package.json', 'package-lock.json', 'tsconfig.json'])
  await cp(resolve(source, name), resolve(destination, name), {
    recursive: true,
    filter: (path) => !basename(path).startsWith('.env')
  })
const scene = JSON.parse(await readFile(resolve(source, 'scene.json'), 'utf8'))
scene.multiplayerId = 'cs16-touch-' + randomUUID()
scene.worldConfiguration.name = scene.multiplayerId + '.dcl.eth'
scene.display.title = 'CS16 Touch Review'
await writeFile(resolve(destination, 'scene.json'), JSON.stringify(scene, null, 2) + '\n')
async function replace(file, from, to) {
  const path = resolve(destination, 'src', file),
    text = await readFile(path, 'utf8')
  assert.ok(text.includes(from), `${file}: fixture patch still matches`)
  await writeFile(path, text.replace(from, to))
}
await replace('platform.ts', 'return isMobile()', 'return true')
await replace('economy-rules.ts', 'START_MONEY = 800', 'START_MONEY = 16000')
await replace('economy-rules.ts', 'BUY_SECONDS = 90', 'BUY_SECONDS = 3600')
await replace('practice.ts', 'const ROUND_SECONDS = 120', 'const ROUND_SECONDS = 3600')
await replace(
  'practice.ts',
  'function botLoop(now: number) {',
  'function botLoop(now: number) {\n  if (now >= 0) return'
)
if (process.argv.includes('--no-native-bindings'))
  await replace(
    'touch-controls.tsx',
    'uiInputBinding={{ actions: enabled ? (props.actions ?? []) : [] }}',
    'uiInputBinding={{ actions: [] }}'
  )
console.log(`Created ${destination}. Run npm ci, then npm run start:server -- --port 8034 there.`)
