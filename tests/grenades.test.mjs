import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'
const load = compile('grenade-rules', 'pickup-rules')
const { GRENADES } = load('grenade-profiles')
const {
  buyGrenade,
  grenadeCount,
  advanceGrenadeAction,
  grenadeLaunch,
  bounceGrenade,
  heDamage,
  flashEffect,
  flashOpacity,
  smokeLength,
  smokeOpacity,
  SMOKE_CANISTER_SECONDS,
  SMOKE_SIGHT_SECONDS,
  SMOKE_VISUAL_SECONDS
} = load('grenade-rules')
const { startingInventory, selectWeapon, bestGun } = load('inventory-rules')
const { deathGun, dropGun } = load('pickup-rules')
const near = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≈ ${b}`)

test('original grenade prices and carry limits charge once per accepted item', () => {
  const inventory = startingInventory(2)
  let money = 1000
  for (const [id, price, capacity] of [
    ['flashbang', 200, 2],
    ['hegrenade', 300, 1],
    ['smokegrenade', 300, 1]
  ]) {
    assert.equal(GRENADES[id].price, price)
    assert.equal(GRENADES[id].capacity, capacity)
    for (let count = 1; count <= capacity; count++) {
      const result = buyGrenade(inventory, id, money)
      assert.equal(result.error, undefined)
      assert.equal(result.money, money - price)
      money = result.money
      assert.equal(grenadeCount(inventory, id), count)
    }
    assert.ok(buyGrenade(inventory, id, money).error)
    assert.equal(grenadeCount(inventory, id), capacity)
  }
  assert.equal(money, 0)
  assert.equal(inventory.active, 'usp')
  assert.ok(buyGrenade(inventory, '__proto__', 1000).error)
  const empty = { active: 'knife', items: [] }
  assert.ok(buyGrenade(empty, 'hegrenade', 299).error)
  assert.deepEqual(empty.items, [])
})
test('grenade selection cycles Flash HE Smoke, skips exhausted items, and respects gun/C4 weights', () => {
  const inventory = { active: 'knife', items: [] }
  buyGrenade(inventory, 'smokegrenade', 16000)
  assert.equal(inventory.active, 'smokegrenade')
  buyGrenade(inventory, 'flashbang', 16000)
  assert.equal(inventory.active, 'smokegrenade')
  buyGrenade(inventory, 'hegrenade', 16000)
  assert.equal(inventory.active, 'hegrenade')
  assert.equal(bestGun(inventory), 'hegrenade')
  inventory.active = 'knife'
  assert.equal(selectWeapon(inventory, 'grenade'), 'flashbang')
  assert.equal(selectWeapon(inventory, 'grenade'), 'hegrenade')
  assert.equal(selectWeapon(inventory, 'grenade'), 'smokegrenade')
  inventory.items.find((i) => i.id === 'flashbang').reserve = 0
  assert.equal(selectWeapon(inventory, 'grenade'), 'hegrenade')
  const carrier = { active: 'knife', items: [] }
  buyGrenade(carrier, 'hegrenade', 16000, 'c4')
  assert.equal(carrier.active, 'knife')
})
test('holding a pin never cooks the grenade; release waits at least 0.5 seconds', () => {
  const action = { held: true, mode: 0, readyAt: 1 }
  assert.equal(advanceGrenadeAction(action, 1, 0.9), undefined)
  assert.equal(advanceGrenadeAction(action, 1, 1), 'pin')
  assert.equal(advanceGrenadeAction(action, 1, 100), undefined)
  assert.equal(action.mode, 1)
  action.held = false
  assert.equal(advanceGrenadeAction(action, 1, 101), 'throw')
  assert.equal(action.readyAt, 101.5)
  assert.equal(advanceGrenadeAction(action, 0, 101.49), undefined)
  assert.equal(advanceGrenadeAction(action, 0, 101.5), 'retire')
  const tap = { held: true, mode: 0, readyAt: 0 }
  advanceGrenadeAction(tap, 2, 0)
  tap.held = false
  assert.equal(advanceGrenadeAction(tap, 2, 0.49), undefined)
  assert.equal(advanceGrenadeAction(tap, 2, 0.5), 'throw')
  assert.equal(tap.readyAt, 1.25)
  assert.equal(advanceGrenadeAction(tap, 1, 1.25, 'flashbang'), 'retire')
  assert.equal(tap.mode, 0)
})
test('throws use the original pitch correction, capped speed, eye offset and inherited velocity', () => {
  const eye = { x: 0, y: 1.6, z: 0 },
    zero = { x: 0, y: 0, z: 0 }
  const flat = grenadeLaunch(eye, { x: 0, y: 0, z: 1 }, zero)
  near(Math.hypot(...Object.values(flat.velocity)), 15)
  near(flat.velocity.y, Math.sin(Math.PI / 18) * 15)
  near(flat.position.y, 1.6 + Math.sin(Math.PI / 18) * 0.4)
  near(grenadeLaunch(eye, { x: 0, y: 1, z: 0 }, zero).velocity.y, 18.75)
  near(grenadeLaunch(eye, { x: 0, y: -1, z: 0 }, zero).velocity.y, 0)
  const moving = grenadeLaunch(eye, { x: 0, y: 0, z: 5 }, { x: 2, y: 3, z: 4 })
  near(moving.velocity.x, flat.velocity.x + 2)
  near(moving.velocity.y, flat.velocity.y + 3)
  near(moving.velocity.z, flat.velocity.z + 4)
  assert.equal(grenadeLaunch(eye, zero, zero), undefined)
  assert.equal(grenadeLaunch(eye, { x: NaN, y: 0, z: 0 }, zero), undefined)
})
const ground = (origin, direction, limit) => {
  const distance = direction.y < 0 ? Math.max(0, -origin.y / direction.y) : Infinity
  const solid = distance <= limit,
    travel = solid ? distance : limit
  return {
    distance: travel,
    position: {
      x: origin.x + direction.x * travel,
      y: origin.y + direction.y * travel,
      z: origin.z + direction.z * travel
    },
    solid,
    allSolid: false,
    startSolid: false,
    normal: { x: 0, y: 1, z: 0 },
    material: 'C',
    texture: 'ground'
  }
}
const motion = () => ({
  position: { x: 0, y: 2, z: 0 },
  velocity: { x: 2, y: 0, z: 3 },
  grounded: false,
  bounces: 0,
  accumulator: 0
})
test('grenade bounces stay above the floor, settle, and do not depend on render frame rate', () => {
  for (const id of Object.keys(GRENADES)) {
    const fast = motion(),
      slow = motion()
    for (let i = 0; i < 200; i++) bounceGrenade(fast, id, 0.01, ground)
    for (let i = 0; i < 40; i++) bounceGrenade(slow, id, 0.05, ground)
    near(fast.position.x, slow.position.x, 0.06)
    near(fast.position.z, slow.position.z, 0.06)
    for (let i = 0; i < 200; i++) bounceGrenade(fast, id, 0.01, ground)
    assert.ok(fast.bounces >= 1)
    assert.equal(fast.grounded, true)
    assert.ok(fast.position.y >= 0)
    assert.deepEqual(fast.velocity, { x: 0, y: 0, z: 0 })
  }
})
test('HE damage has the original 100-point linear falloff across 350 units', () => {
  near(heDamage(0), 100)
  near(heDamage(4.375), 50)
  near(heDamage(8.75), 0)
  near(heDamage(20), 0)
})
test('flash facing changes opacity, hold and fade; overlapping flashes preserve stronger effects', () => {
  const front = flashEffect(0, true, 10),
    back = flashEffect(0, false, 10)
  assert.deepEqual(front, { start: 10, alpha: 255, fade: 12, hold: 4 / 1.5 })
  assert.deepEqual(back, { start: 10, alpha: 200, fade: 7, hold: 4 / 3.5 })
  near(flashOpacity(front, 11), 1)
  near(flashOpacity(front, 10 + front.hold + 6), 0.5)
  near(flashOpacity(front, 25), 0)
  const stacked = flashEffect(18.75, true, 11, front)
  near(stacked.hold, 3)
  near(stacked.fade, 12)
  assert.equal(stacked.alpha, 255)
  const weaker = flashEffect(18.75, false, 11, front)
  near(weaker.hold, 2 / 3.5)
  near(weaker.fade, 12)
  assert.equal(weaker.alpha, 255)
})
test('smoke sight preserves source endpoint cases and cloud lifetime differs from visual fade', () => {
  const center = { x: 0, y: 0, z: 0 }
  near(smokeLength({ x: -10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, center), 5.75)
  near(smokeLength(center, { x: 10, y: 0, z: 0 }, center), 2.875)
  near(smokeLength(center, { x: 1, y: 0, z: 0 }, center), 1)
  near(smokeLength({ x: -10, y: 3, z: 0 }, { x: 10, y: 3, z: 0 }, center), 0)
  near(smokeLength({ x: 1, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, center), Math.sqrt(2.875 ** 2 - 1))
  near(smokeLength(center, center, center), 0)
  assert.equal(SMOKE_CANISTER_SECONDS, 21.1)
  assert.equal(SMOKE_SIGHT_SECONDS, 25.1)
  assert.equal(SMOKE_VISUAL_SECONDS, 30)
  near(smokeOpacity(15), 1)
  near(smokeOpacity(20), 165 / 255)
  near(smokeOpacity(30), 0)
})
test('unprimed grenades are discarded on death and cannot be manually dropped', () => {
  const inventory = startingInventory(2, 'm4a1')
  buyGrenade(inventory, 'hegrenade', 300)
  inventory.active = 'hegrenade'
  assert.equal(dropGun(inventory), undefined)
  assert.equal(grenadeCount(inventory, 'hegrenade'), 1)
  assert.equal(deathGun(inventory).id, 'm4a1')
  assert.deepEqual(inventory.items, [])
})
