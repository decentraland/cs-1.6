import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'
const {
  purchaseEquipment,
  equipmentPrice,
  freshLossHistory,
  roundPayments,
  creditedMoney,
  armorDamage,
  PurchaseSequences,
  playerRoundPayment,
  buyTimeRemaining,
  BUY_SECONDS
} = compile('economy-rules')('economy-rules')
const account = (changes = {}) => ({ money: 800, armor: 0, helmet: false, defuseKit: false, reserve: 60, ...changes })
const context = (changes = {}) => ({
  alive: true,
  eligible: true,
  team: 2,
  phase: 'live',
  elapsed: 10,
  inZone: true,
  ...changes
})

test('equipment purchases enforce money, team, ownership, ammo capacity, and original upgrade prices', () => {
  const ct = account()
  assert.equal(purchaseEquipment(ct, 'defusekit', context()), undefined)
  assert.equal(ct.money, 600)
  assert.equal(ct.defuseKit, true)
  assert.ok(purchaseEquipment(ct, 'defusekit', context()))
  assert.equal(ct.money, 600)
  assert.ok(purchaseEquipment(ct, 'kevlar', context()))
  assert.equal(ct.armor, 0)
  const t = account()
  assert.ok(purchaseEquipment(t, 'defusekit', context({ team: 1 })))
  assert.equal(purchaseEquipment(t, 'kevlar', context({ team: 1 })), undefined)
  assert.equal(t.money, 150)
  assert.equal(t.armor, 100)
  assert.equal(equipmentPrice(t, 'assaultsuit', 1), 350)
  t.money = 350
  assert.equal(purchaseEquipment(t, 'assaultsuit', context({ team: 1 })), undefined)
  assert.equal(t.helmet, true)
  assert.equal(t.money, 0)
  t.armor = 47
  assert.equal(equipmentPrice(t, 'assaultsuit', 1), 650)
  const ammo = account({ reserve: 89 })
  purchaseEquipment(ammo, 'ammo', context())
  assert.equal(ammo.reserve, 90)
  assert.equal(ammo.money, 720)
  assert.ok(purchaseEquipment(ammo, 'ammo', context()))
  assert.equal(ammo.money, 720)
})

test('dead, queued, wrong-zone, lobby, finished-match and expired purchases leave account unchanged', () => {
  for (const change of [
    { alive: false },
    { eligible: false },
    { inZone: false },
    { matchOver: true },
    { phase: 'ready' },
    { phase: 'waiting' },
    { elapsed: 90.001 }
  ]) {
    const state = account(),
      before = { ...state }
    assert.ok(purchaseEquipment(state, 'kevlar', context(change)))
    assert.deepEqual(state, before)
  }
  assert.equal(purchaseEquipment(account(), 'kevlar', context({ elapsed: 90 })), undefined)
  assert.equal(purchaseEquipment(account(), 'kevlar', context({ phase: 'freeze', elapsed: 120 })), undefined)
  assert.ok(purchaseEquipment(account(), 'invalid', context()))
})

test('living survivors can buy after any round result until the original buy deadline', () => {
  for (const phase of ['won', 'lost', 'draw']) {
    const survivor = account()
    assert.equal(purchaseEquipment(survivor, 'kevlar', context({ phase, elapsed: 90 })), undefined)
    assert.equal(survivor.money, 150)
    assert.equal(survivor.armor, 100)
    for (const change of [{ elapsed: 90.001 }, { alive: false }, { inZone: false }, { matchOver: true }]) {
      const state = account(),
        before = { ...state }
      assert.ok(purchaseEquipment(state, 'kevlar', context({ phase, ...change })))
      assert.deepEqual(state, before)
    }
  }
})

