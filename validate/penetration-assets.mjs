import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const source = JSON.parse(await readFile(new URL('../asset-sources/dust2/bullet-solids-source.json', import.meta.url)))
const bytes = await readFile(new URL('../src/dust2-solids.ts', import.meta.url))
assert.equal(createHash('sha256').update(bytes).digest('hex'), source.generatedSha256)
const materials = await readFile(new URL('../asset-sources/dust2/materials.txt', import.meta.url))
assert.equal(createHash('sha256').update(materials).digest('hex'), source.materials.sha256)
const map = JSON.parse(bytes.toString().split('export const DUST2_SOLIDS: SolidMap = ')[1])
assert.equal(map.sourceSha256, source.bsp.sha256)
assert.equal(map.materialsSha256, source.materials.sha256)
for (const plane of map.planes) {
  assert.equal(plane.length, 4)
  assert.ok(plane.every(Number.isFinite))
  assert.ok(Math.abs(Math.hypot(...plane.slice(0, 3)) - 1) < 1e-5)
}
const node = (n) => Number.isInteger(n) && n >= 0 && n < map.nodes.length
for (const [p, a, b] of map.nodes) {
  assert.ok(Number.isInteger(p) && p >= 0 && p < map.planes.length)
  for (const child of [a, b]) assert.ok(node(child) || child === -1 || child === -2)
}
for (const root of map.roots) assert.ok(node(root))
for (const point of map.vertices) assert.ok(point.length === 3 && point.every(Number.isFinite))
for (const [plane, material, texture, vertices] of map.surfaces) {
  assert.ok(map.planes[plane])
  assert.equal(material.length, 1)
  assert.equal(typeof texture, 'string')
  assert.ok(vertices.length >= 3)
  for (const index of vertices) {
    assert.ok(Number.isInteger(index) && map.vertices[index])
    const p = map.planes[plane],
      v = map.vertices[index]
    assert.ok(Math.abs(p[0] * v[0] + p[1] * v[1] + p[2] * v[2] - p[3]) < 0.002)
  }
}
const visiting = new Set(),
  visited = new Set()
function check(index) {
  if (index < 0 || visited.has(index)) return
  assert.ok(!visiting.has(index), 'acyclic hull')
  visiting.add(index)
  for (const child of map.nodes[index].slice(1)) check(child)
  visiting.delete(index)
  visited.add(index)
}
for (const root of map.roots) check(root)
console.log(
  `PASS: Dust2 bullet hull — ${map.roots.length} solid models, ${map.surfaces.length} original material faces, pinned geometry`
)
