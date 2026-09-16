import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
const root = new URL('../', import.meta.url)
const json = async (path) => JSON.parse(await readFile(new URL(path, root)))
const roundEven = (n) => (n % 1 === 0.5 ? Math.round(n / 2) * 2 : Math.round(n))
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const sources = await json('asset-sources/cs16-weapons/grenades/sources.json')
for (const source of sources) {
  const bytes = await readFile(new URL(source.path, root))
  assert.equal(hash(bytes), source.sha256, source.path)
  assert.equal(bytes.length, source.bytes)
}
const models = await json('asset-sources/cs16-weapons/grenades/projectile-reports.json')
assert.deepEqual(models.map((m) => m.id).sort(), ['flashbang', 'hegrenade', 'smokegrenade'])
for (const model of models) {
  const bytes = await readFile(new URL(model.src, root))
  assert.equal(hash(bytes), model.sha256)
  assert.equal(bytes.length, model.bytes)
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF')
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  const size = bytes.readUInt32LE(12),
    gltf = JSON.parse(bytes.toString('utf8', 20, 20 + size)),
    binary = bytes.subarray(28 + size)
  assert.equal(gltf.skins.length, 1)
  assert.equal(gltf.skins[0].joints.length, model.bones)
  assert.equal(gltf.cameras?.length ?? 0, 0)
  assert.equal(gltf.extensions?.KHR_lights_punctual, undefined)
  assert.ok(model.maxPoseMatrixError < 1e-4)
  let triangles = 0
  for (const mesh of gltf.meshes)
    for (const primitive of mesh.primitives) triangles += gltf.accessors[primitive.indices].count / 3
  assert.equal(triangles, 40)
  assert.equal(gltf.animations.length, 13)
  for (const [clip, duration] of Object.entries(model.animations)) {
    const animation = gltf.animations.find((a) => a.name === model.name + ' ' + clip)
    assert.ok(animation, clip)
    let end = 0
    for (const sampler of animation.samplers) {
      const accessor = gltf.accessors[sampler.input],
        view = gltf.bufferViews[accessor.bufferView]
      const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
      assert.equal(binary.readFloatLE(offset), 0)
      end = Math.max(end, binary.readFloatLE(offset + (accessor.count - 1) * 4))
    }
    assert.ok(Math.abs(end - (clip === 'idle' ? 0 : duration)) < 1e-5)
  }
}
const sprites = await json('asset-sources/cs16-weapons/grenades/sprites.json')
assert.deepEqual(sprites, await json('src/grenade-sprites.json'))
assert.equal(Object.keys(sprites).length, 9)
for (const [name, atlas] of Object.entries(sprites)) {
  const source = await readFile(new URL(`asset-sources/cs16-weapons/grenades/sprites/${name}.spr`, root))
  const png = await readFile(new URL(atlas.src, root))
  assert.equal(hash(source), atlas.sourceSha256)
  assert.equal(hash(png), atlas.sha256)
  assert.equal(png.readUInt32BE(16), atlas.width)
  assert.equal(png.readUInt32BE(20), atlas.height)
  assert.equal(source.toString('ascii', 0, 4), 'IDSP')
  assert.equal(source.readInt32LE(28), atlas.frames.length)
  const chunks = []
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset),
      type = png.toString('ascii', offset + 4, offset + 8)
    if (type === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
  }
  const pixels = inflateSync(Buffer.concat(chunks)),
    stride = atlas.width * 4 + 1
  for (let row = 0; row < atlas.height; row++) assert.equal(pixels[row * stride], 0)
  const colors = source.readUInt16LE(40),
    palette = source.subarray(42, 42 + colors * 3)
  let offset = 42 + colors * 3
  for (const frame of atlas.frames) {
    assert.equal(source.readInt32LE(offset), 0, 'single sprite frame')
    const width = source.readInt32LE(offset + 12),
      height = source.readInt32LE(offset + 16)
    assert.equal(width, frame.width)
    assert.equal(height, frame.height)
    offset += 20
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const index = source[offset + y * width + x],
          sample = pixels.subarray(
            (frame.y + y) * stride + 1 + (frame.x + x) * 4,
            (frame.y + y) * stride + 1 + (frame.x + x) * 4 + 4
          )
        const rgb = palette.subarray(
          (atlas.mode === 2 ? colors - 1 : index) * 3,
          (atlas.mode === 2 ? colors - 1 : index) * 3 + 3
        )
        const alpha = atlas.mode === 2 ? index : Math.max(...rgb)
        const expected =
          atlas.mode === 2
            ? [...rgb, alpha]
            : [...rgb].map((v) => (alpha ? roundEven((v * 255) / alpha) : 0)).concat(alpha)
        assert.deepEqual([...sample], expected, `${name} sprite palette preserved`)
      }
    offset += width * height
  }
}
console.log(
  `PASS: 3 original animated grenade projectiles, 9 source sprite atlases and ${sources.length} source hashes`
)
