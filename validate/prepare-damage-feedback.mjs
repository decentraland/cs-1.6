import assert from 'node:assert/strict'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.argv[2]) throw new Error('Usage: node validate/prepare-damage-feedback.mjs <isolated-scene-copy>')
const target = await realpath(process.argv[2])
const project = await realpath(fileURLToPath(new URL('../', import.meta.url)))
assert.notEqual(target, project, 'damage feedback fixture must not modify the playable checkout')
const path = join(target, 'src/bot-combat.ts')
let source = await readFile(path, 'utf8')
const production = 'fireRate: profile.fireRate'
assert.ok(source.includes(production), 'expected production bot fire interval')
source = source.replace(production, 'fireRate: 0.5')
await writeFile(path, source)
console.log(
  'Isolated fixture: bot shots spaced to 500 ms for pain-sprite capture; damage and feedback remain unchanged.'
)
