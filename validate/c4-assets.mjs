import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root))
const json = async (path) => JSON.parse(await read(path))
const hash = (data) => createHash('sha256').update(data).digest('hex')
const sources = await json('asset-sources/cs16-weapons/c4/sources.json')
for (const source of sources) {
  const bytes = await read(source.path)
  assert.equal(hash(bytes), source.sha256, source.path)
  assert.equal(bytes.length, source.bytes)
}
assert.deepEqual(
  await read('assets/sounds/weapons/original/c4_click.wav'),
  await read('asset-sources/cs16-weapons/c4/c4_click.wav')
)
const models = await json('asset-sources/cs16-weapons/c4/reports.json')
assert.equal(models.length, 4)
for (const [index, model] of models.entries()) {
  const data = await read(model.src)
  assert.equal(hash(data), model.sha256)
  assert.equal(data.length, model.bytes)
  assert.equal(data.toString('ascii', 0, 4), 'glTF')
  assert.equal(data.readUInt32LE(8), data.length)
  const size = data.readUInt32LE(12),
    gltf = JSON.parse(data.toString('utf8', 20, 20 + size)),
    binary = data.subarray(28 + size)
  assert.equal(gltf.scenes.length, 1)
  assert.equal(gltf.cameras?.length ?? 0, 0)
  let triangles = 0
  for (const mesh of gltf.meshes)
    for (const primitive of mesh.primitives) triangles += gltf.accessors[primitive.indices].count / 3
  assert.equal(triangles, [808, 128, 116, 44][index])
  for (const image of gltf.images) assert.ok(image.bufferView !== undefined)
  if (index !== 0) continue
  assert.equal(gltf.skins[0].joints.length, 37)
  assert.ok(model.maxPoseMatrixError < 1e-4)
  assert.equal(gltf.animations.length, 7)
  for (const [name, duration] of Object.entries(model.animations)) {
    const animation = gltf.animations.find((a) => a.name === 'fixed_v_c4 ' + name)
    assert.ok(animation, name)
    let end = 0
    for (const sampler of animation.samplers) {
      const accessor = gltf.accessors[sampler.input],
        view = gltf.bufferViews[accessor.bufferView]
      const at = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
      assert.equal(binary.readFloatLE(at), 0)
      end = Math.max(end, binary.readFloatLE(at + (accessor.count - 1) * 4))
    }
    assert.ok(Math.abs(end - duration) < 1e-5, name)
  }
}
for (const name of ['led', 'fireball']) {
  const atlas = await json(`src/c4-${name}.json`),
    png = await read(atlas.src)
  const source = await read(`asset-sources/cs16-weapons/c4/${name === 'led' ? 'ledglow' : 'zerogxplode'}.spr`)
  assert.equal(hash(source), atlas.sourceSha256)
  assert.equal(hash(png), atlas.sha256)
  assert.equal(png.readUInt32BE(16), atlas.width)
  assert.equal(png.readUInt32BE(20), atlas.height)
  assert.equal(atlas.frames.length, source.readInt32LE(28))
}
console.log('PASS: original C4 view/held/planted/backpack models, 7 animation clips, click audio and 2 source sprites')
