import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root))
const manifest = JSON.parse(await read('asset-sources/cs16-weapons/knife/sounds.json'))
assert.equal(manifest.revision, '6ad155c7a610a85cfd443fcace2c97f2afcb2866')
assert.deepEqual(
  manifest.files.map((item) => item.source.split('/').at(-1)),
  [
    'knife_deploy1.wav',
    'knife_hit2.wav',
    'knife_hit3.wav',
    'knife_hit4.wav',
    'knife_slash2.wav',
    'knife_stab.wav',
    'knife_hitwall1.wav'
  ]
)
for (const item of manifest.files) {
  const data = await read(item.file)
  assert.equal(data.toString('ascii', 0, 4), 'RIFF')
  assert.equal(data.toString('ascii', 8, 12), 'WAVE')
  assert.equal(data.length, item.bytes)
  assert.equal(createHash('sha256').update(data).digest('hex'), item.sha256, item.file)
}
console.log('PASS: seven original knife deploy/stab/wall/slash/hit clips, pinned source hashes')
