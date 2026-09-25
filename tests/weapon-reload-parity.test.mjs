import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'
import { humanServer } from './helpers/human-server.mjs'

const load = compile('recoil-prediction', 'gun-accuracy', 'weapon-profiles', 'bot-combat')
const { RecoilPrediction } = load('recoil-prediction')
const { GUNS } = load('weapon-profiles')
const { createBotCombat, botShot } = load('bot-combat')
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`)

test('Scout deploy has the original 1.25-second lock; AWP retains 1.45 and other guns 0.75', () => {
  for (const [id, gun] of Object.entries(GUNS)) {
    near(gun.drawTime, id === 'scout' ? 1.25 : id === 'awp' ? 1.45 : 0.75)
  }
})

test('reload preserves the current camera punch and its natural decay', () => {
  for (const id of ['m249', 'm3', 'xm1014', 'sg550']) {
    const recoil = new RecoilPrediction(id, 1234)
    for (let shot = 1; shot <= 6; shot++) recoil.predict(shot, 10 + (shot - 1) * GUNS[id].fireRate, 6, false)
    const now = 10 + 6 * GUNS[id].fireRate
    const before = recoil.punch(now)
    if (id === 'm249' || id === 'xm1014')
      assert.ok(before.pitch > 0, id + ' has residual punch when reload becomes legal')
    recoil.reload(now)
    near(recoil.punch(now).pitch, before.pitch)
    near(recoil.punch(now).yaw, before.yaw)
    near(recoil.punch(now + 5).pitch, 0)
  }
})

test('SG550 preserves its last accuracy through reload for the first post-reload shot', () => {
  const recoil = new RecoilPrediction('sg550', 1234)
  recoil.predict(1, 10, 0, true, 0, 40)
  recoil.predict(2, 10.25, 0, true, 0, 40)
  near(recoil.snapshot().accuracy, 0.7375)
  recoil.reload(10.5)
  near(recoil.snapshot().accuracy, 0.7375)
  near(recoil.snapshot().lastFire, 10.25)
  recoil.predict(3, 13.85, 0, true, 0, 40)
  near(recoil.snapshot().accuracy, 0.98)
})

test('late shot confirmation replays reload without resetting SG550 accuracy', () => {
  const recoil = new RecoilPrediction('sg550', 1234)
  recoil.predict(1, 10, 0, true, 0, 40)
  recoil.predict(2, 10.25, 0, true, 0, 40)
  recoil.reload(10.5)
  recoil.confirm(2, { shots: 2, accuracy: 0.7375, pitch: 0.9, yaw: 0.25, right: false }, 10.7)
  near(recoil.snapshot().accuracy, 0.7375)
  near(recoil.snapshot().lastFire, 10.25)
})

test('all 24 guns apply only their source reload accuracy changes and retain the last-fire clock', () => {
  for (const [id, expected] of Object.entries({
    ak47: 0.2,
    aug: 0,
    awp: 0,
    deagle: 0.9,
    elite: 0.88,
    famas: 0,
    fiveseven: 0.92,
    g3sg1: 0.2,
    galil: 0.2,
    glock18: 0.9,
    m249: 0.2,
    m3: 0,
    m4a1: 0.2,
    mac10: 0,
    mp5: 0,
    p228: 0.9,
    p90: 0.2,
    scout: 0,
    sg550: 0.7375,
    sg552: 0.2,
    tmp: 0.2,
    ump45: 0,
    usp: 0.92,
    xm1014: 0
  })) {
    const recoil = new RecoilPrediction(id, 1234)
    recoil.predict(1, 10, 0, true)
    recoil.predict(2, 10 + GUNS[id].fireRate, 0, true)
    recoil.reload(10 + 2 * GUNS[id].fireRate)
    near(recoil.snapshot().accuracy, expected)
    near(recoil.snapshot().lastFire, 10 + GUNS[id].fireRate)
  }
})

test('the actual server reload handler preserves SG550 spread and ammunition across reload', () => {
  const game = humanServer(),
    player = game.addPlayer('shooter', 1, { x: 95, y: 10.026, z: 52 }),
    gun = GUNS.sg550
  Object.assign(player.weapon(), {
    name: gun.name,
    zoom: 40,
    fireRate: gun.fireRate,
    damage: gun.damage,
    maxAmmoClip: gun.clip,
    reloadTime: gun.reloadTime
  })
  game.server.resetPlayerAccuracy('shooter')
  game.tick(10)
  game.shoot('shooter')
  game.tick(10.25)
  game.shoot('shooter', { shotId: 2 })
  near(game.sent.findLast((event) => event.type === 'practiceShot').data.accuracy, 0.7375)
  game.tick(10.5)
  game.message('playerReload', 'shooter', { round: 1, revision: 1 })
  assert.equal(player.weapon().isReloading, true)
  game.tick(13.85)
  // Isolate scoped accuracy from the independent no-scope penalty after reloading.
  player.weapon().zoom = 40
  game.shoot('shooter', { shotId: 3 })
  assert.equal(player.weapon().ammoClip, 29)
  assert.equal(player.weapon().ammoReserve, 88)
  assert.ok(game.logs.findLast((line) => line.includes('[SHOT]')).includes('spread=0.0131'))
})

test('bot reload uses the same source-specific accuracy reset and preserves residual punch', () => {
  const state = createBotCombat(0, 'mac10', { clip: 0, reserve: 30 })
  state.accuracy.pitch = 6
  state.accuracy.yaw = 1
  state.accuracy.updatedAt = 10
  state.accuracy.lastFire = 9.93
  botShot(state, { feet: { x: 95, y: 10.026, z: 52 }, targets: [], speed: 0, now: 10, alive: true })
  assert.equal(state.weapon.isReloading, true)
  near(state.accuracy.accuracy, 0)
  near(state.accuracy.pitch, 6)
  near(state.accuracy.lastFire, 9.93)
})
