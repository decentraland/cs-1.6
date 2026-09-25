import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { compile } from './compile.mjs'
import { humanServer } from './helpers/human-server.mjs'

const load = compile('recoil-prediction', 'bot-loadout')
const { RecoilPrediction } = load('recoil-prediction')
const { freshAccuracy, recoverAccuracy } = load('accuracy')
const { GUNS } = load('weapon-profiles')
const { createBotCombat } = load('bot-combat')
const { switchEmptyBotGun } = load('bot-loadout')
const { startingInventory } = load('inventory-rules')
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
const confirmed = (state) => ({
  shots: state.shots,
  accuracy: state.accuracy,
  pitch: state.pitch,
  yaw: state.yaw,
  right: state.right
})

const cameraCode = buildSync({
  entryPoints: ['src/fps-camera.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  external: ['@dcl/sdk/*', './world-query', './platform']
}).outputFiles[0].text

function cameraFixture() {
  let now = 10
  const data = new Map()
  const transform = { position: { x: 95, y: 10.026, z: 52 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }
  const component = () => ({
    create: (entity, value) => data.set(entity, value),
    createOrReplace: (entity, value) => data.set(entity, value),
    get: () => transform,
    getOrNull: () => transform
  })
  const modules = {
    '@dcl/sdk/ecs': {
      engine: { PlayerEntity: 1, CameraEntity: 2, addEntity: () => 512 },
      Transform: component(),
      MainCamera: component(),
      VirtualCamera: { ...component(), Transition: { Time: (time) => ({ time }) } }
    },
    '@dcl/sdk/math': {},
    './world-query': { mapDistance: () => Infinity },
    './platform': { isTouchPlatform: () => false }
  }
  const module = { exports: {} }
  runInNewContext(cameraCode, {
    module,
    require: (name) => {
      assert.ok(name in modules, name)
      return modules[name]
    },
    Date: { now: () => now * 1000 }
  })
  return {
    camera: module.exports,
    at: (time) => {
      now = time
    }
  }
}

test('the production camera keeps recoil when switching to a pistol or knife and clears it on respawn', () => {
  const { camera, at } = cameraFixture()
  camera.resetFpsCamera(1, 0, 1234)
  camera.syncCameraWeapon('xm1014', 1)
  camera.predictCameraKick(1, 0)
  at(10.01)
  const before = camera.getViewPunch(10.01)
  assert.ok(before.pitch > 6)
  camera.syncCameraWeapon('usp', 2)
  near(camera.getViewPunch(10.01).pitch, before.pitch)
  camera.syncCameraWeapon('ak47', 3) // The client maps non-firearms to this camera profile.
  near(camera.getViewPunch(10.01).pitch, before.pitch)
  assert.equal(camera.pendingCameraShots(0), 0)
  camera.resetFpsCamera(2, 0, 9876)
  near(camera.getViewPunch(10.01).pitch, 0)
  camera.receiveCameraKick({ round: 1, shotId: 1, shots: 1, accuracy: 0, pitch: 10, yaw: 0, right: false })
  near(camera.getViewPunch(10.01).pitch, 0)
})

test('switching to any firearm preserves decaying player punch while applying its deploy accuracy', () => {
  for (const [id, gun] of Object.entries(GUNS)) {
    const recoil = new RecoilPrediction('xm1014', 1234)
    recoil.predict(1, 10, 0, false)
    const before = recoil.punch(10.02)
    recoil.deploy(id, 10.02)
    near(recoil.punch(10.02).pitch, before.pitch)
    near(recoil.punch(10.02).yaw, before.yaw)
    near(recoil.snapshot().accuracy, gun.accuracy)
    assert.equal(recoil.snapshot().shots, 0)
    assert.equal(recoil.pendingShots, 0, 'the previous gun cannot reserve this magazine')
    near(recoil.punch(15).pitch, 0)
  }
})

test('late confirmations replay weapon switches, later shots and reload with their original gun rules', () => {
  const recoil = new RecoilPrediction('xm1014', 1234)
  recoil.predict(1, 10, 0, false)
  const first = confirmed(recoil.snapshot())
  recoil.deploy('sg550', 10.01)
  recoil.predict(2, 10.76, 0, true, 0, 40)
  const second = confirmed(recoil.snapshot())
  recoil.reload(11.01)
  const before = recoil.punch(11.03)
  const snapshot = recoil.snapshot()
  assert.equal(recoil.confirm(1, first, 11.03), true)
  near(recoil.punch(11.03).pitch, before.pitch)
  near(recoil.snapshot().accuracy, snapshot.accuracy)
  near(recoil.snapshot().pitch, snapshot.pitch)
  assert.equal(recoil.pendingShots, 1)
  assert.equal(recoil.confirm(2, second, 11.04), true)
  assert.equal(recoil.pendingShots, 0)
  assert.equal(recoil.confirm(1, first, 11.04), false)
})

test('rejecting the old gun shot removes its punch without replaying a kick on the new gun', () => {
  const recoil = new RecoilPrediction('xm1014', 1234)
  recoil.predict(1, 10, 0, false)
  recoil.predict(2, 10.25, 0, false)
  recoil.deploy('glock18', 10.26)
  recoil.predict(3, 11.01, 0, true)
  assert.ok(recoil.punch(11.01).pitch > 0)
  recoil.reject(2, 11.02)
  near(recoil.snapshot().pitch, 0)
  assert.equal(recoil.pendingShots, 1)
  assert.ok(recoil.punch(12.02).pitch < 1e-7)
})

test('switching back to the same gun does not reserve its new magazine for an old shot', () => {
  const recoil = new RecoilPrediction('xm1014', 1234)
  recoil.predict(1, 10, 0, false)
  recoil.deploy('usp', 10.01)
  recoil.deploy('xm1014', 10.02)
  assert.equal(recoil.pendingAfter(0), 0)
  recoil.predict(2, 10.77, 0, false)
  assert.equal(recoil.pendingAfter(0), 1)
  assert.equal(recoil.pendingAfter(2), 0)
})

test('the production server retains recoil across a knife/pistol switch and clears it for a new life', () => {
  const game = humanServer()
  const player = game.addPlayer('shooter', 1, { x: 95, y: 10.026, z: 52 })
  const equip = (id) => {
    const gun = GUNS[id]
    Object.assign(player.weapon(), { name: gun?.name ?? 'Knife', fireRate: gun?.fireRate ?? 0.35 })
    game.server.resetPlayerAccuracy('shooter')
  }
  const fire = (shotId, overrides = {}) => {
    game.message('playerTrigger', 'shooter', { held: false, sequence: shotId * 2 })
    game.message('playerTrigger', 'shooter', { held: true, sequence: shotId * 2 + 1 })
    game.shoot('shooter', { shotId, ...overrides })
  }
  equip('xm1014')
  game.tick(10)
  fire(1, { grounded: false })
  game.tick(10.25)
  fire(2, { grounded: false })
  const last = game.sent.findLast((event) => event.type === 'practiceShot').data
  const expected = { ...freshAccuracy(), ...last, updatedAt: 10.25 }
  game.at(10.26)
  equip('knife')
  recoverAccuracy(expected, 10.26)
  game.at(10.28)
  equip('glock18')
  recoverAccuracy(expected, 10.28)
  game.tick(11.03)
  fire(3)
  recoverAccuracy(expected, 11.03)
  const shot = game.sent.findLast((event) => event.type === 'practiceShot').data
  assert.equal(shot.shotId, 3)
  assert.ok(expected.pitch > 0)
  near(shot.pitch, expected.pitch)
  game.server.resetPlayerAccuracy('shooter', true)
  game.tick(11.3)
  fire(4)
  near(game.sent.findLast((event) => event.type === 'practiceShot').data.pitch, 0)
})

test('bots carry residual recoil into a paid fallback pistol instead of resetting it', () => {
  const account = {
    team: 2,
    money: 90,
    armor: 0,
    helmet: false,
    defuseKit: false,
    inventory: startingInventory(2, 'm4a1'),
    boughtRound: 1
  }
  const combat = createBotCombat(0, 'm4a1', { clip: 0, reserve: 0 })
  Object.assign(combat.accuracy, { pitch: 6, yaw: 1, updatedAt: 10 })
  const expected = { ...combat.accuracy }
  recoverAccuracy(expected, 10.1)
  const selected = switchEmptyBotGun(account, combat, 10.1)
  assert.equal(selected.gun, 'usp')
  near(selected.accuracy.pitch, expected.pitch)
  near(selected.accuracy.yaw, expected.yaw)
  near(selected.accuracy.accuracy, GUNS.usp.accuracy)
  assert.equal(selected.weapon.ammoClip, 12)
  assert.equal(account.money, 90)
})

test('the camera applies a synced draw snapshot once and retains later shot history on repeated updates', () => {
  const { camera, at } = cameraFixture()
  const stored = { shots: 3, accuracy: 0.7375, lastFire: 9, right: true }
  camera.resetFpsCamera(1, 0, 1234)
  camera.syncCameraWeapon('sg550', 1, 0, 40, 0, stored)
  near(camera.predictCameraKick(1, 0).spread, 0.118125)
  at(10.25)
  camera.syncCameraWeapon('sg550', 1, 0, 40, 1, stored)
  near(camera.predictCameraKick(2, 0).spread, 0.009)
  at(10.26)
  camera.syncCameraWeapon('usp', 2)
  at(11.01)
  camera.syncCameraWeapon('sg550', 3, 0, 40, 2, { ...stored, accuracy: 0.7375, lastFire: 10.25 })
  near(camera.predictCameraKick(3, 0).spread, 0.118125)
})
