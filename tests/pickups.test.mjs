import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'
const load = compile('pickup-rules', 'solid-trace', 'penetration')
const { dropGun, dropDirection, deathGun, pickupGun, tossGun, touchesGun } = load('pickup-rules')
const { startingInventory, buyGun, syncAmmoPool, weaponWeight } = load('inventory-rules')
const { GUNS } = load('weapon-profiles')
const { SolidTracer } = load('solid-trace')
const { bulletWorldTrace } = load('penetration')
const { throwWeaponBox } = load('weapon-box-rules')

test('all 24 guns can be dropped and picked up without manufacturing ammo or losing their magazine/mode', () => {
  for (const gun of Object.values(GUNS)) {
    const owner = { active: gun.id, items: [{ id: gun.id, clip: gun.clip - 1, reserve: gun.reserve - 1, mode: 1 }] }
    const item = dropGun(owner)
    assert.deepEqual(item, { id: gun.id, clip: gun.clip - 1, reserve: 0, mode: 1 })
    assert.equal(owner.active, 'knife')
    assert.equal(owner.ammo[0].amount, gun.reserve - 1)
    const recipient = { active: 'knife', items: [] }
    assert.equal(pickupGun(recipient, item), true)
    assert.equal(recipient.active, gun.id)
    assert.deepEqual(recipient.items, [{ ...item }])
    assert.equal(pickupGun(recipient, item), false)
    assert.equal(dropGun(recipient).clip, gun.clip - 1)
    assert.equal(pickupGun(owner, item), true)
    assert.equal(owner.items[0].reserve, gun.reserve - 1)
  }
})
test('manual drops preserve shared caliber ammo; replacements return the old gun for the world', () => {
  const inventory = startingInventory(1, 'mp5')
  syncAmmoPool(inventory, 'mp5', 55)
  const box = dropGun(inventory)
  assert.equal(box.reserve, 0)
  assert.equal(inventory.items[0].reserve, 55)
  assert.equal(inventory.active, 'glock18')
  buyGun(inventory, 'ak47', 1, 16000)
  inventory.items.find((i) => i.id === 'ak47').clip = 11
  const result = buyGun(inventory, 'galil', 1, 16000)
  assert.deepEqual(result, { money: 14000, dropped: { id: 'ak47', clip: 11, reserve: 0 } })
  assert.equal(inventory.active, 'galil')
  assert.equal(dropGun(inventory, 'knife'), undefined)
  inventory.active = 'knife'
  dropGun(inventory, 'glock18')
  assert.equal(inventory.active, 'galil')
})
test('death drops the best gun even while holding knife or pistol, packs reserves, and discards the rest', () => {
  const inventory = startingInventory(2, 'm4a1')
  inventory.active = 'usp'
  inventory.items[1] = { id: 'm4a1', clip: 17, reserve: 45, mode: 1 }
  assert.deepEqual(deathGun(inventory), { id: 'm4a1', clip: 17, reserve: 45, mode: 1 })
  assert.deepEqual(inventory, { active: 'knife', items: [], ammo: [] })
  assert.equal(deathGun(inventory), undefined)
  const pistol = startingInventory(1)
  pistol.active = 'knife'
  assert.deepEqual(deathGun(pistol), { id: 'glock18', clip: 20, reserve: 40 })
})
test('pickups cross teams but never replace an occupied slot or strip ammo from its box', () => {
  const ct = startingInventory(2, 'm4a1'),
    before = structuredClone(ct)
  const item = { id: 'ak47', clip: 7, reserve: 90, mode: 0 }
  assert.equal(pickupGun(ct, item), false)
  assert.deepEqual(ct, before)
  dropGun(ct, 'm4a1')
  assert.equal(pickupGun(ct, item), true)
  assert.equal(ct.active, 'ak47')
  assert.equal(ct.items.find((i) => i.id === 'ak47').reserve, 90)
  assert.equal(pickupGun(ct, { id: '__proto__', clip: 5, reserve: 0 }), false)
})
test('pickup auto-switch uses source weights, permits empty guns, and supports disabling automatic selection', () => {
  assert.equal(weaponWeight('famas'), 75)
  assert.equal(weaponWeight('p90'), 26)
  assert.equal(weaponWeight('deagle'), 7)
  const inventory = startingInventory(2, 'awp')
  dropGun(inventory, 'usp')
  assert.equal(pickupGun(inventory, { id: 'deagle', clip: 7, reserve: 0 }), true)
  assert.equal(inventory.active, 'awp')
  const empty = { active: 'knife', items: [] }
  assert.equal(pickupGun(empty, { id: 'ak47', clip: 0, reserve: 90 }), true)
  assert.equal(empty.active, 'ak47')
  assert.equal(empty.items[0].reserve, 90)
  const noAmmo = startingInventory(2, 'awp')
  noAmmo.items[0].clip = 0
  noAmmo.items[0].reserve = 0
  dropGun(noAmmo)
  assert.equal(noAmmo.active, 'usp')
  const planting = { active: 'knife', items: [] }
  pickupGun(planting, { id: 'ak47', clip: 30, reserve: 0 }, false, 'c4')
  assert.equal(planting.active, 'knife')
  const carrying = { active: 'knife', items: [] }
  pickupGun(carrying, { id: 'usp', clip: 12, reserve: 0 }, true, 'c4')
  assert.equal(carrying.active, 'usp')
})
test('death-box reserve combines with retained ammo up to the source caliber limit', () => {
  const inventory = startingInventory(1, 'mp5')
  syncAmmoPool(inventory, 'mp5', 110)
  dropGun(inventory, 'mp5')
  pickupGun(inventory, { id: 'tmp', clip: 14, reserve: 90 })
  assert.equal(inventory.items.find((i) => i.id === 'tmp').reserve, 120)
  assert.equal(inventory.items.find((i) => i.id === 'glock18').reserve, 120)
})
test('source touch volumes include the player bounds, but exclude other floors and distant guns', () => {
  const feet = { x: 0, y: 0, z: 0 }
  assert.equal(touchesGun(feet, { x: 0.8, y: 0, z: 0.8 }), true)
  assert.equal(touchesGun(feet, { x: 0.801, y: 0, z: 0 }), false)
  assert.equal(touchesGun(feet, { x: 0, y: 1.81, z: 0 }), false)
  assert.equal(touchesGun(feet, { x: 0, y: -0.401, z: 0 }), false)
})
test('tossed guns hit a wall, slide downward, and settle on the original BSP floor', () => {
  const map = {
    planes: [
      [1, 0, 0, 2],
      [0, 1, 0, 0]
    ],
    nodes: [
      [0, -2, 1],
      [1, -1, -2]
    ],
    roots: [0],
    surfaces: [],
    vertices: []
  }
  const world = new SolidTracer(map)
  const motion = { position: { x: 0, y: 0.9, z: 0 }, velocity: { x: 10, y: 0, z: 0 }, settled: false }
  const trace = (...args) => world.trace(...args)
  for (let i = 0; i < 100; i++) tossGun(motion, 0.02, trace)
  assert.equal(motion.settled, true)
  assert.ok(motion.position.x < 2 && motion.position.x > 1.9)
  assert.ok(motion.position.y > 0 && motion.position.y < 0.002)
  assert.deepEqual(motion.velocity, { x: 0, y: 0, z: 0 })
  const trap = { position: { x: 3, y: 1, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, settled: false }
  tossGun(trap, 0.05, trace)
  assert.equal(trap.settled, false)
  const dust = {
    position: { x: 72.68839293, y: 7.5127, z: 69.39560782 },
    velocity: { x: 0, y: 0, z: 0 },
    settled: false
  }
  for (let i = 0; i < 80; i++) tossGun(dust, 0.02, bulletWorldTrace)
  assert.equal(dust.settled, true)
  assert.ok(Math.abs(dust.position.y - 6.6127) < 0.02)
})

test('drop direction follows GoldSrc body pitch and keeps the action yaw', () => {
  const raised = dropDirection({ x: 0, y: Math.sin(Math.PI / 3), z: 0.5 })
  assert.ok(Math.abs(raised.y + Math.sin(Math.PI / 9)) < 1e-12)
  assert.ok(Math.abs(raised.z - Math.cos(Math.PI / 9)) < 1e-12)
  const lowered = dropDirection({ x: 0.5, y: -Math.sin(Math.PI / 3), z: 0 })
  assert.ok(Math.abs(lowered.y - Math.sin(Math.PI / 9)) < 1e-12)
  assert.ok(Math.abs(lowered.x - Math.cos(Math.PI / 9)) < 1e-12)
  const vertical = dropDirection({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 })
  assert.ok(Math.abs(vertical.x - Math.cos(Math.PI / 6)) < 1e-12)
  assert.ok(Math.abs(vertical.y + 0.5) < 1e-12)
  for (const direction of [
    { x: NaN, y: 0, z: 1 },
    { x: 1, y: Infinity, z: 0 },
    { x: 0, y: 0, z: 0 }
  ])
    assert.equal(dropDirection(direction), undefined)
})

test('manual weapon-box toss starts 10 HU ahead at 400 HU/s, including its body-pitch height', () => {
  const direction = dropDirection({ x: 0, y: -Math.sin(Math.PI / 3), z: 0.5 })
  const clear = (origin, ray, length) => ({
    position: { x: origin.x + ray.x * length, y: origin.y + ray.y * length, z: origin.z + ray.z * length },
    solid: false,
    distance: length
  })
  const motion = throwWeaponBox({ x: 2, y: 3, z: 4 }, direction, clear)
  assert.ok(Math.abs(Math.hypot(motion.velocity.x, motion.velocity.y, motion.velocity.z) - 10) < 1e-12)
  assert.ok(Math.abs(motion.position.y - 3.9 - direction.y * 0.25) < 1e-12)
  assert.ok(Math.abs(motion.position.z - 4 - direction.z * 0.25) < 1e-12)
  assert.equal(motion.settled, false)
  const clipped = throwWeaponBox({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, (origin) => ({
    position: { ...origin, x: 0.05 },
    solid: true,
    distance: 0.05
  }))
  assert.equal(clipped.position.x, 0.049)
})
