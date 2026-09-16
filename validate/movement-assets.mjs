import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const manifest = JSON.parse(await readFile(new URL('../asset-sources/movement/sounds.json', import.meta.url), 'utf8'))
const expected = ['step', 'metal', 'dirt', 'duct', 'grate', 'tile', 'slosh', 'snow'].flatMap((kind) =>
  Array.from({ length: kind === 'tile' ? 5 : 4 }, (_, i) => `assets/sounds/movement/pl_${kind}${i + 1}.wav`)
)
assert.deepEqual(manifest.files.map((entry) => entry.file).sort(), expected.sort())
for (const entry of manifest.files) {
  const data = await readFile(new URL('../' + entry.file, import.meta.url))
  assert.equal(data.length, entry.bytes)
  assert.equal(createHash('sha256').update(data).digest('hex'), entry.sha256, entry.file)
  assert.equal(data.toString('ascii', 0, 4), 'RIFF')
  assert.equal(data.toString('ascii', 8, 12), 'WAVE')
  assert.equal(entry.channels, 1, 'original mono spatial clip')
  assert.ok(entry.url.includes('/' + manifest.sourceRevision + '/server/'))
}
console.log(`PASS: movement sounds — ${manifest.files.length} original mono WAV files, pinned source hashes`)
