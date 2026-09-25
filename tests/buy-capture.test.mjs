import assert from 'node:assert/strict'
import { test } from 'node:test'
import { combatClient, InputAction } from './helpers/combat-client.mjs'

function fixture() {
  const handlers = new Map(),
    moves = [],
    resets = []
  const f = combatClient({
    readyToShoot: true,
    room: { onMessage: (type, callback) => handlers.set(type, callback), send() {} },
    modules: {
      '~system/RestrictedActions': {
        movePlayerTo: (data) => {
          moves.push(data)
          return Promise.resolve({})
        }
      },
      './fps-camera': {
        resetFpsCamera: (...args) => resets.push(args),
        getFpsAimDirection: () => ({ x: 0, y: 0, z: 1 }),
        setCameraTrigger() {},
        predictCameraKick() {},
        pendingCameraShots: () => 0
      },
      './footsteps': { resetFootsteps() {} },
      './delaySystem': { delay() {} }
    }
  })
  f.state.mobile = false
  const camera = () => f.component('PointerLock').getOrNull(2)?.isPointerLocked
  const frame = () => {
    for (const system of f.systems) system(1 / 60)
    f.state.locked = camera() ?? false
  }
  const spawn = (round = 1) =>
    handlers.get('practiceSpawn')({ playerAddress: 'me', position: { x: 60, y: 7, z: 52 }, yaw: 0, seed: 1234, round })
  return { ...f, frame, camera, spawn, moves, resets }
}

test('an open buy menu releases camera capture, including a repeated renderer or resync capture', () => {
  const f = fixture()
  f.state.buy = true
  for (let attempt = 0; attempt < 2; attempt++) {
    f.client.capturePointer()
    assert.equal(f.camera(), true)
    f.frame()
    assert.equal(f.camera(), false, 'BUY must retain a usable cursor')
    assert.equal(f.state.buy, true, 'keep the valid menu open')
  }
})

test('the team menu releases the actual camera entity required by Unity, not only its request entity', () => {
  const f = fixture()
  f.client.capturePointer()
  f.state.menu = true
  f.frame()
  assert.equal(f.camera(), false)
})

test('a new-round spawn or same-round resync cannot leave a visible buy menu locked', () => {
  for (const round of [1, 2]) {
    const f = fixture()
    f.state.buy = true
    f.spawn(round)
    f.match.round = round
    assert.equal(f.moves.length, 1)
    assert.equal(f.resets.length, 1)
    f.frame()
    assert.equal(f.camera(), false)
    assert.equal(f.state.buy, true)
  }
})

test('closing BUY restores capture while its held click cannot shoot through the menu', () => {
  const f = fixture()
  f.state.buy = true
  f.client.capturePointer()
  f.frame()
  f.hold(InputAction.IA_POINTER, true)
  f.step(11)
  assert.equal(f.sent.filter((e) => e.type === 'playerShoot').length, 0)
  f.state.buy = false
  f.client.requestPointerLock(true)
  f.frame()
  assert.equal(f.camera(), true)
  f.step(11.2)
  assert.equal(f.sent.filter((e) => e.type === 'playerShoot').length, 0)
  f.hold(InputAction.IA_POINTER, false)
  f.step(11.3)
  f.hold(InputAction.IA_POINTER, true)
  f.step(11.4)
  assert.equal(f.sent.filter((e) => e.type === 'playerShoot').length, 1)
})

test('ordinary spawns still capture gameplay and menu-free frames never steal an Escape release', () => {
  const f = fixture()
  f.spawn()
  f.frame()
  assert.equal(f.camera(), true)
  f.component('PointerLock').getMutable(2).isPointerLocked = false
  f.frame()
  assert.equal(f.camera(), false)
})

test('mobile spawn and menu updates never request a pointer lock', () => {
  const f = fixture()
  f.state.mobile = true
  f.state.buy = true
  f.state.menu = true
  f.spawn()
  f.frame()
  assert.equal(f.camera(), undefined)
})
