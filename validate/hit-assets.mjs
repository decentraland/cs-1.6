import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const manifest = JSON.parse(
  await readFile(new URL('../asset-sources/player-hits/sounds.json', import.meta.url), 'utf8')
)
assert.equal(manifest.files.length, 5)
for (const item of manifest.files) {
  const bytes = await readFile(new URL('../' + item.file, import.meta.url))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256, item.file)
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE')
  assert.equal(item.channels, 1)
  assert.ok(item.url.includes('/' + manifest.sourceRevision + '/server/'))
}
console.log('PASS: five original helmet, Kevlar and headshot clips; pinned source hashes')
