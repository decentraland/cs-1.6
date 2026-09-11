import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const bytes = await readFile(new URL('../assets/scene/weapons/ak47.glb', import.meta.url))
assert.equal(bytes.toString('ascii', 0, 4), 'glTF')
assert.equal(bytes.readUInt32LE(4), 2)
assert.equal(bytes.readUInt32LE(8), bytes.length)
const length = bytes.readUInt32LE(12)
assert.equal(bytes.readUInt32LE(16), 0x4e4f534a)
const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + length))
assert.equal(gltf.scenes.length, 1, 'export contains only the weapon scene')
assert.equal(gltf.meshes.length, 1, 'no map, source-review objects, or bone-display helpers')
assert.equal(gltf.skins.length, 1, 'weapon is rigged')
assert.ok(gltf.skins[0].joints.length >= 2, 'magazine can animate independently')
for (const buffer of gltf.buffers) assert.equal(buffer.uri, undefined, 'geometry is embedded')
for (const image of gltf.images ?? []) assert.ok(image.bufferView !== undefined, 'textures are embedded')
const names = gltf.animations.map((a) => a.name)
for (const name of ['idle', 'draw', 'fire', 'reload']) {
  assert.ok(names.includes(name), `${name} animation exists`)
  assert.ok(gltf.animations.find((a) => a.name === name).channels.length > 0, `${name} has animation data`)
}
let triangles = 0
for (const mesh of gltf.meshes) {
  for (const primitive of mesh.primitives) {
    assert.equal(primitive.mode ?? 4, 4)
    assert.ok(primitive.attributes.NORMAL !== undefined, 'normals are exported')
    assert.ok(primitive.attributes.TEXCOORD_0 !== undefined, 'UVs are exported')
    const position = gltf.accessors[primitive.attributes.POSITION]
    for (const value of [...position.min, ...position.max]) {
      assert.ok(Number.isFinite(value) && Math.abs(value) < 2, 'normalized meter-scale geometry')
    }
    triangles += gltf.accessors[primitive.indices].count / 3
  }
}
assert.ok(triangles < 5000, 'first low-poly weapon geometry budget')
assert.ok(bytes.length < 500_000, 'untextured draft excludes unrelated assets')
console.log(`PASS: AK47 asset — ${triangles} triangles, ${bytes.length} bytes, four clips, embedded geometry`)

const fontAtlas = await readFile(new URL('../assets/ui/score-font.png', import.meta.url))
const font = JSON.parse(await readFile(new URL('../src/score-font.json', import.meta.url), 'utf8'))
assert.equal(fontAtlas.readUInt32BE(16), font.width)
assert.equal(fontAtlas.readUInt32BE(20), font.height)
const rectangles = new Set()
for (const size of [10, 12, 13, 14, 18, 20, 24]) {
  const glyphs = font.fonts[size].glyphs
  for (const character of 'ScoreDeathsLatencyTerroristsCounter-Strike0123456789 …') assert.ok(glyphs[character], `scoreboard font includes ${character}`)
  for (const [x, y, width, height, advance] of Object.values(glyphs)) {
    assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= font.width && y + height <= font.height)
    assert.ok(advance >= 0)
    const key = [x, y, width, height].join(',')
    assert.ok(!rectangles.has(key), 'glyph rectangles can be decoded unambiguously'); rectangles.add(key)
  }
}
console.log(`PASS: CS interface font — ${rectangles.size} glyphs, seven reference sizes`)

const teamMenu = await readFile(new URL('../asset-sources/team-menu/Teammenu.res', import.meta.url))
assert.equal(createHash('sha256').update(teamMenu).digest('hex'), '59c8eb3c66db5d16b7f8d30b8f635eb661c5d1b0e33d16f2bc6e7f0f90c0a433', 'pinned team menu layout')
const dustBriefing = await readFile(new URL('../asset-sources/team-menu/de_dust2.txt', import.meta.url))
assert.equal(createHash('sha256').update(dustBriefing).digest('hex'), '1812e8f86fb19ebfd5d9fc018a2b1c940d6ccafa98cfe0cd7362b319938290ea', 'pinned Dust II briefing')
const teamLogoSource = await readFile(new URL('../asset-sources/team-menu/CS_logo.tga', import.meta.url))
assert.equal(createHash('sha256').update(teamLogoSource).digest('hex'), 'cea5cc96747909253d034be70a5db4f8b7242b23797eeaa422f677bd5cf8b068', 'pinned team title logo')
const teamLogo = await readFile(new URL('../assets/ui/cs-logo.png', import.meta.url))
assert.equal(createHash('sha256').update(teamLogo).digest('hex'), '980765e4885055bc466d4f6858bb1c8e0f68078b722239c3eb6c0562cfbf30ea', 'converted team title logo')
assert.equal(teamLogo.readUInt32BE(16), 64, 'team title logo width')
assert.equal(teamLogo.readUInt32BE(20), 64, 'team title logo height')
console.log('PASS: team menu — pinned layout and 64×64 title logo')

const radar = await readFile(new URL('../assets/ui/radar.png', import.meta.url))
assert.equal(radar.readUInt32BE(16), 128, 'original radar sprite width')
assert.equal(radar.readUInt32BE(20), 128, 'original radar sprite height')
console.log('PASS: radar asset — 128×128 source resolution')

const pain = await readFile(new URL('../assets/ui/pain.png', import.meta.url))
assert.equal(pain.readUInt32BE(16), 352, 'pain compass atlas width')
assert.equal(pain.readUInt32BE(20), 128, 'pain compass atlas height')
const painSource = await readFile(new URL('../asset-sources/hud/640_pain.spr', import.meta.url))
assert.equal(createHash('sha256').update(painSource).digest('hex'), '4c0ed05634761c92f9f9c98f70d0a6686929cc2771f5727233205c41246b7529', 'pinned pain sprite source')
console.log('PASS: pain compass — four source frames in a 352×128 atlas')

const navigation = JSON.parse(await readFile(new URL('../src/navigation.json', import.meta.url), 'utf8'))
const collision = await readFile(new URL('../src/map-collision.ts', import.meta.url))
assert.equal(navigation.sourceSha256, createHash('sha256').update(collision).digest('hex'), 'navigation was generated from current collision geometry')
assert.equal(navigation.positions.length, navigation.links.length)
const visited = new Set([0]), queue = [0]
while (queue.length) {
  const node = queue.pop(), point = navigation.positions[node]
  assert.equal(point.length, 3); assert.ok(point.every(Number.isFinite))
  for (const neighbor of navigation.links[node]) {
    assert.ok(Number.isInteger(neighbor) && neighbor >= 0 && neighbor < navigation.positions.length)
    assert.ok(navigation.links[neighbor].includes(node), 'walking edge is bidirectional')
    const next = navigation.positions[neighbor]
    assert.ok(Math.abs(next[1] - point[1]) <= navigation.step + .001, 'walking step height')
    assert.ok(Math.hypot(next[0] - point[0], next[2] - point[2]) <= navigation.spacing * Math.SQRT2 + .001, 'only adjacent grid cells connect')
    if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor) }
  }
}
assert.equal(visited.size, navigation.positions.length, 'walkable graph is connected')
console.log(`PASS: Dust2 navigation — ${visited.size} connected nodes, current collision source`)
