import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination, 'Pass a fresh isolated fixture directory')
execFileSync(process.execPath, [fileURLToPath(new URL('./prepare-c4.mjs', import.meta.url)), destination], {
  stdio: 'inherit'
})
async function edit(name, from, to) {
  const path = resolve(destination, 'src', name),
    source = await readFile(path, 'utf8')
  assert.ok(source.includes(from), name + ': fixture anchor')
  await writeFile(path, source.replace(from, to))
}
await edit('practice.ts', 'const FREEZE_SECONDS = 3', 'const FREEZE_SECONDS = 20')
await edit(
  'bomb.ts',
  'Entity, Transform, GltfContainer, AudioSource',
  'Entity, Transform, GltfContainer, AudioSource, TextShape'
)
await edit(
  'bomb.ts',
  '  entity = engine.addEntity()',
  `  entity = engine.addEntity()
  const review = engine.addEntity();Transform.create(review);syncEntity(review,[TextShape.componentId])
  engine.addSystem(()=>TextShape.createOrReplace(review,{fontSize:.0001,text:'review-toss-'+JSON.stringify({at:Date.now()/1000,motion:dropMotion})}))`
)
await edit('dropped-weapons.ts', 'import { engine, Entity }', 'import { engine, Entity, Transform, TextShape }')
await edit(
  'dropped-weapons.ts',
  '  clearDroppedWeapons()',
  `  clearDroppedWeapons()
  const review=engine.addEntity();Transform.create(review);syncEntity(review,[TextShape.componentId])
  engine.addSystem(()=>TextShape.createOrReplace(review,{fontSize:.0001,text:'review-boxes-'+JSON.stringify([...drops].map(([entity,drop])=>({data:DroppedWeapon.get(entity),motion:drop.motion})))}))`
)
console.log(
  'C4 toss fixture: original drop physics and damage, parked bots, extended freeze, read-only motion diagnostics.'
)
