import { inBuyZone } from '../src/buy-zones.ts'
import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const output = mkdtempSync(join(tmpdir(), 'cs16-map-test-'))
const require = createRequire(import.meta.url)
execFileSync(process.execPath, [
  'node_modules/typescript/bin/tsc',
  'src/world-query.ts',
  'src/map-collision.ts',
  'src/team-spawns.ts',
  'src/bomb-sites.ts',
  '--target',
  'es2020',
  '--module',
  'commonjs',
  '--outDir',
  output,
  '--skipLibCheck'
])
const { BOMB_SITES, bombSiteAt } = require(join(output, 'bomb-sites.js'))
const { teamSpawn } = require(join(output, 'team-spawns.js'))
const { mapDistance, boxDistance } = require(join(output, 'world-query.js'))
after(() => rmSync(output, { recursive: true, force: true }))

test('Dust2 spawn has the floor height measured in the engine', () => {
  assert.ok(Math.abs(30 - mapDistance({ x: 95, y: 30, z: 52 }, { x: 0, y: -1, z: 0 }, 40) - 10.026) < 0.001)
})
test('the wall east of spawn blocks shots in the rendered map coordinate system', () => {
  const distance = mapDistance({ x: 95, y: 11.84, z: 52 }, { x: 1, y: 0, z: 0 }, 20)
  assert.ok(distance > 2 && distance < 4, `wall is ${distance}m away`)
})
test('all three encounter positions have unobstructed sight from spawn', () => {
  for (const [x, z] of [
    [88, 50],
    [85, 54],
    [90, 48]
  ]) {
    const direction = { x: x - 95, y: -0.54, z: z - 52 }
    const distance = Math.hypot(direction.x, direction.y, direction.z)
    for (const axis of ['x', 'y', 'z']) direction[axis] /= distance
    assert.equal(mapDistance({ x: 95, y: 11.84, z: 52 }, direction, distance), distance)
  }
})
test('bot hitboxes reject misses and rays behind the shooter', () => {
  const center = { x: 10, y: 1, z: 0 },
    size = { x: 0.4, y: 0.9, z: 0.35 }
  assert.equal(boxDistance({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, center, size), 9.6)
  assert.equal(boxDistance({ x: 0, y: 3, z: 0 }, { x: 1, y: 0, z: 0 }, center, size), undefined)
  assert.equal(boxDistance({ x: 0, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }, center, size), undefined)
})

test('all original team spawns have floor support, standing clearance, and distinct positions', () => {
  for (const team of [1, 2]) {
    const positions = []
    for (let slot = 0; slot < 20; slot++) {
      const { position, yaw } = teamSpawn(team, slot)
      assert.ok(Number.isFinite(yaw))
      assert.ok(position.x > 0 && position.x < 192 && position.z > 0 && position.z < 192)
      const down = mapDistance(position, { x: 0, y: -1, z: 0 }, 1)
      assert.ok(Math.abs(down - 0.08) < 0.002)
      for (const [x, z] of [
        [0, 0],
        [0.25, 0],
        [-0.25, 0],
        [0, 0.25],
        [0, -0.25]
      ]) {
        assert.equal(
          mapDistance({ x: position.x + x, y: position.y, z: position.z + z }, { x: 0, y: 1, z: 0 }, 1.85),
          1.85
        )
      }
      assert.ok(positions.every((other) => Math.hypot(other.x - position.x, other.z - position.z) > 0.6))
      positions.push(position)
    }
  }
  assert.ok(teamSpawn(2, 0).position.z < 60, 'CT spawn lies under A')
  assert.ok(teamSpawn(1, 0).position.z > 130, 'T spawn lies at the opposite end of Dust2')
})

test('both original Dust2 bomb zones contain a walkable planting surface', () => {
  for (const zone of BOMB_SITES) {
    const origin = { x: (zone.min.x + zone.max.x) / 2, y: zone.max.y, z: (zone.min.z + zone.max.z) / 2 }
    const floor = mapDistance(origin, { x: 0, y: -1, z: 0 }, 10)
    assert.ok(floor < 10)
    const feet = { ...origin, y: origin.y - floor + 0.08 }
    assert.equal(bombSiteAt(feet), zone.site)
    assert.equal(mapDistance(feet, { x: 0, y: 1, z: 0 }, 1.8), 1.8)
    assert.equal(bombSiteAt({ ...feet, x: zone.max.x + 1 }), '')
  }
  assert.equal(bombSiteAt({ x: 95, y: 10.026, z: 52 }), '', 'practice courtyard is not a bombsite')
})

test('the clipped corner of the original B trigger cannot be used to plant', () => {
  assert.equal(bombSiteAt({ x: 109.4, y: 10.106, z: 35.8 }), '')
  assert.equal(bombSiteAt({ x: 104.5, y: 10.106, z: 40.7 }), 'B')
})

test('original Dust2 buy volumes contain all team spawns and reject enemy spawns and bomb sites', () => {
  for (const team of [1, 2])
    for (let i = 0; i < 20; i++) {
      const { position } = teamSpawn(team, i)
      assert.equal(inBuyZone(position, team), true, `team ${team} spawn ${i}`)
      assert.equal(inBuyZone(position, team === 1 ? 2 : 1), false)
    }
  for (const position of [
    { x: 32.8375, y: 12.586, z: 46.7017 },
    { x: 104.5175, y: 10.026, z: 40.7284 }
  ]) {
    assert.equal(inBuyZone(position, 1), false)
    assert.equal(inBuyZone(position, 2), false)
  }
})
