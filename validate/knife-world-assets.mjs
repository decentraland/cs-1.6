import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const root = new URL('../', import.meta.url)
const bytes = (name) => readFile(new URL(name, root))
const hash = (value) => createHash('sha256').update(value).digest('hex')
const manifest = JSON.parse(await bytes('asset-sources/dust2/knife-hull-source.json'))
const bulletSource = JSON.parse(await bytes('asset-sources/dust2/bullet-solids-source.json'))
assert.deepEqual(manifest.bsp, bulletSource.bsp, 'knife and bullet worlds use the same source map')
assert.equal(manifest.hull, 3)
const generated = await bytes(manifest.generatedFile)
assert.equal(hash(generated), manifest.generatedSha256)
assert.equal(generated.length, manifest.generatedBytes)
const text = generated.toString()
const map = JSON.parse(text.slice(text.indexOf('=') + 1))
assert.equal(map.sourceSha256, manifest.bsp.sha256)
assert.equal(map.nodes.length, manifest.nodes)
assert.equal(map.planes.length, manifest.planes)
assert.equal(map.roots.length, manifest.models.length)
assert.equal(map.vertices.length, 0)
assert.equal(map.surfaces.length, 0)
for (const plane of map.planes) {
  assert.equal(plane.length, 4)
  assert.ok(plane.every(Number.isFinite))
  assert.ok(Math.abs(Math.hypot(...plane.slice(0, 3)) - 1) < 1e-5)
}
const visiting = new Set(),
  seen = new Set()
function visit(index) {
  assert.ok(Number.isInteger(index) && index >= -2 && index < map.nodes.length)
  if (index < 0 || seen.has(index)) return
  assert.ok(!visiting.has(index), 'collision graph has no cycles')
  visiting.add(index)
  const node = map.nodes[index]
  assert.equal(node.length, 3)
  assert.ok(Number.isInteger(node[0]) && node[0] >= 0 && node[0] < map.planes.length)
  visit(node[1])
  visit(node[2])
  visiting.delete(index)
  seen.add(index)
}
for (const root of map.roots) visit(root)
assert.equal(seen.size, map.nodes.length, 'export contains only reachable nodes')
for (const [name, expected] of [
  ['asset-sources/dust2/export_knife_hull.py', manifest.exporterSha256],
  ['asset-sources/dust2/sample_knife_hull.py', manifest.samplerSha256],
  ['tests/fixtures/knife-hull.json', manifest.samplesSha256]
])
  assert.equal(hash(await bytes(name)), expected, name)
console.log(`PASS: knife world — original head hull, ${map.nodes.length} nodes, ${map.roots.length} brush models`)
