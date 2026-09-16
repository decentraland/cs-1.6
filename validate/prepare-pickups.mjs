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
  '  if (now > 0) return',
  "  if (![...engine.getEntitiesWith(Weapon)].some(([,weapon]) => weapon.name === 'Knife')) return"
)
await replace(
  'practice.ts',
  '  const entity = engine.addEntity()\n  botNavigation.set(entity, navigation)',
  '  if (index === 0) navigation.position = {x:71.7592916,y:6.6927,z:67.40143921}\n  const entity = engine.addEntity()\n  botNavigation.set(entity, navigation)'
)
await replace(
  'dropped-weapon-view.ts',
  'import { engine, Entity, GltfContainer, Transform }',
  'import { engine, Entity, GltfContainer, Transform, TextShape }'
)
await replace(
  'dropped-weapon-view.ts',
  '      const transform = Transform.getMutable(model)',
  "      TextShape.createOrReplace(model,{text: 'review-drop-'+JSON.stringify({...data}),fontSize:0.001})\n      const transform = Transform.getMutable(model)"
)
await replace('world-weapons.ts', '  Transform,', '  Transform,\n  TextShape,')
await replace(
  'world-weapons.ts',
  'for (const [, bot, avatar] of engine.getEntitiesWith(Bot, AvatarShape)) {',
  "for (const [entity, bot, avatar] of engine.getEntitiesWith(Bot, AvatarShape)) {\n    TextShape.createOrReplace(entity,{text: 'review-bot-'+JSON.stringify({...bot}),fontSize:0.001})"
)
const sceneFile = resolve(destination, 'scene.json'),
  scene = JSON.parse(await readFile(sceneFile, 'utf8'))
scene.display.title = 'CS16 Pickup Review'
await writeFile(sceneFile, JSON.stringify(scene, null, 2) + '\n')
console.log(
  'Bots pause unless a human holds the knife; bot 0 starts behind the middle door. Tiny TextShape fields expose pickup and bot state to the browser check.'
)
