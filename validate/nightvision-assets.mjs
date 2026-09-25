import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const manifest = JSON.parse(
  await readFile(new URL('../asset-sources/nightvision/sounds.json', import.meta.url), 'utf8')
)
assert.equal(manifest.files.length, 3)
for (const item of manifest.files) {
  const bytes = await readFile(new URL('../' + item.file, import.meta.url))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256, item.file)
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE')
  assert.equal(item.channels, 1)
  assert.ok(item.url.includes('/' + manifest.sourceRevision + '/server/'))
}
console.log('PASS: three original nightvision clips; pinned source hashes')

const icon = await readFile(new URL('../assets/ui/nightvision.png', import.meta.url))
assert.equal(icon.readUInt32BE(16), 128)
assert.equal(icon.readUInt32BE(20), 128)
assert.equal(icon[25], 6)
