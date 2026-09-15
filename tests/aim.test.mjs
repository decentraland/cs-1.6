import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aimDirection, moveAim, MOUSE_SENSITIVITY } from '../src/aim.ts'

const angle = (direction) => ({ yaw: Math.atan2(direction.x, direction.z), pitch: Math.asin(direction.y) })
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)

test('rendering camera punch never contaminates the aim sent to the server', () => {
  const aim = { yaw: -0.7, pitch: 0.1 }
  const original = { ...aim }
  const punch = { yaw: -1.75, pitch: 5.75 }
  for (let frame = 0; frame < 120; frame++) aimDirection(aim, punch)
  assert.deepEqual(aim, original)
  const shot = angle(aimDirection(aim, punch))
  near(shot.pitch, aim.pitch + (punch.pitch * Math.PI) / 180)
  near(shot.yaw, aim.yaw + (punch.yaw * Math.PI) / 180)
  near(angle(aimDirection(aim)).pitch, original.pitch)
})

test('pulling the mouse down and sideways compensates for server punch', () => {
  const aim = { yaw: -0.7, pitch: 0.1 }
  const original = aimDirection(aim)
  const punch = { yaw: -1.75, pitch: 5.75 }
  moveAim(aim, (-punch.yaw * Math.PI) / 180 / MOUSE_SENSITIVITY, (punch.pitch * Math.PI) / 180 / MOUSE_SENSITIVITY)
  const compensated = aimDirection(aim, punch)
  for (const axis of ['x', 'y', 'z']) near(compensated[axis], original[axis])
})

test('large mouse movements keep aim finite and stop before vertical inversion', () => {
  const aim = { yaw: 0, pitch: 0 }
  moveAim(aim, 100000, -100000)
  assert.ok(Math.abs(aim.yaw) <= Math.PI)
  const direction = aimDirection(aim, { yaw: 6, pitch: 9 })
  near(Math.hypot(direction.x, direction.y, direction.z), 1)
  assert.ok(angle(direction).pitch < Math.PI / 2)
})
