import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const output = mkdtempSync(join(tmpdir(), 'cs16-ballistics-'))
const require = createRequire(import.meta.url)
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', 'src/ballistics.ts', '--target', 'es2020', '--module', 'commonjs', '--outDir', output, '--skipLibCheck'])
const { traceShot, fireAkShot, PLAYER_HIT_REGIONS, BOT_HIT_REGIONS } = require(join(output, 'ballistics.js'))
const { freshAccuracy } = require(join(output, 'accuracy.js'))
after(() => rmSync(output, { recursive: true, force: true }))

const feet = { x: 95, y: 10.026, z: 52 }
const eye = { ...feet, y: feet.y + 1.6 }
const west = { x: -1, y: 0, z: 0 }
const human = (id, x) => ({ id, center: { x, y: feet.y, z: feet.z }, regions: PLAYER_HIT_REGIONS })
const aimAt = (from, to) => {
  const delta = { x: to.x-from.x, y: to.y-from.y, z: to.z-from.z }
  const length = Math.hypot(delta.x, delta.y, delta.z)
  return { x: delta.x/length, y: delta.y/length, z: delta.z/length }
}
const fire = (overrides = {}) => fireAkShot({
  feet, aim: west, accuracy: freshAccuracy(), triggerHeld: true,
  speed: 0, now: 100, damage: 36, targets: [human('target', 88)], random: () => 0.5,
  ...overrides
})

test('a hit point near an avatar cannot award damage when the aim points away', () => {
  const target = human('target', 88)
  const claimedPoint = { ...target.center, y: target.center.y + 1.6 }
  assert.ok(Math.hypot(claimedPoint.x-target.center.x, claimedPoint.y-target.center.y, claimedPoint.z-target.center.z) < 2)
  const shot = fire({ targets: [target], aim: { x: 1, y: 0, z: 0 } })
  assert.equal(shot.hit, undefined)
  assert.equal(shot.damage, 0)
})

test('the measured Dust2 east wall stops shots before an avatar behind it', () => {
  const shot = fire({ aim: { x: 1, y: 0, z: 0 }, targets: [human('behind-wall', 103)] })
  assert.equal(shot.hit, undefined)
  assert.ok(shot.distance > 2 && shot.distance < 4)
  assert.ok(shot.position.x < 99)
})

test('the first avatar on the actual ray wins regardless of registry ordering', () => {
  const shot = traceShot(eye, west, [human('far', 83), human('near', 88)])
  assert.deepEqual(shot.hit, { target: 'near', group: 'head' })
  assert.ok(Math.abs(shot.distance - 6.84) < 1e-8)
})

test('human head, body, and leg shots use distinct hit regions and range damage', () => {
  const results = [1.6, 1.0, 0.3].map(y => fire({ aim: aimAt(eye, { x: 88, y: feet.y+y, z: feet.z }) }))
  assert.deepEqual(results.map(result => result.hit?.group), ['head', 'body', 'legs'])
  assert.ok(results[0].damage > 100)
  assert.ok(results[1].damage > results[2].damage)
  assert.ok(results[2].damage > 0)
  assert.deepEqual(results[0].origin, eye, 'origin comes from authoritative feet plus eye height')
})

test('bot geometry keeps its existing head placement through the shared tracer', () => {
  const bot = { id: 'bot', center: { x: 88, y: 10.926, z: 50 }, regions: BOT_HIT_REGIONS }
  const shot = fire({ aim: aimAt(eye, { ...bot.center, y: bot.center.y+0.55 }), targets: [bot] })
  assert.deepEqual(shot.hit, { target: 'bot', group: 'head' })
  assert.ok(shot.damage > 100)
})

test('one shooter spray does not change another shooter first shot', () => {
  const first = freshAccuracy(), second = freshAccuracy()
  for (let index=0; index<15; index++) fire({ accuracy: first, now: 100+index*0.0955 })
  const clean = fire({ accuracy: second, now: 102 })
  const baseline = fire({ now: 102 })
  assert.deepEqual(clean, baseline)
  assert.equal(first.shots, 15)
  assert.equal(second.shots, 1)
})

test('shared firing retains walking accuracy, running and airborne spread penalties, and release recovery', () => {
  const scatter = () => { const samples=[0.5,0.9,0.9,0.9,0.9]; return () => samples.shift() ?? 0.5 }
  const standing = fire({ random: scatter() })
  const walking = fire({ speed: 2.873, random: scatter() })
  const running = fire({ speed: 5.525, random: scatter() })
  const airborne = fire({ feet: { ...feet, y: feet.y+1 }, random: scatter() })
  const deviation = shot => Math.hypot(shot.direction.y, shot.direction.z)
  assert.ok(Math.abs(deviation(standing)-deviation(walking)) < 1e-9)
  assert.ok(walking.pitch > standing.pitch)
  assert.ok(deviation(running) > deviation(walking))
  assert.ok(deviation(airborne) > deviation(running))
  const accuracy = freshAccuracy()
  fire({ accuracy, triggerHeld: false })
  assert.equal(accuracy.held, false, 'buffered shot after release does not stick the trigger')
  assert.equal(accuracy.recoverAt, 100.4)
})

test('invalid aim and nonfinite avatar positions leave recoil state untouched', () => {
  for (const options of [
    { aim: { x: 0, y: 0, z: 0 } },
    { aim: { x: Infinity, y: 0, z: 0 } },
    { feet: { ...feet, y: NaN } }
  ]) {
    const accuracy = freshAccuracy()
    assert.equal(fire({ accuracy, ...options }), undefined)
    assert.deepEqual(accuracy, freshAccuracy())
  }
})
