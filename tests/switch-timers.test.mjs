import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { Engine } from '@dcl/ecs/dist-cjs/engine/index.js'
import { Schemas } from '@dcl/ecs/dist-cjs/schemas/index.js'
import { ReadWriteByteBuffer } from '@dcl/ecs/dist-cjs/serialization/ByteBuffer/index.js'
import { compile } from './compile.mjs'
import { humanServer } from './helpers/human-server.mjs'
import { combatClient, InputAction as A } from './helpers/combat-client.mjs'

const load = compile('weapon-modes', 'bot-loadout', 'pickup-rules')
const { GUNS } = load('weapon-profiles')
const { startingInventory } = load('inventory-rules')
const { createBotCombat, botShot } = load('bot-combat')
const { botDeathGun } = load('bot-loadout')
const { dropGun, pickupGun } = load('pickup-rules')
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`)
const feet = { x: 95, y: 10.026, z: 52 }
function playerGun(id) {
  const f = humanServer({ equipment: true, inventory: true })
  const p = f.addPlayer('me', 2, feet)
  const inventory = startingInventory(2)
  inventory.items = [{ id, clip: GUNS[id].clip, reserve: GUNS[id].reserve }]
  inventory.active = id
  f.component('PlayerInventory').create(p.id, inventory)
  f.server.equipActiveWeapon(p.id)
  let shotId = 0
  return {
    ...f,
    p,
    inventory: () => f.component('PlayerInventory').getMutable(p.id),
    select: (slot) => f.message('weaponSelect', 'me', { slot, round: 1, revision: p.weapon().revision }),
    shoot: () => {
      f.message('playerTrigger', 'me', { held: false, sequence: shotId * 2 + 2 })
      f.message('playerTrigger', 'me', { held: true, sequence: shotId * 2 + 3 })
      f.shoot('me', { shotId: ++shotId, revision: p.weapon().revision })
    },
    alternate: () => f.message('weaponAlternate', 'me', { round: 1, revision: p.weapon().revision })
  }
}

test('all 24 firearms preserve their item attack clocks except the explicit AWP/Scout draw resets', () => {
  for (const id of Object.keys(GUNS)) {
    const f = playerGun(id)
    f.inventory().items[0].timing = { primary: 20.125, secondary: 21.25 }
    f.server.equipActiveWeapon(f.p.id)
    const bolt = id === 'awp' || id === 'scout'
    near(f.p.weapon().nextPrimaryAt, bolt ? 10 + GUNS[id].drawTime : 20.125)
    near(f.p.weapon().alternateAt, bolt ? 11 : 21.25)
    near(f.p.weapon().readyAt, 10 + GUNS[id].drawTime)
    assert.equal(f.p.weapon().ammoClip, GUNS[id].clip)
  }
})

test('silencer changes survive knife switching until the original M4A1/USP deadline', () => {
  for (const [id, delay] of [
    ['m4a1', 2],
    ['usp', 3]
  ]) {
    const f = playerGun(id)
    f.at(11)
    f.alternate()
    assert.equal(f.p.weapon().mode, 1)
    f.at(11.01)
    f.select('melee')
    f.select(GUNS[id].slot)
    f.at(11.8)
    f.shoot()
    assert.equal(f.p.weapon().ammoClip, GUNS[id].clip, id + ': switching must not bypass the silencer lock')
    f.alternate()
    assert.equal(f.p.weapon().mode, 1)
    f.at(11 + delay + 0.001)
    f.shoot()
    assert.equal(f.p.weapon().ammoClip, GUNS[id].clip - 1)
  }
})

test('a secondary-only stored deadline blocks mode changes without blocking ready primary fire', () => {
  const f = playerGun('aug')
  f.inventory().items[0].timing = { primary: 0, secondary: 20 }
  f.server.equipActiveWeapon(f.p.id)
  f.at(11)
  f.alternate()
  assert.equal(f.p.weapon().zoom, 90)
  f.shoot()
  assert.equal(f.p.weapon().ammoClip, 29)
  near(f.p.weapon().alternateAt, 11 + GUNS.aug.fireRate)
})

test('a dropped silenced gun carries its remaining action lock to its next owner', () => {
  const f = playerGun('m4a1')
  f.at(11)
  f.alternate()
  f.server.storeActiveGun(f.p.id)
  const item = dropGun(f.inventory())
  const next = playerGun('usp')
  next.at(11.01)
  assert.equal(pickupGun(next.inventory(), item), true)
  next.server.equipActiveWeapon(next.p.id)
  next.at(11.8)
  next.shoot()
  assert.equal(next.p.weapon().ammoClip, 30)
  next.at(13.001)
  next.shoot()
  assert.equal(next.p.weapon().ammoClip, 29)
})

test('holstering a magazine reload cancels its player lock without preserving the reload duration as an item timer', () => {
  const f = playerGun('m4a1')
  f.p.weapon().ammoClip = 10
  f.at(11)
  f.message('playerReload', 'me', { round: 1, revision: f.p.weapon().revision })
  assert.equal(f.p.weapon().isReloading, true)
  f.at(11.01)
  f.select('melee')
  f.select('primary')
  f.at(11.8)
  f.shoot()
  assert.equal(f.p.weapon().ammoClip, 9)
  assert.equal(f.p.weapon().ammoReserve, 90)
  assert.equal(f.p.weapon().isReloading, false)
})

test('desktop and touch fire use the draw snapshot without letting later network updates stretch automatic cadence', () => {
  for (const mobile of [true, false]) {
    const f = combatClient({ readyToShoot: true })
    f.state.mobile = mobile
    Object.assign(f.weapon, {
      name: 'M4A1',
      fireRate: 0.0875,
      readyAt: 10,
      deployedTimers: { primary: 12, secondary: 12 }
    })
    f.step(9)
    f.hold(mobile ? A.IA_ACTION_6 : A.IA_POINTER, true)
    f.step(11)
    assert.equal(f.sent.filter((e) => e.type === 'playerShoot').length, 0)
    f.step(12)
    assert.equal(f.sent.filter((e) => e.type === 'playerShoot').length, 1)
    f.weapon.nextPrimaryAt = 12.4
    f.step(12.088)
    assert.equal(f.sent.filter((e) => e.type === 'playerShoot').length, 2)
  }
})

test('knife attack cooldown survives a pistol switch and still expires at the original contact deadline', () => {
  const f = playerGun('usp')
  const target = f.addPlayer('target', 1, { ...feet, x: 94.4 })
  f.at(9)
  f.select('melee')
  const stab = (id) =>
    f.message('knifeAttack', 'me', {
      round: 1,
      revision: f.p.weapon().revision,
      shotId: id,
      attack: 'stab',
      direction: { x: -Math.SQRT1_2, y: -Math.SQRT1_2, z: 0 }
    })
  f.at(10)
  stab(1)
  assert.equal(target.health().current, 35)
  f.at(10.01)
  f.select('secondary')
  f.select('melee')
  f.at(10.8)
  stab(2)
  assert.equal(target.health().current, 35)
  f.at(11.101)
  stab(3)
  assert.equal(target.health().current, 0)
})

test('desktop and touch knife feedback wait for the retained draw timers', () => {
  for (const mobile of [false, true]) {
    const f = combatClient({ readyToShoot: true })
    f.state.mobile = mobile
    Object.assign(f.weapon, { name: 'Knife', readyAt: 10, deployedTimers: { primary: 12, secondary: 13 } })
    f.step(9)
    f.hold(A.IA_SECONDARY, true)
    f.step(11)
    assert.equal(f.sent.filter((e) => e.type === 'knifeAttack').length, 0)
    f.step(12.5)
    assert.equal(f.sent.filter((e) => e.type === 'knifeAttack').length, 0)
    f.step(13)
    assert.equal(f.sent.filter((e) => e.type === 'knifeAttack').length, 1)
  }
})

test('bots retain stored attack deadlines through combat and death pickup', () => {
  const account = {
    team: 2,
    money: 0,
    armor: 0,
    helmet: false,
    defuseKit: false,
    inventory: startingInventory(2, 'm4a1'),
    boughtRound: 1
  }
  const item = account.inventory.items.find((item) => item.id === 'm4a1')
  item.timing = { primary: 12, secondary: 13 }
  const combat = createBotCombat(10, 'm4a1', item)
  combat.visible = true
  const options = {
    feet,
    target: { x: 90, y: 11.426, z: 52 },
    targets: [],
    speed: 0,
    now: 11,
    alive: true,
    random: () => 0.5
  }
  assert.equal(botShot(combat, options), undefined)
  assert.equal(combat.weapon.ammoClip, 30)
  const dropped = botDeathGun(account, combat)
  near(dropped.timing.primary, 12)
  near(dropped.timing.secondary, 13)
})

test('SDK wire preserves zero and fractional epoch deadlines for held guns, knife, drops and draw snapshots', () => {
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
  for (const timing of [
    { primary: 0, secondary: 0 },
    { primary: 1790090400.125, secondary: 1790090401.25 }
  ]) {
    for (const [component, values, read] of [
      [
        api.PlayerInventory,
        { active: 'm4a1', items: [{ id: 'm4a1', clip: 30, reserve: 90, timing }] },
        (v) => v.items[0].timing
      ],
      [api.PlayerInventory, { active: 'knife', items: [], knifeTiming: timing }, (v) => v.knifeTiming],
      [api.DroppedWeapon, { gun: 'm4a1', clip: 30, timing }, (v) => v.timing],
      [api.Weapon, { name: 'M4A1', revision: 12, deployedTimers: timing }, (v) => v.deployedTimers]
    ]) {
      const buffer = new ReadWriteByteBuffer()
      component.schema.serialize(component.schema.extend(values), buffer)
      const decoded = component.schema.deserialize(new ReadWriteByteBuffer(buffer.toBinary()))
      assert.deepEqual({ ...read(decoded) }, timing)
    }
  }
})

test('replacing a used item or starting a new life does not carry the previous weapon or knife lock', () => {
  const f = playerGun('m4a1')
  f.inventory().items[0].timing = { primary: 20, secondary: 20 }
  f.inventory().knifeTiming = { primary: 20, secondary: 20 }
  f.server.equipActiveWeapon(f.p.id)
  f.inventory().items[0] = { id: 'm4a1', clip: 30, reserve: 90 }
  f.server.equipActiveWeapon(f.p.id)
  f.at(11)
  f.shoot()
  assert.equal(f.p.weapon().ammoClip, 29)
  const target = f.addPlayer('target', 1, { ...feet, x: 94.4 })
  const fresh = startingInventory(2)
  fresh.active = 'knife'
  f.component('PlayerInventory').createOrReplace(f.p.id, fresh)
  f.server.equipActiveWeapon(f.p.id)
  f.at(12)
  f.message('knifeAttack', 'me', {
    round: 1,
    revision: f.p.weapon().revision,
    shotId: 2,
    attack: 'stab',
    direction: { x: -Math.SQRT1_2, y: -Math.SQRT1_2, z: 0 }
  })
  assert.equal(target.health().current, 35)
})
