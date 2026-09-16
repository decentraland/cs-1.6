import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const output = mkdtempSync(join(tmpdir(), 'cs16-spectator-'))
const require = createRequire(import.meta.url)
execFileSync(process.execPath, [
  'node_modules/typescript/bin/tsc',
  'src/spectator-rules.ts',
  '--target',
  'es2020',
  '--module',
  'commonjs',
  '--outDir',
  output,
  '--skipLibCheck'
])
const {
  SpectatorMenuState,
  spectatorTargets,
  matchSpectatorTargets,
  SpectatorCycleInput,
  botSpectatorTargets,
  selectSpectatorTarget,
  chasePosition,
  deathCameraPose,
  CHASE_DISTANCE,
  DEATH_ROLL_DEGREES,
  DEATH_TRANSITION_SECONDS
} = require(join(output, 'spectator-rules.js'))
after(() => rmSync(output, { recursive: true, force: true }))
test('spectators reopen the team menu on Escape, resume without trapping capture, and clear it when joining', () => {
  const menu = new SpectatorMenuState()
  menu.update(true, false)
  assert.equal(menu.open, false, 'initial automatic capture must remain possible')
  menu.update(true, true)
  menu.update(true, false)
  assert.equal(menu.open, true)
  menu.close()
  menu.update(true, false)
  assert.equal(menu.open, false, 'resume waits for asynchronous capture')
  menu.update(true, true)
  menu.update(true, false)
  assert.equal(menu.open, true)
  menu.update(false, false)
  assert.equal(menu.open, false, 'joining a playing team closes observer navigation')
})
const seat = (address, overrides = {}) => ({
  address,
  team: 2,
  connected: true,
  eligibleRound: 1,
  alive: true,
  ...overrides
})

test('spectating admits only living, connected, round-eligible teammates and excludes self', () => {
  const players = [
    seat('self'),
    seat('friend'),
    seat('enemy', { team: 1 }),
    seat('dead', { alive: false }),
    seat('gone', { connected: false }),
    seat('queued', { eligibleRound: 3 })
  ]
  assert.deepEqual(spectatorTargets(players, 'self', 2, 2), ['friend'])
  assert.deepEqual(spectatorTargets(players, 'self', 2, 3), ['friend', 'queued'])
})
test('neutral spectators can chase living players from either side', () => {
  const players = [
    seat('ct'),
    seat('t', { team: 1 }),
    seat('dead-t', { team: 1, alive: false }),
    seat('other-viewer', { team: 0 })
  ]
  assert.deepEqual(spectatorTargets(players, 'viewer', 0, 1), ['ct', 't'])
})
test('neutral spectators cycle humans and bots together while respecting death and eligibility', () => {
  const candidates = [
    seat('human'),
    seat('bot:0', { team: 1 }),
    seat('bot:1', { team: 1, alive: false }),
    seat('bot:2', { team: 1, eligibleRound: 2 })
  ]
  assert.deepEqual(matchSpectatorTargets(candidates, 'viewer', 0, 1), ['human', 'bot:0'])
  assert.deepEqual(matchSpectatorTargets(candidates, 'viewer', 0, 2), ['human', 'bot:0', 'bot:2'])
})
test('team observers prefer teammates and only fall back to bots when none remain', () => {
  const candidates = [
    seat('self', { alive: false }),
    seat('friend'),
    seat('enemy', { team: 1 }),
    seat('bot:0', { team: 1 })
  ]
  assert.deepEqual(matchSpectatorTargets(candidates, 'self', 2, 1), ['friend'])
  candidates[1].alive = false
  assert.deepEqual(matchSpectatorTargets(candidates, 'self', 2, 1), ['bot:0'])
  candidates[3].alive = false
  assert.deepEqual(matchSpectatorTargets(candidates, 'self', 2, 1), [])
})
test('a resume/capture click cannot also change the spectator target', () => {
  const input = new SpectatorCycleInput()
  assert.equal(input.step(false, false, false, false, 0), 0)
  assert.equal(input.step(false, true, true, false, 1), 0)
  assert.equal(input.step(true, true, true, false, 1.02), 0)
  assert.equal(input.step(true, true, false, false, 1.1), 0)
  assert.equal(input.step(true, false, false, false, 1.2), 0)
  assert.equal(input.step(true, true, true, false, 1.3), 1)
  assert.equal(input.step(true, true, false, false, 2), 0)
})
test('automatic spectator capture arms without a release event and reverse clicks retain their cooldown', () => {
  const input = new SpectatorCycleInput()
  assert.equal(input.step(true, false, false, false, 0), 0)
  assert.equal(input.step(true, true, true, true, 1), -1)
  input.step(true, false, false, false, 1.01)
  assert.equal(input.step(true, true, true, false, 1.1), 0)
  input.step(true, false, false, false, 1.15)
  assert.equal(input.step(true, true, true, false, 1.25), 1)
})
test('death/menu transitions discard armed spectator clicks until the held button is released', () => {
  const input = new SpectatorCycleInput()
  input.step(true, false, false, false, 0)
  input.step(false, false, false, false, 1)
  assert.equal(input.step(true, true, true, false, 2), 0)
  input.step(true, false, false, false, 2.1)
  assert.equal(input.step(true, true, true, false, 2.2), 1)
  input.reset()
  assert.equal(input.step(true, true, true, false, 3), 0)
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
  assert.deepEqual(
    botSpectatorTargets([
      { index: 2, alive: true },
      { index: 0, alive: true },
      { index: 1, alive: false }
    ]),
    ['bot:0', 'bot:2']
  )
})
test('chase camera follows target feet at eye height and stays short of a wall', () => {
  const anchor = { x: 4, y: 2, z: 9 },
    direction = { x: 1, y: 0, z: 0 }
  const open = chasePosition(anchor, direction, (_origin, _direction, limit) => limit)
  assert.deepEqual(open, { x: 4 - CHASE_DISTANCE, y: 3.6, z: 9 })
  const wall = chasePosition(anchor, direction, (origin, backwards) => {
    assert.deepEqual(origin, { x: 4, y: 3.6, z: 9 })
    assert.equal(backwards.x, -1)
    return 0.6
  })
  assert.ok(Math.abs(wall.x - 3.55) < 1e-6)
  assert.deepEqual(
    chasePosition(anchor, direction, () => 0.05),
    { x: 4, y: 3.6, z: 9 }
  )
})
test('death camera falls and rolls before the three-second observer handoff', () => {
  const feet = { x: 4, y: 2, z: 9 }
  const start = deathCameraPose(feet, 0)
  assert.deepEqual(start, { position: { x: 4, y: 3.6, z: 9 }, roll: 0, complete: false })
  const falling = deathCameraPose(feet, 0.3)
  assert.ok(falling.position.y < start.position.y)
  assert.ok(falling.roll > 0 && falling.roll < DEATH_ROLL_DEGREES)
  const waiting = deathCameraPose(feet, 0.6)
  assert.ok(Math.abs(waiting.position.y - 2.7) < 1e-6)
  assert.equal(waiting.roll, DEATH_ROLL_DEGREES)
  assert.equal(waiting.complete, false)
  assert.equal(deathCameraPose(feet, DEATH_TRANSITION_SECONDS).complete, true)
})
