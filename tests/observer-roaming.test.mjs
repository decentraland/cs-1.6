import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'

const { ObserverModes, ObserverRoaming, OBSERVER_MAX_SPEED } = compile('observer-roaming')('observer-roaming')
const close = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-8, `${value} ≈ ${expected}`)
const forward = { x: 0, y: 0, z: 1 }

test('neutral observers can roam without a target and return to their selected mode when one appears', () => {
  const modes = new ObserverModes()
  assert.equal(modes.update(true, false), 'roaming')
  assert.equal(modes.update(true, true), 'chase')
  assert.equal(modes.update(true, true, true), 'roaming')
  assert.equal(modes.update(true, false), 'roaming')
  assert.equal(modes.update(true, true), 'roaming')
  assert.equal(modes.update(true, true, true), 'chase')
  assert.equal(modes.update(true, false, true), 'roaming')
  assert.equal(modes.update(true, true), 'chase')
})

test('team observers cannot enable roaming, including after leaving neutral spectator mode', () => {
  const modes = new ObserverModes()
  modes.update(true, true, true)
  assert.equal(modes.update(false, true, true), 'chase')
  assert.equal(modes.update(false, false, true), 'chase')
  assert.equal(modes.update(true, true), 'chase')
  modes.update(true, true, true)
  modes.reset()
  assert.equal(modes.update(true, true), 'chase')
})

test('roaming applies original spectator friction then acceleration in scene meters', () => {
  const camera = new ObserverRoaming()
  camera.reset({ x: 4, y: 2, z: 9 })
  camera.advance(forward, 1, 0, false, 0.01)
  close(camera.velocity.z, 0.5)
  close(camera.position.z, 9.005)
  camera.advance(forward, 1, 0, false, 0.01)
  close(camera.velocity.z, 0.8875)
  close(camera.position.z, 9.013875)
  const stopped = { ...camera.position }
  camera.advance(forward, 0, 0, false, 0.01)
  assert.deepEqual(camera.position, stopped, 'original no-input path stops translation immediately')
  close(camera.velocity.z, 0.775)
})

test('roaming caps diagonal wish speed and follows pitched look while strafing horizontally', () => {
  const camera = new ObserverRoaming()
  camera.advance(forward, 1, 1, false, 0.01)
  close(Math.hypot(camera.velocity.x, camera.velocity.z), OBSERVER_MAX_SPEED * 5 * 0.01)
  camera.reset()
  camera.advance({ x: 0, y: 0.6, z: 0.8 }, 1, 0, false, 0.01)
  close(camera.velocity.y, 0.3)
  close(camera.velocity.z, 0.4)
  camera.reset()
  camera.advance({ x: 0, y: 0.6, z: 0.8 }, 0, 1, false, 0.01)
  close(camera.velocity.x, 0.5)
  close(camera.velocity.y, 0)
  camera.reset()
  camera.advance(forward, 1, 0, true, 0.01)
  close(camera.velocity.z, 0.26)
})

test('menus, jumps to viewpoints and long frame stalls discard spectator velocity', () => {
  const camera = new ObserverRoaming()
  for (const dt of [0, -1, 0.5, NaN, Infinity]) {
    camera.advance(forward, 1, 0, false, 0.01)
    const position = { ...camera.position }
    camera.advance(forward, 1, 0, false, dt)
    assert.deepEqual(camera.position, position)
    assert.deepEqual(camera.velocity, { x: 0, y: 0, z: 0 })
  }
  camera.advance(forward, 1, 0, false, 0.01)
  const beforeMenu = { ...camera.position }
  camera.advance(forward, 1, 0, false, 0.01, false)
  assert.deepEqual(camera.position, beforeMenu)
  assert.deepEqual(camera.velocity, { x: 0, y: 0, z: 0 })
  camera.reset({ x: 20, y: 4, z: 30 })
  assert.deepEqual(camera.position, { x: 20, y: 4, z: 30 })
})