test('buy time survives a result countdown and resets on the next freeze', () => {
  assert.equal(buyTimeRemaining('ready', 0), -1)
  assert.equal(buyTimeRemaining('waiting', 0), -1)
  assert.equal(buyTimeRemaining('freeze', 120), 90)
  assert.equal(buyTimeRemaining('live', 0), 90)
  assert.equal(buyTimeRemaining('live', 20), 70)
  assert.equal(buyTimeRemaining('won', 20), 70)
  assert.equal(buyTimeRemaining('won', 25), 65)
  assert.equal(buyTimeRemaining('freeze', 0), 90)
  assert.equal(buyTimeRemaining('won', 25, true), -1)
  assert.equal(buyTimeRemaining('freeze', 0, true), -1)
})

test('replicated buy time and the precise server clock agree at expiry', () => {
  for (const phase of ['live', 'won', 'lost', 'draw']) {
    for (const elapsed of [0, 20.4, 89, 89.999, 90, 90.001, 91, 120]) {
      const remaining = buyTimeRemaining(phase, elapsed)
      assert.equal(remaining >= 0, elapsed <= BUY_SECONDS)
      const authoritative = purchaseEquipment(account(), 'kevlar', context({ phase, elapsed }))
      const replicated = purchaseEquipment(account(), 'kevlar', context({ phase, elapsed: BUY_SECONDS - remaining }))
      assert.equal(replicated, authoritative)
    }
  }
})

test('duplicate and reordered purchase requests cannot spend twice', () => {
  const sequences = new PurchaseSequences(),
    state = account()
  for (const seq of [2, 2, 1, NaN, Infinity, 2.1, 3])
    if (sequences.accept('ct', seq)) purchaseEquipment(state, 'ammo', context())
  assert.equal(state.money, 720)
  assert.equal(state.reserve, 90)
  assert.equal(sequences.accept('t', 1), true)
  sequences.clear()
  assert.equal(sequences.accept('ct', 1), true)
})

test('loss rewards preserve the original shared bonus history including a broken streak', () => {
  const history = freshLossHistory()
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map(() => roundPayments(history, 'ct', 'none').t),
    [1400, 1900, 2400, 2900, 3400, 3400]
  )
  assert.deepEqual(roundPayments(history, 't', 'exploded'), { ct: 1500, t: 3500 })
  assert.deepEqual(roundPayments(history, 't', 'planted'), { ct: 2000, t: 3250 })
  const before = { ...history }
  assert.deepEqual(roundPayments(history, 'draw', 'none'), { ct: 0, t: 0 })
  assert.deepEqual(history, before)
  assert.deepEqual(roundPayments(freshLossHistory(), 'ct', 'defused'), { ct: 3250, t: 2200 })
  assert.equal(creditedMoney(15900, 3250), 16000)
  assert.equal(creditedMoney(800, -1000), 0)
})

test('unplanted timeout denies surviving Terrorists but pays dead T and CT players', () => {
  assert.equal(playerRoundPayment(1400, 1, true, true), 0)
  assert.equal(playerRoundPayment(1400, 1, false, true), 1400)
  assert.equal(playerRoundPayment(3250, 2, true, true), 3250)
  assert.equal(playerRoundPayment(2200, 1, true, false), 2200)
})

test('AK armor penetration, helmet coverage and armor exhaustion match reference damage arithmetic', () => {
  const hit = armorDamage(100, 100, false, 'body')
  assert.equal(hit.damage, 77.5)
  assert.equal(hit.armor, 88.75)
  assert.deepEqual(armorDamage(100, 100, false, 'head'), { damage: 100, armor: 100 })
  assert.deepEqual(armorDamage(100, 100, true, 'head'), hit)
  assert.deepEqual(armorDamage(100, 100, true, 'legs'), { damage: 100, armor: 100 })
  assert.deepEqual(armorDamage(100, 5, true, 'body'), { damage: 90, armor: 0 })
  assert.deepEqual(armorDamage(100, 100, false, 'body', true), { damage: 50, armor: 75 })
  assert.deepEqual(armorDamage(100, 5, false, 'body', true), { damage: 95, armor: 0 })
})
