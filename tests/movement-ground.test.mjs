import { test } from 'node:test'
import assert from 'node:assert/strict'
import { supportHeight, nextStepHeight, keepStepLift } from '../src/movement-ground.ts'
const plane = (y, normal = { x: 0, y: 1, z: 0 }) => ({ position: { x: 0, y, z: 0 }, normal })
test('ground support follows the contact plane and Bevy capsule radius on a slope', () => {
  assert.equal(supportHeight(plane(10), { x: 3, y: 20, z: 4 }), 10)
  const y = 1 / Math.sqrt(2)
  assert.ok(
    Math.abs(supportHeight(plane(10, { x: y, y, z: 0 }), { x: 2, y: 30, z: 0 }) - (8 + 0.3 * (Math.sqrt(2) - 1))) <
      1e-10
  )
})
test('step lift accepts ordinary and 18 HU steps, rejecting tall walls and flat ground', () => {
  assert.equal(nextStepHeight(10, plane(10.2)), 10.202)
  assert.equal(nextStepHeight(10, plane(10.45)), 10.452)
  assert.equal(nextStepHeight(10, plane(10.5)), undefined)
  assert.equal(nextStepHeight(10, plane(12)), undefined)
  assert.equal(nextStepHeight(10, plane(10.02)), undefined)
  assert.equal(nextStepHeight(10, plane(10.2, { x: 1, y: 0, z: 0 })), undefined)
})
test('stair assistance ends on landing, timeout or jump instead of suppressing a jump', () => {
  assert.equal(keepStepLift(1, 1.1, 10.2, 10, true, false), true)
  assert.equal(keepStepLift(1, 1.5, 10.2, 10, true, false), false)
  assert.equal(keepStepLift(1, 1.1, 10.2, 10.2, true, false), false)
  assert.equal(keepStepLift(1, 1.1, 10.2, 10, true, true), false)
})
