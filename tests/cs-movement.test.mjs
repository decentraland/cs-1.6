import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CsMovement, largeFlinch, CS_GRAVITY, CS_JUMP_SPEED } from '../src/cs-movement-rules.ts'
const input = (overrides = {}) => ({
  forward: 1,
  side: 0,
  yaw: 0,
  speed: 5.525,
  jump: false,
  grounded: true,
  ...overrides
})
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} vs ${b}`)
test('ground acceleration, friction and counter-strafe use original CS defaults', () => {
  const movement = new CsMovement()
  near(movement.step(input(), 0.01).z, 5 * 5.525 * 0.01)
  for (let i = 0; i < 100; i++) movement.step(input(), 0.01)
  near(movement.velocity.z, 5.525)
  near(movement.step(input({ forward: 0 }), 0.01).z, 5.525 * 0.96)
  const running = movement.velocity.z
  assert.ok(movement.step(input({ forward: -1 }), 0.01).z < running * 0.96)
  movement.reset({ x: 0, y: 0, z: 1 })
  near(movement.step(input({ forward: 0 }), 0.01).z, 0.925)
  movement.reset({ x: 0, y: 0, z: 1 })
  near(movement.step(input({ forward: 0, edge: true }), 0.01).z, 0.85)
})
test('diagonals keep weapon speed and walking remains at 52 percent', () => {
  const movement = new CsMovement()
  for (let i = 0; i < 100; i++) movement.step(input({ side: 1, speed: 5.525 * 0.52 }), 0.01)
  near(Math.hypot(movement.velocity.x, movement.velocity.z), 5.525 * 0.52)
})
test('air acceleration limits the projection to 30 HU/s without clamping existing forward momentum', () => {
  const movement = new CsMovement()
  movement.reset({ x: 0, y: 0, z: 5.525 })
  for (let i = 0; i < 20; i++) movement.step(input({ forward: 0, side: 1, grounded: false }), 0.01)
  near(movement.velocity.x, 0.75)
  near(movement.velocity.z, 5.525)
  near(movement.velocity.y, -CS_GRAVITY * 0.2)
})
test('jump gravity has the original 45-unit apex and holding jump cannot pogo', () => {
  const movement = new CsMovement()
  const dt = 0.001
  let height = 0,
    apex = 0
  for (let i = 0; i < 800; i++) {
    const v = movement.step(input({ forward: 0, jump: true, grounded: i === 0 }), dt)
    height += v.y * dt
    apex = Math.max(apex, height)
  }
  assert.ok(Math.abs(apex - 1.125) < 0.001)
  assert.equal(movement.step(input({ forward: 0, jump: true }), 0.01).y, 0)
  movement.step(input({ forward: 0, jump: false }), 0.01)
  const second = movement.step(input({ forward: 0, jump: true }), 0.01)
  assert.ok(second.y > 0 && second.y < CS_JUMP_SPEED - (CS_GRAVITY * 0.01) / 2, 'jump fatigue reduces repeat jump')
})
test('bunny speed cap and grounded stamina follow source formulas', () => {
  const movement = new CsMovement()
  movement.reset({ x: 0, y: 0, z: 10 })
  movement.step(input({ jump: true }), 0.01)
  near(movement.velocity.z, 1.2 * 5.525 * 0.8)
  assert.equal(movement.stamina, 1315.789429)
})
test('weapon and body group decide small versus large flinch', () => {
  for (const gun of [
    'ak47',
    'm4a1',
    'awp',
    'deagle',
    'm3',
    'scout',
    'aug',
    'sg552',
    'sg550',
    'g3sg1',
    'famas',
    'galil'
  ]) {
    assert.equal(largeFlinch(gun, 'body'), true)
    assert.equal(largeFlinch(gun, 'arms'), true)
    assert.equal(largeFlinch(gun, 'legs'), false)
    assert.equal(largeFlinch(gun, 'head', true), false)
  }
  for (const gun of ['usp', 'glock18', 'knife', 'xm1014', 'm249', 'p90']) assert.equal(largeFlinch(gun, 'head'), false)
})
test('small flinch scales actual velocity, pauses recovery airborne and resets on spawn', () => {
  const movement = new CsMovement()
  movement.reset({ x: 0, y: 0, z: 5 })
  movement.hit(false, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })
  assert.equal(movement.modifier, 0.5)
  movement.step(input({ forward: 0, grounded: false }), 0.01)
  assert.equal(movement.modifier, 0.5)
  near(movement.velocity.z, 5)
  const v = movement.step(input({ forward: 0 }), 0.01)
  near(v.z, 5 * 0.51 * 0.96)
  for (let i = 0; i < 49; i++) movement.step(input({ forward: 0 }), 0.01)
  near(movement.modifier, 1)
  movement.reset()
  near(movement.modifier, 1)
  near(movement.velocity.z, 0)
})
test('large flinch adds 170 HU/s away from the attacker and skips victims at 300 HU/s', () => {
  const movement = new CsMovement()
  assert.equal(movement.hit(true, { x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), true)
  near(movement.velocity.x, 2.55)
  near(movement.velocity.y, 3.4)
  near(movement.modifier, 0.65)
  movement.reset({ x: 7.5, y: 0, z: 0 })
  assert.equal(movement.hit(true, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), false)
  near(movement.velocity.x, 7.5)
  near(movement.modifier, 1)
  movement.hit(false, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })
  near(movement.modifier, 0.5)
})

test('walking input does not lower the weapon-dependent bunny speed cap', () => {
  const movement = new CsMovement()
  movement.reset({ x: 0, y: 0, z: 7 })
  movement.step(input({ jump: true, speed: 3.25, maxSpeed: 6.25 }), 0.01)
  near(movement.velocity.z, 7)
})
