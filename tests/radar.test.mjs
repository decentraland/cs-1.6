import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const output = mkdtempSync(join(tmpdir(), 'cs16-radar-'))
const require = createRequire(import.meta.url)
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', 'src/radar-rules.ts', '--target', 'es2020', '--module', 'commonjs', '--outDir', output, '--skipLibCheck'])
const { radarPosition, radarMarkers } = require(join(output, 'radar-rules.js'))
after(() => rmSync(output, { recursive: true, force: true }))
const origin = { x: 0, y: 0, z: 0 }, forward = { x: 0, y: 0, z: 1 }
const player = (address, overrides = {}) => ({ address, team: 1, connected: true, alive: true, eligibleRound: 1, position: origin, ...overrides })
test('radar rotates with heading, preserves distance scale and clamps far markers', () => {
  const ahead = radarPosition(origin, { x: 0, y: 0, z: 32 * 2 / 75 }, forward)
  assert.equal(ahead.x, 0); assert.equal(ahead.y, -1)
  const right = radarPosition(origin, { x: 32 * 2 / 75, y: 0, z: 0 }, forward)
  assert.equal(right.x, 1)
  const turned = radarPosition(origin, { x: 10, y: 0, z: 0 }, { x: 1, y: .9, z: 0 })
  assert.equal(turned.x, 0); assert.ok(turned.y < 0)
  const far = radarPosition(origin, { x: 1000, y: 0, z: 1000 }, forward)
  assert.ok(Math.abs(Math.hypot(far.x, far.y) - 64) < 1e-8)
  assert.deepEqual(radarPosition(origin, origin, forward), { x: 0, y: -0, shape: 'dot' })
})
test('height glyph switches at the source 128-unit boundary', () => {
  const at = y => radarPosition(origin, { x: 1, y, z: 0 }, forward).shape
  assert.equal(at(128 * 2 / 75 - .001), 'dot')
  assert.equal(at(128 * 2 / 75), 'above')
  assert.equal(at(-128 * 2 / 75), 'below')
})
test('radar excludes self, enemies, dead, disconnected and waiting players', () => {
  const players = [player('self'), player('friend'), player('enemy', { team: 2 }), player('dead', { alive: false }), player('left', { connected: false }), player('queued', { eligibleRound: 2 })]
  assert.deepEqual(radarMarkers(players, 'self', 1, 1, origin, forward).map(m => m.id), ['friend'])
  assert.deepEqual(radarMarkers(players, 'self', 0, 1, origin, forward), [])
})
test('C4 carrier is red and ground/planted bomb markers are Terrorist-only and flash', () => {
  const players = [player('friend')]
  const bomb = { phase: 'carried', carrier: 'friend', position: origin }
  assert.equal(radarMarkers(players, 'self', 1, 1, origin, forward, bomb)[0].red, true)
  for (const phase of ['dropped', 'planted']) {
    const state = { ...bomb, carrier: '', phase }
    const t = radarMarkers([], 'self', 1, 1, origin, forward, state)
    assert.equal(t.length, 1); assert.equal(t[0].shape, phase === 'planted' ? 'bomb' : 'dot')
    assert.equal(radarMarkers([], 'self', 2, 1, origin, forward, state).length, 0)
    assert.equal(radarMarkers([], 'self', 1, 1, origin, forward, state, false).length, 0)
  }
  for (const phase of ['none', 'defused', 'exploded']) assert.equal(radarMarkers([], 'self', 1, 1, origin, forward, { ...bomb, phase }).length, 0)
})
