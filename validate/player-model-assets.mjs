import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'))
const sources = await json('asset-sources/players/sources.json')
for (const name of ['arctic', 'urban']) {
  const bytes = await readFile(new URL(`assets/scene/players/${name}.glb`, root))
  const report = await json(`asset-sources/players/${name}.json`)
  const runtime = await json(`src/player-${name}.json`)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), report.glbSha256)
  const source = await readFile(new URL(`asset-sources/players/${name}.mdl`, root))
  assert.equal(createHash('sha256').update(source).digest('hex'), report.sourceSha256)
  assert.equal(report.sourceSha256, sources.find((source) => source.name === name).sha256)
  assert.ok(report.maxPoseMatrixError < 0.0001)
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF')
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)))
  assert.equal(gltf.scenes.length, 1)
  assert.equal(gltf.skins.length, 1)
  let triangles = 0
  for (const mesh of gltf.meshes)
    for (const primitive of mesh.primitives) {
      triangles += gltf.accessors[primitive.indices].count / 3
      assert.ok(primitive.attributes.JOINTS_0 !== undefined)
      assert.ok(primitive.attributes.WEIGHTS_0 !== undefined)
      assert.ok(primitive.attributes.TEXCOORD_0 !== undefined)
    }
  assert.equal(triangles, name === 'arctic' ? 721 : 790)
  assert.ok(bytes.length < 5_000_000)
  for (const image of gltf.images) assert.ok(image.bufferView !== undefined)
  const paths = new Set()
  const visit = (index, parent = '') => {
    const node = gltf.nodes[index],
      path = parent ? `${parent}/${node.name}` : node.name
    paths.add(path)
    for (const child of node.children ?? []) visit(child, path)
  }
  for (const node of gltf.scenes[0].nodes) visit(node)
  for (const path of Object.values(runtime.hands)) assert.ok(paths.has(path))
  const animations = new Map(gltf.animations.map((clip) => [clip.name, clip]))
  assert.equal(animations.size, gltf.animations.length)
  for (const clip of Object.keys(runtime.durations)) assert.ok(animations.has(clip), `${name}/${clip}`)
  const targets = (name) => new Set(animations.get(name).channels.map((channel) => channel.target.node))
  const torso = targets('ref_aim_ak47'),
    legs = targets('run'),
    death = targets('head')
  assert.ok(torso.size > 20 && legs.size > 10)
  for (const node of torso) assert.ok(!legs.has(node), 'leg animation cannot override the gun pose')
  for (const node of [...torso, ...legs]) assert.ok(death.has(node), 'death animates the whole skeleton')
  assert.equal(runtime.boxes.length, 20, 'inactive shield hitbox excluded')
  assert.ok(report.idleBounds.max[1] < 1.6 && report.idleBounds.min[1] > -0.03)
  console.log(
    `PASS: ${name} player — ${triangles} triangles, ${animations.size} clips, source skeleton/hitboxes, two hand anchors`
  )
}
