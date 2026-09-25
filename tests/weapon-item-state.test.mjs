import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'
import { humanServer } from './helpers/human-server.mjs'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { Engine } from '@dcl/ecs/dist-cjs/engine/index.js'
import { Schemas } from '@dcl/ecs/dist-cjs/schemas/index.js'
import { ReadWriteByteBuffer } from '@dcl/ecs/dist-cjs/serialization/ByteBuffer/index.js'

const load = compile('recoil-prediction', 'bot-loadout', 'pickup-rules')
const { freshGunAccuracy, deployGunAccuracy, gunSpread } = load('gun-accuracy')
const { GUNS } = load('weapon-profiles')
const { RecoilPrediction } = load('recoil-prediction')
const { createBotCombat } = load('bot-combat')
const { switchEmptyBotGun, botDeathGun } = load('bot-loadout')
const { startingInventory } = load('inventory-rules')
const { dropGun, pickupGun } = load('pickup-rules')
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`)
const memory = { shots: 12, accuracy: 0.7375, lastFire: 10, right: true }
const player = { ...freshGunAccuracy('xm1014'), pitch: 4, yaw: 1, updatedAt: 10, held: true }

test('all firearm deploys preserve the returning item history and use only their source resets', () => {
  const resetShots = new Set(['ak47', 'aug', 'famas', 'galil', 'm249', 'm4a1', 'p90', 'sg552', 'tmp'])
  const keepAccuracy = new Set(['sg550', 'awp', 'scout', 'm3', 'xm1014'])
  for (const id of Object.keys(GUNS)) {
    const state = deployGunAccuracy(player, id, 10, memory)
    near(state.accuracy, keepAccuracy.has(id) ? memory.accuracy : GUNS[id].accuracy)
    assert.equal(state.shots, resetShots.has(id) ? 0 : 12, id)
    assert.equal(state.lastFire, 10, id)
    assert.equal(state.right, true, id)
    assert.equal(state.held, true, 'held trigger follows the player')
    near(state.pitch, 4)
    near(state.yaw, 1)
  }
})

test('an unused SG550 has the original broad first two shots, then updates from its last shot', () => {
  const state = freshGunAccuracy('sg550')
  near(state.accuracy, 0)
  near(gunSpread(state, 'sg550', 10, 0, true, 0, 40), 0.05)
  near(gunSpread(state, 'sg550', 10.25, 0, true, 0, 40), 0.05)
  near(gunSpread(state, 'sg550', 10.5, 0, true, 0, 40), 0.013125)
})

test('SG550 returning from another weapon uses retained accuracy rather than a fresh deploy value', () => {
  const state = deployGunAccuracy(player, 'sg550', 11, memory)
  near(gunSpread(state, 'sg550', 11.75, 0, true, 0, 40), 0.013125)
  near(state.accuracy, 0.98)
})

test('prediction keeps authoritative item state through old-shot confirmations and rejection', () => {
  for (const reject of [false, true]) {
    const predictor = new RecoilPrediction('xm1014', 1234)
    predictor.predict(1, 10, 0, true)
    const shot = predictor.snapshot()
    predictor.deploy('sg550', 10.01, memory)
    near(predictor.snapshot().accuracy, 0.7375)
    predictor.predict(2, 10.76, 0, true, 0, 40)
    if (reject) predictor.reject(1, 10.8)
    else predictor.confirm(1, shot, 10.8)
    near(predictor.snapshot().accuracy, 0.916)
    assert.equal(predictor.snapshot().lastFire, 10.76)
    assert.equal(predictor.pendingShots, 1)
  }
})

test('the server deploy reads the selected inventory item without importing another weapon history', () => {
  const f = humanServer()
  const p = f.addPlayer('shooter', 2, { x: 95, y: 10.026, z: 52 })
  f.component('PlayerInventory').create(p.id, {
    active: 'sg550',
    items: [{ id: 'sg550', clip: 30, reserve: 90, accuracy: { ...memory } }]
  })
  Object.assign(p.weapon(), { name: 'SG550', fireRate: 0.25, zoom: 40 })
  f.server.resetPlayerAccuracy('shooter')
  f.at(11.75)
  f.shoot('shooter')
  const result = f.sent.findLast((event) => event.type === 'practiceShot').data
  assert.ok(f.logs.findLast((line) => line.includes('[SHOT]')).includes('spread=0.0131'))
  near(result.accuracy, 0.98)
})

test('bot survivors draw their stored item state and death/drop preserves it for a new owner', () => {
  const account = {
    team: 2,
    money: 0,
    armor: 0,
    helmet: false,
    defuseKit: false,
    inventory: startingInventory(2, 'sg550'),
    boughtRound: 1
  }
  const item = account.inventory.items.find((item) => item.id === 'sg550')
  item.accuracy = { ...memory }
  const combat = createBotCombat(11, 'sg550', item)
  near(combat.accuracy.accuracy, 0.7375)
  near(combat.accuracy.lastFire, 10)
  combat.accuracy.accuracy = 0.98
  combat.accuracy.lastFire = 12
  const dropped = botDeathGun(account, combat)
  near(dropped.accuracy.accuracy, 0.98)
  near(dropped.accuracy.lastFire, 12)
  const receiver = startingInventory(2)
  assert.equal(pickupGun(receiver, dropped), true)
  const thrown = dropGun(receiver)
  near(thrown.accuracy.lastFire, 12)
  const freshOwner = createBotCombat(13, 'sg550', thrown)
  near(freshOwner.accuracy.accuracy, 0.98)
  near(freshOwner.accuracy.pitch, 0, 'player camera punch never transfers with an item')
})

test('buying a different copy starts new item history while fallback draws the stored pistol history', () => {
  const account = {
    team: 2,
    money: 0,
    armor: 0,
    helmet: false,
    defuseKit: false,
    inventory: startingInventory(2, 'm4a1'),
    boughtRound: 1
  }
  account.inventory.items.find((item) => item.id === 'usp').accuracy = { ...memory }
  const combat = createBotCombat(0, 'm4a1', { clip: 0, reserve: 0 })
  const selected = switchEmptyBotGun(account, combat, 11)
  near(selected.accuracy.lastFire, 10)
  assert.equal(selected.accuracy.right, true)
  const fresh = createBotCombat(12, 'sg550', { clip: 30, reserve: 0 })
  near(fresh.accuracy.lastFire, 0)
  near(fresh.accuracy.accuracy, 0)
  assert.equal(fresh.accuracy.right, false)
})

test('actual firing, slot selection and equipment adapters retain the same SG550 and leave ammo unchanged on draw', () => {
  const f = humanServer({ equipment: true, inventory: true })
  const p = f.addPlayer('shooter', 2, { x: 95, y: 10.026, z: 52 })
  f.component('PlayerInventory').create(p.id, startingInventory(2, 'sg550'))
  f.server.equipActiveWeapon(p.id)
  const select = (slot) => f.message('weaponSelect', 'shooter', { slot, revision: p.weapon().revision, round: 1 })
  f.tick(11)
  f.shoot('shooter', { shotId: 1, revision: p.weapon().revision })
  f.tick(11.25)
  f.shoot('shooter', { shotId: 2, revision: p.weapon().revision })
  const stored = f
    .component('PlayerInventory')
    .get(p.id)
    .items.find((item) => item.id === 'sg550')
  near(stored.accuracy.accuracy, 0.7375)
  near(stored.accuracy.lastFire, 11.25)
  near(p.weapon().deployedAccuracy.accuracy, 0, 'the draw snapshot stays fixed while firing')
  f.at(11.26)
  select('secondary')
  select('melee')
  select('primary')
  near(p.weapon().deployedAccuracy.accuracy, 0.7375)
  near(p.weapon().deployedAccuracy.lastFire, 11.25)
  assert.equal(p.weapon().ammoClip, 28)
  assert.equal(p.weapon().ammoReserve, 90)
  f.tick(12.1)
  p.weapon().zoom = 40
  f.shoot('shooter', { shotId: 3, revision: p.weapon().revision })
  assert.ok(f.logs.findLast((line) => line.includes('[SHOT]')).includes('spread=0.0131'))
  assert.equal(p.weapon().ammoClip, 27)
  near(stored.accuracy.lastFire, 12.1)
})

test('installed SDK schemas preserve zero/false item state and subsecond epoch times through inventory, drops and draw snapshots', () => {
  const source = buildSync({
    entryPoints: ['src/components.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    external: ['@dcl/sdk/ecs']
  }).outputFiles[0].text
  const module = { exports: {} }
  runInNewContext(source, { module, require: () => ({ engine: Engine(), Schemas }) })
  const api = module.exports
  for (const state of [
    { shots: 0, accuracy: 0, lastFire: 0, right: false },
    { shots: 17, accuracy: 0.7375, lastFire: 1790090400.125, right: true }
  ]) {
    for (const [component, values, read] of [
      [
        api.PlayerInventory,
        { active: 'sg550', items: [{ id: 'sg550', clip: 28, reserve: 90, accuracy: state }] },
        (v) => v.items[0].accuracy
      ],
      [api.DroppedWeapon, { gun: 'sg550', clip: 28, accuracy: state }, (v) => v.accuracy],
      [api.Weapon, { name: 'SG550', revision: 12, deployedAccuracy: state }, (v) => v.deployedAccuracy]
    ]) {
      const buffer = new ReadWriteByteBuffer()
      component.schema.serialize(component.schema.extend(values), buffer)
      const decoded = component.schema.deserialize(new ReadWriteByteBuffer(buffer.toBinary()))
      assert.deepEqual({ ...read(decoded) }, state)
    }
  }
})
