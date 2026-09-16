import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'

const bytes = await readFile(new URL('../assets/scene/weapons/ak47-view.glb', import.meta.url))
const source = await readFile(new URL('../asset-sources/ak47-cs16/fixed_v_ak47.mdl', import.meta.url))
assert.equal(
  createHash('sha256').update(source).digest('hex'),
  '3d0fb45adeb43b78208cccebf13c7ed5041c78e3cb2c9b6a061dbe4b639c1cf7'
)
assert.equal(bytes.toString('ascii', 0, 4), 'glTF')
assert.equal(bytes.readUInt32LE(4), 2)
assert.equal(bytes.readUInt32LE(8), bytes.length)
assert.equal(bytes.readUInt32LE(16), 0x4e4f534a)
const jsonLength = bytes.readUInt32LE(12)
const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength))
assert.equal(bytes.readUInt32LE(24 + jsonLength), 0x004e4942)
const binary = bytes.subarray(28 + jsonLength)
assert.equal(gltf.scenes.length, 1)
assert.equal(gltf.meshes.length, 3, 'gun and both hands are present')
assert.equal(gltf.skins.length, 1)
assert.equal(gltf.skins[0].joints.length, 42, 'complete original rig')
assert.equal(gltf.images.length, 11)
assert.equal(gltf.cameras?.length ?? 0, 0, 'review cameras stay out of the asset')
assert.equal(gltf.extensions?.KHR_lights_punctual, undefined, 'review lights stay out of the asset')
for (const buffer of gltf.buffers) assert.equal(buffer.uri, undefined, 'geometry is embedded')
assert.ok(bytes.length < 800_000, 'one textured low-poly viewmodel')

function view(index) {
  const definition = gltf.bufferViews[index]
  assert.equal(definition.buffer, 0)
  return binary.subarray(definition.byteOffset ?? 0, (definition.byteOffset ?? 0) + definition.byteLength)
}

function floats(index) {
  const accessor = gltf.accessors[index]
  assert.equal(accessor.componentType, 5126)
  assert.equal(accessor.sparse, undefined)
  const dimensions = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[accessor.type]
  assert.ok(dimensions)
  const data = view(accessor.bufferView)
  const stride = gltf.bufferViews[accessor.bufferView].byteStride ?? dimensions * 4
  return Array.from({ length: accessor.count }, (_, i) =>
    Array.from({ length: dimensions }, (_, j) => data.readFloatLE((accessor.byteOffset ?? 0) + i * stride + j * 4))
  )
}

let triangles = 0
for (const mesh of gltf.meshes) {
  for (const primitive of mesh.primitives) {
    assert.equal(primitive.mode ?? 4, 4)
    for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'])
      assert.ok(primitive.attributes[attribute] !== undefined, `${mesh.name} has ${attribute}`)
    triangles += gltf.accessors[primitive.indices].count / 3
    for (const weights of floats(primitive.attributes.WEIGHTS_0)) {
      assert.equal(weights.filter((w) => w === 1).length, 1, 'original rigid bone attachment')
      assert.equal(
        weights.reduce((sum, w) => sum + w, 0),
        1
      )
    }
    for (const position of floats(primitive.attributes.POSITION))
      assert.ok(position.every((v) => Number.isFinite(v) && Math.abs(v) < 2))
  }
}
assert.equal(triangles, 1050, 'original topology budget, including both hands')

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
  assert.deepEqual(palette, source.subarray(pixels + width * height, pixels + width * height + 768), `${name} palette`)
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

const clips = { idle1: 16 / 30, draw: 1, reload: 90 / 37, shoot1: 0.8, shoot2: 0.8, shoot3: 0.8 }
assert.equal(gltf.animations.filter((clip) => !clip.name.endsWith('__repeat')).length, Object.keys(clips).length)
for (const [name, duration] of Object.entries(clips)) {
  const animation = gltf.animations.find((candidate) => candidate.name === `fixed_v_ak47 ${name}`)
  assert.ok(animation, `${name} is exported`)
  assert.equal(animation.channels.length, 84, 'every bone has translation and rotation')
  let end = 0
  const targets = new Set()
  for (const channel of animation.channels) {
    assert.ok(gltf.skins[0].joints.includes(channel.target.node), 'animation targets the exported rig')
    targets.add(`${channel.target.node}:${channel.target.path}`)
    const sampler = animation.samplers[channel.sampler]
    assert.equal(sampler.interpolation, 'LINEAR')
    const times = floats(sampler.input).flat()
    assert.equal(times[0], 0, 'no extra first-frame delay')
    assert.ok(times.every((t, index) => Number.isFinite(t) && (index === 0 || t > times[index - 1])))
    end = Math.max(end, times.at(-1))
    const values = floats(sampler.output)
    assert.equal(values.length, times.length)
    for (const value of values) {
      assert.ok(value.every(Number.isFinite))
      if (channel.target.path === 'rotation') assert.ok(Math.abs(Math.hypot(...value) - 1) < 1e-5)
    }
  }
  assert.equal(targets.size, 84, 'no duplicated bone channels')
  assert.ok(Math.abs(end - duration) < 1e-5, `${name} preserves source frame timing`)
}
console.log(
  `PASS: CS 1.6 AK viewmodel — ${triangles} triangles, 42 bones, 11 pixel-identical textures, six timed clips`
)
