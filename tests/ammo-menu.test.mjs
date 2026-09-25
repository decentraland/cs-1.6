import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'
import { touchUI, buttons, nodes } from './helpers/touch-ui.mjs'
const load = compile('inventory-rules')
const { GUNS } = load('weapon-profiles')
const { buyGunAmmo, ammoFillPrice, syncAmmoPool } = load('inventory-rules')
const inventory = (gun, reserve = 0) => ({ active: gun.id, items: [{ id: gun.id, clip: 1, reserve }] })

test('buy-menu ammunition fills all 24 guns with paid packs and leaves loaded rounds unchanged', () => {
  for (const gun of Object.values(GUNS)) {
    const inv = inventory(gun)
    const cost = Math.ceil(gun.reserve / gun.ammoPack) * gun.ammoPrice
    assert.equal(buyGunAmmo(inv, gun.slot, 16000, true).money, 16000 - cost, gun.id)
    assert.equal(inv.items[0].reserve, gun.reserve, gun.id)
    assert.equal(inv.items[0].clip, 1, gun.id)
    assert.equal(ammoFillPrice(gun, 0, 16000), cost, gun.id)
  }
})

test('limited funds buy only affordable packs, including a full-price final partial pack', () => {
  for (const gun of Object.values(GUNS)) {
    const inv = inventory(gun)
    const funds = gun.ammoPrice * 2 + 1
    assert.equal(buyGunAmmo(inv, gun.slot, funds, true).money, 1, gun.id)
    assert.equal(inv.items[0].reserve, Math.min(gun.reserve, gun.ammoPack * 2), gun.id)
    assert.equal(ammoFillPrice(gun, 0, funds), funds - 1, gun.id)
    syncAmmoPool(inv, gun.id, gun.reserve - 1)
    assert.equal(buyGunAmmo(inv, gun.slot, funds, true).money, funds - gun.ammoPrice, gun.id)
    assert.equal(inv.items[0].reserve, gun.reserve, gun.id)
  }
})

test('unaffordable, full and missing-slot ammo purchases do not mutate money or inventory', () => {
  for (const gun of Object.values(GUNS)) {
    for (const [reserve, funds, slot] of [
      [0, gun.ammoPrice - 1, gun.slot],
      [gun.reserve, 16000, gun.slot],
      [0, 16000, 'absent']
    ]) {
      const inv = inventory(gun, reserve),
        before = structuredClone(inv)
      const result = buyGunAmmo(inv, slot, funds, true)
      assert.ok(result.error, gun.id)
      assert.equal(result.money, funds, gun.id)
      assert.deepEqual(inv, before, gun.id)
    }
  }
})

test('a menu fill updates the shared caliber once; one-pack buying remains available to bot policy', () => {
  const inv = {
    active: 'glock18',
    items: [
      { id: 'glock18', clip: 7, reserve: 40 },
      { id: 'mp5', clip: 20, reserve: 40 }
    ]
  }
  assert.equal(buyGunAmmo(inv, 'primary', 200, true).money, 140)
  assert.deepEqual(
    inv.items.map((item) => item.reserve),
    [120, 120]
  )
  assert.deepEqual(
    inv.items.map((item) => item.clip),
    [7, 20]
  )
  assert.ok(buyGunAmmo(inv, 'secondary', 140, true).error)
  assert.deepEqual(inv.ammo, [{ type: '9mm', amount: 120 }])
  const single = inventory(GUNS.m4a1)
  assert.equal(buyGunAmmo(single, 'primary', 1000).money, 940)
  assert.equal(single.items[0].reserve, 30)
})

function ammoRow(ui, name) {
  const tree = ui.load('buy-ui.tsx').BuyHud({ width: 1280, height: 720 })
  const row = buttons(tree).find((button) => button.label === name)
  assert.ok(row, name)
  return {
    row,
    detail: nodes(row)
      .filter((node) => typeof node.props.value === 'string')
      .map((node) => node.props.value)[1]
  }
}

test('the actual touch buy menu quotes the affordable fill and disables a full reserve', () => {
  const ui = touchUI()
  ui.state.buy = true
  ui.state.weapon = { name: 'M4A1', ammoReserve: 0 }
  ui.state.inventory = {
    active: 'm4a1',
    items: [
      { id: 'm4a1', clip: 30, reserve: 0 },
      { id: 'usp', clip: 12, reserve: 24 }
    ]
  }
  let primary = ammoRow(ui, 'PRIMARY AMMO')
  assert.equal(primary.detail, '$180')
  primary.row.props.onMouseDown()
  primary.row.props.onMouseUp()
  assert.deepEqual(ui.calls, [['purchase', 'ammo']])
  assert.equal(ammoRow(ui, 'SECONDARY AMMO').detail, '$175')
  ui.state.money = 125
  primary = ammoRow(ui, 'PRIMARY AMMO')
  assert.equal(primary.detail, '$120')
  primary.row.props.onMouseDown()
  primary.row.props.onMouseUp()
  assert.equal(ui.calls.length, 2)
  ui.state.money = 59
  primary = ammoRow(ui, 'PRIMARY AMMO')
  assert.equal(primary.detail, '$60')
  primary.row.props.onMouseDown()
  primary.row.props.onMouseUp()
  assert.equal(ui.calls.length, 2)
  ui.state.money = 16000
  ui.state.weapon.ammoReserve = 90
  primary = ammoRow(ui, 'PRIMARY AMMO')
  assert.equal(primary.detail, undefined)
  primary.row.props.onMouseDown()
  primary.row.props.onMouseUp()
  assert.equal(ui.calls.length, 2)
})
