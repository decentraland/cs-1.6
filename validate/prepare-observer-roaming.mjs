import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination, 'Pass a new isolated review directory')
execFileSync(process.execPath, [fileURLToPath(new URL('./prepare-spectator-flow.mjs', import.meta.url)), destination], {
  stdio: 'inherit'
})
const file = resolve(destination, 'src/hit-review.ts')
let source = await readFile(file, 'utf8')
for (const [before, after] of [
  ['engine, TextShape,', 'engine, MainCamera, VirtualCamera, TextShape,'],
  ['getSpectatorTarget,', 'getObserverMode, getSpectatorTarget,'],
  [
    'observer:{active:',
    'feet:Transform.getOrNull(engine.PlayerEntity)?.position,view:([...engine.getEntitiesWith(VirtualCamera,Transform)].find(([e])=>e===MainCamera.getOrNull(engine.CameraEntity)?.virtualCameraEntity)?.[2]??Transform.getOrNull(engine.CameraEntity)),observer:{mode:getObserverMode(),active:'
  ]
]) {
  assert.ok(source.includes(before), before + ': diagnostic anchor matches')
  source = source.replace(before, after)
}
await writeFile(file, source)
console.log('Roaming fixture: production spectator/camera/menu code with read-only mode, view and body diagnostics.')
