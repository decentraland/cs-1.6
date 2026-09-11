import assert from 'node:assert/strict'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.argv[2]) throw new Error('Usage: node validate/prepare-feedback-latency.mjs <isolated-scene-copy>')
const target = await realpath(process.argv[2])
const project = await realpath(fileURLToPath(new URL('../', import.meta.url)))
assert.notEqual(target, project, 'latency fixture must not modify the playable checkout')
const path = join(target, 'src/server.ts')
let source = await readFile(path, 'utf8')
const start = "      room.send('practiceShot', {"
const end = 'right: state.accuracy.right\n      })'
assert.ok(source.includes(start) && source.includes(end), 'expected unmodified shot-feedback block')
source = source.replace(start, "      const shotFeedback = {")
source = source.replace(end, "right: state.accuracy.right\n      }\n      delay(400, () => room.send('practiceShot', shotFeedback))")
await writeFile(path, source)
console.log('Isolated fixture: shot acknowledgements and impacts delayed by 400 ms; damage and ammo remain immediate.')
