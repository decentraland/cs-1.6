import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
const sources = JSON.parse(
  await readFile(new URL('../asset-sources/cs16-weapons/dropped-sources.json', import.meta.url))
)
const roster = JSON.parse(await readFile(new URL('../asset-sources/cs16-weapons/manifest.json', import.meta.url)))
assert.deepEqual(
  sources.map((s) => s.id).sort(),
  [...Object.keys(roster), 'thighpack']
    .filter((id) => !['knife', 'hegrenade', 'flashbang', 'smokegrenade'].includes(id))
    .sort()
)
let total = 0
for (const item of sources) {
  const source = await readFile(new URL(`../asset-sources/cs16-weapons/w_${item.id}.mdl`, import.meta.url))
  assert.equal(createHash('sha256').update(source).digest('hex'), item.sourceSha256)
  const bytes = await readFile(new URL('../' + item.src, import.meta.url))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256)
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF')
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  const length = bytes.readUInt32LE(12),
    gltf = JSON.parse(bytes.toString('utf8', 20, 20 + length)),
    binary = bytes.subarray(28 + length)
  const view = (index) => {
    const v = gltf.bufferViews[index]
    return binary.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)
  }
  assert.equal(gltf.scenes.length, 1)
  assert.equal(gltf.skins?.length ?? 0, 0)
  assert.equal(gltf.animations?.length ?? 0, 0)
  assert.equal(gltf.cameras?.length ?? 0, 0)
  assert.equal(gltf.extensions?.KHR_lights_punctual, undefined)
  let triangles = 0
  for (const mesh of gltf.meshes)
    for (const primitive of mesh.primitives) {
      assert.equal(primitive.mode ?? 4, 4)
      for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0'])
        assert.notEqual(primitive.attributes[attribute], undefined)
      triangles += gltf.accessors[primitive.indices].count / 3
      const position = gltf.accessors[primitive.attributes.POSITION]
      assert.ok([...position.min, ...position.max].every((v) => Number.isFinite(v) && Math.abs(v) < 2))
      assert.ok(position.max[1] - position.min[1] < 0.2, 'original ground pose is flat')
    }
  assert.equal(triangles, item.report.triangles)
  assert.equal(bytes.length, item.report.bytes)
  total += triangles
  const textureCount = source.readInt32LE(180)
  const textureOffset = source.readInt32LE(184)
  assert.equal(textureCount, gltf.images.length)
  for (let index = 0; index < textureCount; index++) {
    const offset = textureOffset + index * 80
    const name = source.toString('latin1', offset, offset + 64).split('\0')[0]
    const width = source.readInt32LE(offset + 68)
    const height = source.readInt32LE(offset + 72)
    const pixels = source.readInt32LE(offset + 76)
    const image = gltf.images.find((candidate) => candidate.name === name)
    assert.ok(image?.bufferView !== undefined, `${name} is embedded`)
    const png = view(image.bufferView)
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(png.readUInt32BE(16), width)
    assert.equal(png.readUInt32BE(20), height)
    assert.equal(png[24], 8)
    assert.equal(png[25], 3, 'original indexed PNG')
    const compressed = []
    let palette
    for (let at = 8; at < png.length;) {
      const length = png.readUInt32BE(at)
      const type = png.toString('ascii', at + 4, at + 8)
      const data = png.subarray(at + 8, at + 8 + length)
      if (type === 'PLTE') palette = data
      if (type === 'IDAT') compressed.push(data)
      at += length + 12
    }
    assert.deepEqual(
      palette,
      source.subarray(pixels + width * height, pixels + width * height + 768),
      `${name} palette`
    )
    const rows = inflateSync(Buffer.concat(compressed))
    assert.equal(rows.length, (width + 1) * height)
    for (let y = 0; y < height; y++) {
      const row = y * (width + 1)
      assert.equal(rows[row], 0, 'lossless converter stores unfiltered rows')
      assert.deepEqual(
        rows.subarray(row + 1, row + 1 + width),
        source.subarray(pixels + y * width, pixels + (y + 1) * width),
        `${name} row ${y}`
      )
    }
  }
}
assert.equal(total, 3125)
console.log(
  `PASS: ${sources.length} ground weapon/equipment models, ${total} triangles, original palette pixels and pinned source hashes`
)
