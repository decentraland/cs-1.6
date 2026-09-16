import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { inflateSync } from 'node:zlib'
import { DEATH_ICONS } from '../src/death-icons.ts'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('asset-sources/hud/death-icons.json', root), 'utf8'))
for (const [file, hash] of Object.entries(manifest.files)) {
  const bytes = await readFile(new URL(file, root))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, file + ': pinned source')
}
const rows = (await readFile(new URL('asset-sources/hud/hud.txt', root), 'utf8'))
  .split(/\r?\n/)
  .map((line) => line.trim().split(/\s+/))
  .filter((p) => p.length === 7 && p[0].startsWith('d_') && p[1] === '640')
assert.equal(Object.keys(DEATH_ICONS).length, rows.length)
for (const [name, , sprite, ...values] of rows)
  assert.deepEqual(DEATH_ICONS[name.slice(2)], { sprite, rect: values.map(Number) })
for (const sprite of new Set(rows.map((row) => row[2]))) {
  const source = await readFile(new URL(`asset-sources/hud/${sprite}.spr`, root))
  const png = await readFile(new URL(`assets/ui/death-${sprite}.png`, root))
  const colors = source.readUInt16LE(40),
    offset = 42 + colors * 3
  const width = source.readInt32LE(offset + 12),
    height = source.readInt32LE(offset + 16)
  assert.equal(png.readUInt32BE(16), width)
  assert.equal(png.readUInt32BE(20), height)
  const chunks = []
  for (let cursor = 8; cursor < png.length;) {
    const length = png.readUInt32BE(cursor)
    if (png.toString('ascii', cursor + 4, cursor + 8) === 'IDAT')
      chunks.push(png.subarray(cursor + 8, cursor + 8 + length))
    cursor += length + 12
  }
  const pixels = inflateSync(Buffer.concat(chunks))
  assert.equal(pixels.length, height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    assert.equal(pixels[y * (width * 4 + 1)], 0)
    for (let x = 0; x < width; x++) {
      const index = source[offset + 20 + y * width + x],
        intensity = source[42 + index * 3]
      const at = y * (width * 4 + 1) + 1 + x * 4
      assert.deepEqual(
        [...pixels.subarray(at, at + 4)],
        [intensity ? 255 : 0, intensity ? 255 : 0, intensity ? 255 : 0, intensity]
      )
    }
  }
}
console.log('PASS: 30 original death icons; pinned sprite rectangles and palette coverage')
