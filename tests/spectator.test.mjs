import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const output = mkdtempSync(join(tmpdir(), 'cs16-spectator-'))
const require = createRequire(import.meta.url)
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', 'src/spectator-rules.ts', '--target', 'es2020', '--module', 'commonjs', '--outDir', output, '--skipLibCheck'])
const { spectatorTargets, botSpectatorTargets, selectSpectatorTarget, chasePosition, deathCameraPose, CHASE_DISTANCE, DEATH_ROLL_DEGREES, DEATH_TRANSITION_SECONDS } = require(join(output, 'spectator-rules.js'))
after(() => rmSync(output, { recursive: true, force: true }))
const seat = (address, overrides = {}) => ({ address, team: 2, connected: true, eligibleRound: 1, alive: true, ...overrides })

test('spectating admits only living, connected, round-eligible teammates and excludes self', () => {
  const players = [seat('self'), seat('friend'), seat('enemy', { team: 1 }), seat('dead', { alive: false }), seat('gone', { connected: false }), seat('queued', { eligibleRound: 3 })]
  assert.deepEqual(spectatorTargets(players, 'self', 2, 2), ['friend'])
  assert.deepEqual(spectatorTargets(players, 'self', 2, 3), ['friend', 'queued'])
})
test('neutral spectators can chase living players from either side', () => {
  const players = [seat('ct'), seat('t', { team: 1 }), seat('dead-t', { team: 1, alive: false }), seat('other-viewer', { team: 0 })]
  assert.deepEqual(spectatorTargets(players, 'viewer', 0, 1), ['ct', 't'])
})
test('next and previous targets wrap, preserve a valid target, and recover from target loss', () => {
  assert.equal(selectSpectatorTarget(['a', 'b'], undefined), 'a')
  assert.equal(selectSpectatorTarget(['a', 'b'], 'a'), 'a')
  assert.equal(selectSpectatorTarget(['a', 'b'], 'a', -1), 'b')
  assert.equal(selectSpectatorTarget(['a', 'b'], 'b', 1), 'a')
  assert.equal(selectSpectatorTarget(['b'], 'a'), 'b')
  assert.equal(selectSpectatorTarget([], 'a'), undefined)
})
test('solo spectating follows living bots in stable index order', () => {
  assert.deepEqual(botSpectatorTargets([{ index: 2, alive: true }, { index: 0, alive: true }, { index: 1, alive: false }]), ['bot:0', 'bot:2'])
})
test('chase camera follows target feet at eye height and stays short of a wall', () => {
  const anchor = { x: 4, y: 2, z: 9 }, direction = { x: 1, y: 0, z: 0 }
  const open = chasePosition(anchor, direction, (_origin, _direction, limit) => limit)
  assert.deepEqual(open, { x: 4 - CHASE_DISTANCE, y: 3.6, z: 9 })
  const wall = chasePosition(anchor, direction, (origin, backwards) => {
    assert.deepEqual(origin, { x: 4, y: 3.6, z: 9 })
    assert.equal(backwards.x, -1)
    return .6
  })
  assert.ok(Math.abs(wall.x - 3.55) < 1e-6)
  assert.deepEqual(chasePosition(anchor, direction, () => .05), { x: 4, y: 3.6, z: 9 })
})
test('death camera falls and rolls before the three-second observer handoff', () => {
  const feet = { x: 4, y: 2, z: 9 }
  const start = deathCameraPose(feet, 0)
  assert.deepEqual(start, { position: { x: 4, y: 3.6, z: 9 }, roll: 0, complete: false })
  const falling = deathCameraPose(feet, .3)
  assert.ok(falling.position.y < start.position.y)
  assert.ok(falling.roll > 0 && falling.roll < DEATH_ROLL_DEGREES)
  const waiting = deathCameraPose(feet, .6)
  assert.ok(Math.abs(waiting.position.y - 2.7) < 1e-6)
  assert.equal(waiting.roll, DEATH_ROLL_DEGREES)
  assert.equal(waiting.complete, false)
  assert.equal(deathCameraPose(feet, DEATH_TRANSITION_SECONDS).complete, true)
})
