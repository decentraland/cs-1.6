import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination, 'Pass a fresh isolated fixture')
execFileSync(
  process.execPath,
  [fileURLToPath(new URL('./prepare-movement.mjs', import.meta.url)), destination, 'bots'],
  { stdio: 'inherit' }
)
const file = resolve(destination, 'src/practice.ts')
let s = await readFile(file, 'utf8')
assert.ok(s.includes('export function initializePractice() {'))
s = s.replace('import { AvatarShape, engine,', 'import { TextShape, AvatarShape, engine,')
s = s.replace(
  'export function initializePractice() {',
  `export function initializePractice() {
 const marker=engine.addEntity();Transform.create(marker);syncEntity(marker,[TextShape.componentId])
 engine.addSystem(()=>{const bots=botEntities.map(entity=>{const movement=botMovements.get(entity);return {bot:Bot.get(entity),position:Transform.get(entity).position,velocity:movement?.velocity,modifier:movement?.modifier}});TextShape.createOrReplace(marker,{fontSize:.0001,text:'review-bot-round-'+JSON.stringify({at:Date.now()/1000,match:getPractice(),bots})})})`
)
await writeFile(file, s)
console.log(
  'Normal bot round: original AI, combat and movement; read-only diagnostics added to the isolated movement fixture.'
)
