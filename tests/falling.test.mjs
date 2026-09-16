import assert from 'node:assert/strict'
import test from 'node:test'
import { compile } from './compile.mjs'
const load = compile('fall-rules', 'recoil-prediction')
const { FallTracker, fallDamage, resolveFall, acceptedLandingSpeed } = load('fall-rules')
const { RecoilPrediction } = load('recoil-prediction')

test('CS fall damage starts above 500 HU/s and truncates health damage after the 1.25 multiplier', () => {
  assert.equal(fallDamage(12.5), 0)
  assert.equal(resolveFall(100, 501 * 0.025).damage, 0)
  assert.equal(resolveFall(100, 600 * 0.025).damage, 20)
  assert.equal(resolveFall(100, 740 * 0.025).damage, 50)
  assert.equal(resolveFall(100, 980 * 0.025).health, 0)
  assert.equal(fallDamage(NaN), 0)
  assert.equal(fallDamage(-10), 0)
})

test('the body splat uses strict raw damage versus health, including fractional lethal edge', () => {
  assert.deepEqual(resolveFall(100, 24.5), { damage: 100, health: 0, splat: false })
  assert.equal(resolveFall(100, 24.51).splat, true)
  assert.equal(resolveFall(20, 14.91).splat, true)
  assert.equal(resolveFall(20, 14.89).splat, false)
})

test('a continuous descent produces one landing and no repeated damage while standing', () => {
  const track = new FallTracker()
  track.sample({ x: 0, y: 10, z: 0 }, 0, false)
  track.sample({ x: 0, y: 9, z: 0 }, 0.1, false)
  track.sample({ x: 0, y: 7.5, z: 0 }, 0.2, false)
  const landing = track.sample({ x: 0, y: 6, z: 0 }, 0.3, true)
  assert.ok(Math.abs(landing.speed - 15) < 0.00001)
  for (const at of [0.4, 0.5, 0.6, 1, 2]) assert.equal(track.sample({ x: 0, y: 6, z: 0 }, at, true), undefined)
})

test('network repeats retain the elapsed interval instead of creating a velocity spike', () => {
  const track = new FallTracker()
  track.sample({ x: 0, y: 10, z: 0 }, 0, false)
  track.sample({ x: 0, y: 10, z: 0 }, 0.1, false)
  track.sample({ x: 0, y: 8, z: 0 }, 0.2, false)
  track.sample({ x: 0, y: 8, z: 0 }, 0.3, false)
  const result = track.sample({ x: 0, y: 6, z: 0 }, 0.4, true)
  assert.equal(result.speed, 10)
})

test('uneven arrival timing cannot turn one short interval into excessive fall damage', () => {
  const track = new FallTracker()
  track.sample({ x: 0, y: 10, z: 0 }, 0, false)
  track.sample({ x: 0, y: 8.4, z: 0 }, 0.07, false)
  track.sample({ x: 0, y: 6.8, z: 0 }, 0.2, false)
  const landing = track.sample({ x: 0, y: 5.2, z: 0 }, 0.3, true)
  assert.ok(Math.abs(landing.speed - 16) < 0.00001)
  assert.equal(resolveFall(100, landing.speed).damage, 29)
})

test('ground steps, a direct teleport and a stale resumed sample cannot manufacture a fall', () => {
  const track = new FallTracker()
  track.sample({ x: 0, y: 20, z: 0 }, 0, true)
  assert.equal(track.sample({ x: 0, y: 1, z: 0 }, 0.1, true), undefined)
  track.sample({ x: 0, y: 2, z: 0 }, 0.2, false)
  assert.equal(track.sample({ x: 0, y: 0, z: 0 }, 2, true), undefined)
  for (let i = 0; i < 10; i++) assert.equal(track.sample({ x: 0, y: -i * 0.2, z: 0 }, 2.1 + i * 0.1, true), undefined)
})

test('a matching native landing velocity refines only the server-observed fall', () => {
  const landing = { at: 10, position: { x: 1, y: 2, z: 3 }, speed: 15 }
  assert.equal(acceptedLandingSpeed(landing, { ...landing, sequence: 1, at: 9.9, speed: 16 }), 16)
  for (const changed of [
    { at: 8 },
    { speed: 0 },
    { speed: 40 },
    { speed: NaN },
    { position: { x: 8, y: 2, z: 3 } },
    { position: { x: NaN, y: 2, z: 3 } }
  ])
    assert.equal(acceptedLandingSpeed(landing, { ...landing, sequence: 1, ...changed }), 15)
  assert.equal(acceptedLandingSpeed(landing, undefined), 15, 'missing reports retain server fallback')
})

test('landing clears pitch without discarding spray state or replaying an older confirmed kick', () => {
  const recoil = new RecoilPrediction('ak47', 7)
  recoil.predict(1, 10, 0, true)
  const first = recoil.snapshot()
  assert.ok(first.pitch > 0)
  recoil.clearPitch(10.01)
  assert.equal(recoil.snapshot().pitch, 0)
  assert.equal(recoil.snapshot().shots, first.shots)
  recoil.confirm(1, first, 10.02)
  assert.equal(recoil.punch(10.02).pitch, 0)
  recoil.predict(2, 10.1, 0, true)
  assert.ok(recoil.snapshot().pitch > 0)
})
