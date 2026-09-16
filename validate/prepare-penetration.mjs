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
  'practice.ts',
  '  const entity = engine.addEntity()\n  botNavigation.set(entity, navigation)',
  '  if (index === 0) navigation.position = {x:71.7592916,y:6.6927,z:67.40143921}\n  const entity = engine.addEntity()\n  botNavigation.set(entity, navigation)'
)
await replace('world-weapons.ts', '  Transform,', '  Transform,\n  TextShape,')
await replace(
  'world-weapons.ts',
  'for (const [, bot, avatar] of engine.getEntitiesWith(Bot, AvatarShape)) {',
  'for (const [entity, bot, avatar] of engine.getEntitiesWith(Bot, AvatarShape)) {\n    TextShape.createOrReplace(entity, {text: `review-bot-${bot.index}-health-${bot.health}`})'
)
const sceneFile = resolve(destination, 'scene.json'),
  scene = JSON.parse(await readFile(sceneFile, 'utf8'))
scene.display.title = 'CS16 Penetration Review'
await writeFile(sceneFile, JSON.stringify(scene, null, 2) + '\n')
console.log(
  'The first bot is stationary behind the original mid door; TextShape exposes its synchronized health for the browser check.'
)
