import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const sources = JSON.parse(
  await readFile(new URL('../asset-sources/cs16-weapons/defuse-kit-sources.json', import.meta.url))
)
assert.equal(sources.length, 2)
for (const item of sources) {
  const data = await readFile(new URL('../' + item.path, import.meta.url))
  assert.equal(createHash('sha256').update(data).digest('hex'), item.sha256)
  assert.equal(data.length, item.bytes)
}
const sound = await readFile(new URL('../assets/sounds/player/original/kit-pickup.wav', import.meta.url))
assert.equal(sound.toString('ascii', 0, 4), 'RIFF')
assert.equal(sound.toString('ascii', 8, 12), 'WAVE')
console.log('PASS: original defuse-kit model and pickup sound source hashes')
