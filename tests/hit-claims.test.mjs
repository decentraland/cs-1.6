import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  acceptShotClaim,
  nearRecent,
  recordSample,
  ORIGIN_TOLERANCE,
  TARGET_TOLERANCE,
  SPEED_TOLERANCE
} from '../src/hit-claims.ts'

const feet = { x: 95, y: 10.026, z: 52 }
const eye = { ...feet, y: feet.y + 1.6 }
const context = () => ({
  eyeHeight: 1.6,
  shooterHistory: [],
  serverFeet: { ...feet },
  serverSpeed: 0,
  serverAirborne: false
})
const claim = (extra = {}) => ({ origin: { ...eye }, speed: 0, grounded: true, ...extra })

test('position history keeps only the last second', () => {
  const history = []
  recordSample(history, { x: 0, y: 0, z: 0 }, 10)
  recordSample(history, { x: 1, y: 0, z: 0 }, 10.5)
  recordSample(history, { x: 2, y: 0, z: 0 }, 11.2)
  assert.deepEqual(
    history.map((sample) => sample.position.x),
    [1, 2]
  )
  assert.ok(nearRecent(history, { x: 1.4, y: 0, z: 0 }, 0.5))
  assert.ok(!nearRecent(history, { x: 5, y: 0, z: 0 }, 0.5))
})

test('the client origin is used when it is close to the server position or a recent sample', () => {
  const accepted = acceptShotClaim(claim({ origin: { ...eye, x: eye.x + 0.4 } }), context())
  assert.deepEqual(accepted.rejected, [])
  assert.equal(accepted.feet.x, feet.x + 0.4)
  const stale = context()
  stale.serverFeet = { ...feet, x: feet.x - 3 }
  stale.shooterHistory = [{ at: 1, position: { ...feet, x: feet.x + 0.2 } }]
  assert.equal(acceptShotClaim(claim(), stale).feet.x, feet.x)
})

test('an origin far from everything the server saw falls back to the server position', () => {
  const accepted = acceptShotClaim(claim({ origin: { ...eye, x: eye.x + ORIGIN_TOLERANCE + 1 } }), context())
  assert.deepEqual(accepted.rejected, ['origin'])
  assert.deepEqual(accepted.feet, feet)
})

test('speed is trusted within tolerance and grounded only when the server cannot see the shooter airborne', () => {
  const near = acceptShotClaim(claim({ speed: 1.5 }), { ...context(), serverSpeed: 3 })
  assert.equal(near.speed, 1.5)
  const far = acceptShotClaim(claim({ speed: 0 }), { ...context(), serverSpeed: SPEED_TOLERANCE + 3 })
  assert.equal(far.speed, SPEED_TOLERANCE + 3)
  assert.ok(far.rejected.includes('speed'))
  assert.equal(acceptShotClaim(claim({ speed: -1 }), context()).speed, 0)
  const airborne = acceptShotClaim(claim({ grounded: true }), { ...context(), serverAirborne: true })
  assert.equal(airborne.grounded, false)
  assert.ok(airborne.rejected.includes('grounded'))
  assert.equal(acceptShotClaim(claim({ grounded: false }), context()).grounded, false)
})

test('a lagging target position is accepted when the target was recently there, rejected otherwise', () => {
  const targetHistory = [
    { at: 9.5, position: { x: 80, y: 10, z: 50 } },
    { at: 10, position: { x: 82, y: 10, z: 50 } }
  ]
  const seen = acceptShotClaim(claim({ target: 'bot:0', targetPosition: { x: 80.3, y: 10, z: 50 } }), {
    ...context(),
    targetHistory
  })
  assert.deepEqual(seen.targetPosition, { x: 80.3, y: 10, z: 50 })
  const invented = acceptShotClaim(
    claim({ target: 'bot:0', targetPosition: { x: 80 - TARGET_TOLERANCE - 1, y: 10, z: 50 } }),
    { ...context(), targetHistory }
  )
  assert.equal(invented.targetPosition, undefined)
  assert.deepEqual(invented.rejected, ['target'])
  const unknown = acceptShotClaim(claim({ target: 'bot:9', targetPosition: { x: 80, y: 10, z: 50 } }), context())
  assert.deepEqual(unknown.rejected, ['target'])
})
