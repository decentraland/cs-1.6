import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'

const manifest = JSON.parse(await readFile(new URL('../asset-sources/cs16-weapons/manifest.json', import.meta.url)))
let checked = 0
for (const [id, model] of Object.entries(manifest)) {
  const bytes = await readFile(new URL('../' + model.src, import.meta.url))
  const source = await readFile(new URL('../asset-sources/cs16-weapons/fixed_v_' + id + '.mdl', import.meta.url))
  const report = JSON.parse(
    await readFile(new URL('../asset-sources/cs16-weapons/fixed_v_' + id + '.json', import.meta.url))
  )
  assert.equal(createHash('sha256').update(source).digest('hex'), report.sourceSha256, id + ' source hash')
  assert.ok(report.maxPoseMatrixError < 1e-4, id + ' bone animation conversion')
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF')
  assert.equal(bytes.readUInt32LE(4), 2)
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a)
  const jsonLength = bytes.readUInt32LE(12)
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength))
  assert.equal(bytes.readUInt32LE(24 + jsonLength), 0x004e4942)
  const binary = bytes.subarray(28 + jsonLength)
  assert.equal(gltf.scenes.length, 1)
  assert.ok(gltf.meshes.length >= 1)
  assert.equal(gltf.skins.length, 1)
  assert.equal(gltf.skins[0].joints.length, report.bones, id + ' complete original rig')
  assert.equal(gltf.images.length, report.textures)
  assert.equal(gltf.cameras?.length ?? 0, 0, 'review cameras stay out of the asset')
  assert.equal(gltf.extensions?.KHR_lights_punctual, undefined, 'review lights stay out of the asset')
  for (const buffer of gltf.buffers) assert.equal(buffer.uri, undefined, 'geometry is embedded')
  assert.ok(bytes.length < 2_000_000, 'one textured low-poly viewmodel')

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
  assert.equal(triangles, report.triangles, id + ' original topology budget')
  assert.equal(report.skippedDegenerateTriangles ?? 0, id === 'famas' ? 2 : 0)

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

  const clips = { ...report.animations }
  for (const [name, duration] of Object.entries(report.animations))
    if (!name.startsWith('idle')) clips[name + '__repeat'] = duration
  assert.equal(gltf.animations.length, Object.keys(clips).length)
  for (const [name, duration] of Object.entries(clips)) {
    const animation = gltf.animations.find((candidate) => candidate.name === `fixed_v_${id} ${name}`)
    assert.ok(animation, `${name} is exported`)
    assert.equal(animation.channels.length, report.bones * 2, 'every bone has translation and rotation')
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
    assert.equal(targets.size, report.bones * 2, 'no duplicated bone channels')
    assert.ok(Math.abs(end - duration) < 1e-5, `${name} preserves source frame timing`)
  }
  checked++
}
console.log(
  `PASS: ${checked} original CS 1.6 viewmodels — complete rigs, pixel-identical textures, timed animations and repeat tracks`
)

let worldTriangles = 0
const heldParts = Object.keys(manifest).flatMap((id) =>
  id === 'elite'
    ? [
        { id, part: id },
        { id, part: 'elite-left' }
      ]
    : [{ id, part: id }]
)
for (const { id, part } of heldParts) {
  const report = JSON.parse(await readFile(new URL(`../asset-sources/cs16-weapons/p_${part}.json`, import.meta.url)))
  const source = await readFile(new URL(`../asset-sources/cs16-weapons/p_${id}.mdl`, import.meta.url))
  assert.equal(createHash('sha256').update(source).digest('hex'), report.sourceSha256, id + ' held model source')
  const bytes = await readFile(new URL(`../assets/scene/weapons/${part}-world.glb`, import.meta.url))
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF')
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  assert.equal(bytes.length, report.bytes)
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)))
  assert.equal(gltf.skins?.length ?? 0, 0)
  assert.equal(gltf.animations?.length ?? 0, 0)
  assert.equal(gltf.cameras?.length ?? 0, 0)
  assert.equal(report.anchor, part === 'elite-left' ? 'Bip01 L Hand' : 'Bip01 R Hand')
  for (const buffer of gltf.buffers) assert.equal(buffer.uri, undefined)
  for (const image of gltf.images) assert.ok(image.bufferView !== undefined)
  let triangles = 0
  for (const mesh of gltf.meshes)
    for (const primitive of mesh.primitives) {
      triangles += gltf.accessors[primitive.indices].count / 3
      for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0'])
        assert.ok(primitive.attributes[attribute] !== undefined)
      const positions = gltf.accessors[primitive.attributes.POSITION]
      assert.ok([...positions.min, ...positions.max].every((v) => Number.isFinite(v) && Math.abs(v) < 2))
      if (id === 'elite')
        assert.ok(
          [...positions.min, ...positions.max].every((v) => Math.abs(v) < 0.3),
          'each pistol is local to its own hand'
        )
    }
  assert.equal(triangles, report.triangles)
  if (id === 'elite') {
    assert.equal(triangles, 104, 'one original pistol per hand')
    assert.equal(source.readInt32LE(180), 1)
    assert.equal(gltf.images.length, 1)
    const texture = source.readInt32LE(184),
      width = source.readInt32LE(texture + 68),
      height = source.readInt32LE(texture + 72),
      pixels = source.readInt32LE(texture + 76),
      binary = bytes.subarray(28 + bytes.readUInt32LE(12)),
      view = gltf.bufferViews[gltf.images[0].bufferView],
      png = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
    assert.equal(png.readUInt32BE(16), width)
    assert.equal(png.readUInt32BE(20), height)
    assert.equal(png[24], 8)
    assert.equal(png[25], 3)
    const compressed = []
    let palette
    for (let at = 8; at < png.length;) {
      const length = png.readUInt32BE(at),
        type = png.toString('ascii', at + 4, at + 8),
        data = png.subarray(at + 8, at + 8 + length)
      if (type === 'PLTE') palette = data
      if (type === 'IDAT') compressed.push(data)
      at += length + 12
    }
    assert.deepEqual(
      palette,
      source.subarray(pixels + width * height, pixels + width * height + 768),
      part + ' original palette'
    )
    const rows = inflateSync(Buffer.concat(compressed))
    assert.equal(rows.length, (width + 1) * height)
    for (let y = 0; y < height; y++) {
      const row = y * (width + 1)
      assert.equal(rows[row], 0)
      assert.deepEqual(
        rows.subarray(row + 1, row + 1 + width),
        source.subarray(pixels + y * width, pixels + (y + 1) * width),
        part + ' original pixels'
      )
    }
  }
  worldTriangles += triangles
}
assert.ok(worldTriangles < 4000)
let mediaChecked = 0
for (const name of ['stock-media', 'animation-media', 'world-sources']) {
  const sources = JSON.parse(await readFile(new URL(`../asset-sources/cs16-weapons/${name}.json`, import.meta.url)))
  for (const source of sources) {
    const bytes = await readFile(new URL('../' + source.path, import.meta.url))
    assert.equal(bytes.length, source.bytes, source.path)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256, source.path)
    mediaChecked++
  }
}
console.log(
  `PASS: ${checked} held weapons / ${heldParts.length} hand models (${worldTriangles} triangles total), ${mediaChecked} original media/source hashes`
)
