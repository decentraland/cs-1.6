import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HorizontalMotion, updateMovementCrosshair } from '../src/movement-feedback.ts'

test('Shift walking stays compact through batched W to W+D position updates', () => {
  const motion = new HorizontalMotion()
  const state = { spread: 0, isMoving: false }
  let position = { x: 0, z: 0 },
    previous = position,
    legacyExpanded = false
  for (let frame = 0; frame < 120; frame++) {
    if (frame % 2 === 0) {
      const diagonal = frame >= 30 && frame < 90
      const step = (2.873 * 2) / 60
      position = {
        x: position.x + (diagonal ? step / Math.SQRT2 : 0),
        z: position.z + step / (diagonal ? Math.SQRT2 : 1)
      }
    }
    const raw = Math.hypot(position.x - previous.x, position.z - previous.z) * 60
    legacyExpanded ||= raw > 3.5
    previous = position
    updateMovementCrosshair(state, motion.sample(position, 100 + frame / 60), true, 1 / 60)
    assert.equal(state.spread, 0)
    assert.equal(state.isMoving, false)
  }
  assert.ok(legacyExpanded, 'reproduces the old frame-speed spike')
})

test('running still expands the crosshair and walking lets firing spread recover', () => {
  const state = { spread: 0, isMoving: false }
  updateMovementCrosshair(state, 5.525, false, 1 / 60)
  assert.equal(state.spread, 0.8)
  assert.equal(state.isMoving, true)
  state.spread = 1
  updateMovementCrosshair(state, 5.8, true, 1 / 60)
  assert.ok(state.spread > 0.9, 'walking does not erase firing feedback')
  for (let frame = 0; frame < 40; frame++) updateMovementCrosshair(state, 2.873, true, 1 / 60)
  assert.equal(state.spread, 0)
})

test('resetting motion at a round spawn prevents a teleport speed spike', () => {
  const motion = new HorizontalMotion()
  motion.sample({ x: 0, z: 0 }, 100)
  motion.sample({ x: 1, z: 0 }, 100.2)
  motion.reset()
  assert.equal(motion.sample({ x: 95, z: 52 }, 100.3), 0)
})
