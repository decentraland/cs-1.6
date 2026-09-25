import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { inflateSync } from 'node:zlib'

const root = new URL('../', import.meta.url)
const bytes = (path) => readFile(new URL(path, root))
const json = async (path) => JSON.parse(await bytes(path))
const hash = (data) => createHash('sha256').update(data).digest('hex')
const manifest = await json('asset-sources/cs16-weapons/impacts/sources.json')
assert.equal(manifest.revision, '6ad155c7a610a85cfd443fcace2c97f2afcb2866')
assert.equal(manifest.files.length, 9)
for (const item of manifest.files) {
  const data = await bytes(item.file)
  assert.equal(data.length, item.bytes, item.file)
  assert.equal(hash(data), item.sha256, item.file)
  if (item.file.endsWith('.wav')) assert.equal(data.toString('ascii', 0, 4), 'RIFF')
}
const source = await bytes('asset-sources/cs16-weapons/impacts/decals.wad')
const atlas = await json('src/bullet-decals.json')
assert.deepEqual(atlas, await json('asset-sources/cs16-weapons/impacts/atlas.json'))
assert.equal(hash(source), atlas.sourceSha256)
const png = await bytes(atlas.src)
assert.equal(hash(png), atlas.sha256)
assert.equal(png.readUInt32BE(16), atlas.width)
assert.equal(png.readUInt32BE(20), atlas.height)
assert.deepEqual(
  atlas.frames.map((frame) => frame.name),
  ['{shot1', '{shot2', '{shot3', '{shot4', '{shot5']
)
const chunks = []
for (let offset = 8; offset < png.length;) {
  const length = png.readUInt32BE(offset)
  if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
    chunks.push(png.subarray(offset + 8, offset + 8 + length))
  offset += length + 12
}
const pixels = inflateSync(Buffer.concat(chunks)),
  stride = atlas.width * 4 + 1
for (let row = 0; row < atlas.height; row++) assert.equal(pixels[row * stride], 0)
const count = source.readUInt32LE(4),
  directory = source.readUInt32LE(8),
  entries = new Map()
for (let i = 0; i < count; i++) {
  const at = directory + i * 32,
    name = source.toString('ascii', at + 16, at + 32).split('\0')[0]
  entries.set(name, source.readUInt32LE(at))
}
for (const frame of atlas.frames) {
  const start = entries.get(frame.name)
  assert.ok(start !== undefined, frame.name)
  const width = source.readUInt32LE(start + 16),
    height = source.readUInt32LE(start + 20)
  assert.equal(frame.width, width)
  assert.equal(frame.height, height)
  const image = start + source.readUInt32LE(start + 24)
  const palette = start + source.readUInt32LE(start + 36) + (width * height) / 64 + 2
  const color = [...source.subarray(palette + 765, palette + 768)]
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = (frame.y + y) * stride + 1 + (frame.x + x) * 4
      assert.deepEqual([...pixels.subarray(at, at + 4)], [...color, source[image + y * width + x]], frame.name)
    }
}
console.log('PASS: five original bullet-hole decals, exact gradient-alpha pixels, eight pinned ricochet sounds')
