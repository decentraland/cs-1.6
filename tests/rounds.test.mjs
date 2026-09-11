import assert from 'node:assert/strict'
import { test } from 'node:test'
import { finishRound } from '../src/round-rules.ts'
import { akSpread, rangedDamage, freshAccuracy, setTrigger, recoverAccuracy, kickBack } from '../src/accuracy.ts'

test('a round awards one point; repeated result processing cannot inflate the score', () => {
  const state = { phase: 'live', ctScore: 0, tScore: 0, maxWins: 16, matchOver: false, timeLeft: 50 }
  assert.equal(finishRound(state, 'ct'), true)
  assert.equal(state.ctScore, 1)
  assert.equal(state.timeLeft, 5)
  assert.equal(finishRound(state, 't'), false)
  assert.equal(state.tScore, 0)
  state.phase = 'live'
  finishRound(state, 't')
  assert.equal(state.ctScore, 1)
  assert.equal(state.tScore, 1)
})

test('match ends at sixteen wins and cannot award a point during freeze or waiting', () => {
  const state = { phase: 'freeze', ctScore: 15, tScore: 7, maxWins: 16, matchOver: false, timeLeft: 3 }
  assert.equal(finishRound(state, 'ct'), false)
  state.phase = 'live'
  finishRound(state, 'ct')
  assert.equal(state.matchOver, true)
  assert.equal(state.ctScore, 16)
})

test('AK has nonzero first-shot spread, a movement penalty in either direction, and an air penalty', () => {
  const fresh = freshAccuracy
  const still = akSpread(fresh(), 100, 0, true)
  assert.ok(Math.abs(still - 0.0055) < 1e-9)
  const moving = akSpread(fresh(), 100, 5.525, true)
  assert.ok(moving > still)
  assert.ok(akSpread(fresh(), 100, 0, false) > moving)
  const burst = fresh()
  for (let i = 0; i < 10; i++) akSpread(burst, 100 + i * 0.0955, 0, true)
  assert.equal(burst.accuracy, 1.25)
  setTrigger(burst, false, 101)
  recoverAccuracy(burst, 102)
  assert.equal(burst.shots, 0)
  assert.equal(burst.pitch, 0)
  assert.equal(burst.accuracy, 1.25, 'vanilla preserves accuracy until the next shot or reload')
})

test('unarmored headshots are lethal nearby, leg shots weaker, and distance reduces damage', () => {
  assert.ok(rangedDamage(36, 10, 'head') >= 100)
  assert.ok(rangedDamage(36, 10, 'legs') < rangedDamage(36, 10, 'body'))
  assert.ok(rangedDamage(36, 100, 'body') < rangedDamage(36, 10, 'body'))
})

test('vanilla AK integer accuracy changes after shot six, not three perfect bullets', () => {
  const state = freshAccuracy()
  const spread = Array.from({ length: 7 }, (_, i) => akSpread(state, 100 + i * 0.0955, 0, true))
  assert.equal(spread[0], 0.0275 * 0.2)
  assert.equal(spread[1], 0.0275 * 0.35)
  assert.equal(spread[5], 0.0275 * 0.35)
  assert.equal(spread[6], 0.0275 * 1.25)
})

test('walking stays below the spread threshold but still has moving recoil', () => {
  const still = freshAccuracy(), walking = freshAccuracy(), running = freshAccuracy()
  const standSpread = akSpread(still, 100, 0, true)
  const walkSpread = akSpread(walking, 100, 221 * 0.025 * 0.52, true)
  const runSpread = akSpread(running, 100, 221 * 0.025, true)
  assert.equal(walkSpread, standSpread)
  assert.ok(runSpread > walkSpread * 9)
  kickBack(still, 0, true, false, () => 0.5)
  kickBack(walking, 2.873, true, false, () => 0.5)
  assert.equal(still.pitch, 1)
  assert.equal(still.yaw, -0.375)
  assert.equal(walking.pitch, 1.5)
  assert.equal(walking.yaw, -0.45)
})

test('full-auto recoil climbs, is capped, changes lateral direction, and recovers after release', () => {
  const state = freshAccuracy()
  for (let i = 0; i < 30; i++) {
    akSpread(state, 100 + i * 0.0955, 0, true)
    kickBack(state, 0, true, false, () => i === 15 ? 0 : 0.5)
    assert.ok(state.pitch <= 5.75)
    assert.ok(Math.abs(state.yaw) <= 1.75)
  }
  assert.equal(state.pitch, 5.75)
  assert.equal(state.right, true)
  setTrigger(state, false, 103)
  assert.equal(state.shots, 15)
  recoverAccuracy(state, 103.399)
  assert.equal(state.shots, 15)
  recoverAccuracy(state, 103.401)
  assert.equal(state.shots, 14)
  recoverAccuracy(state, 104)
  assert.equal(state.shots, 0)
  assert.equal(state.pitch, 0)
  assert.equal(state.yaw, 0)
})
