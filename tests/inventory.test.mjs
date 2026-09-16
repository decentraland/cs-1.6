import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const output = mkdtempSync(join(tmpdir(), 'cs16-inventory-'))
const require = createRequire(import.meta.url)
execFileSync(process.execPath, [
  'node_modules/typescript/bin/tsc',
  'src/inventory-rules.ts',
  'src/gun-accuracy.ts',
  'src/recoil-prediction.ts',
  '--target',
  'es2020',
  '--module',
  'commonjs',
  '--outDir',
  output,
  '--skipLibCheck'
])
const { startingInventory, buyGun, buyGunAmmo, selectWeapon, SemiAutoTrigger } = require(
  join(output, 'inventory-rules.js')
)
const { GUNS } = require(join(output, 'weapon-profiles.js'))
const { freshGunAccuracy, gunSpread, gunKick } = require(join(output, 'gun-accuracy.js'))
const { RecoilPrediction } = require(join(output, 'recoil-prediction.js'))
after(() => rmSync(output, { recursive: true, force: true }))
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`)

test('team spawns receive the original pistol and two spare magazines, without a free rifle', () => {
  assert.deepEqual(startingInventory(1), { active: 'glock18', items: [{ id: 'glock18', clip: 20, reserve: 40 }] })
  assert.deepEqual(startingInventory(2), { active: 'usp', items: [{ id: 'usp', clip: 12, reserve: 24 }] })
  assert.deepEqual(startingInventory(2, 'ak47'), {
    active: 'ak47',
    items: [
      { id: 'usp', clip: 12, reserve: 24 },
      { id: 'ak47', clip: 30, reserve: 90 }
    ]
  })
})
test('rifle buying enforces side and funds, charges once, and includes only its magazine', () => {
  const inventory = startingInventory(2),
    before = structuredClone(inventory)
  assert.ok(buyGun(inventory, 'ak47', 2, 16000).error)
  assert.ok(buyGun(inventory, 'm4a1', 2, 800).error)
  assert.deepEqual(inventory, before)
  assert.deepEqual(buyGun(inventory, 'm4a1', 2, 4000), { money: 900 })
  assert.equal(inventory.active, 'm4a1')
  assert.deepEqual(inventory.items[1], { id: 'm4a1', clip: 30, reserve: 0 })
  assert.ok(buyGun(inventory, 'm4a1', 2, 16000).error)
  assert.ok(buyGun(inventory, '__proto__', 2, 16000).error)
})
test('switching preserves both magazines and reserves, and cannot select an absent slot', () => {
  const inventory = startingInventory(1)
  assert.equal(selectWeapon(inventory, 'primary'), undefined)
  buyGun(inventory, 'ak47', 1, 3000)
  inventory.items[0].clip = 13
  inventory.items[1].clip = 17
  assert.equal(selectWeapon(inventory, 'melee'), 'knife')
  assert.equal(selectWeapon(inventory, 'secondary'), 'glock18')
  assert.equal(selectWeapon(inventory, 'primary'), 'ak47')
  assert.deepEqual(
    inventory.items.map((i) => [i.clip, i.reserve]),
    [
      [13, 40],
      [17, 0]
    ]
  )
})
test('ammo purchases use each caliber price, pack and capacity independently of selected slot', () => {
  const inventory = startingInventory(2)
  buyGun(inventory, 'm4a1', 2, 4000)
  assert.deepEqual(buyGunAmmo(inventory, 'primary', 200), { money: 140 })
  assert.equal(inventory.items[1].reserve, 30)
  assert.deepEqual(buyGunAmmo(inventory, 'secondary', 100), { money: 75 })
  assert.equal(inventory.items[0].reserve, 36)
  inventory.items[0].reserve = 99
  buyGunAmmo(inventory, 'secondary', 100)
  assert.equal(inventory.items[0].reserve, 100)
  assert.ok(buyGunAmmo(inventory, 'secondary', 100).error)
  assert.ok(buyGunAmmo(startingInventory(1), 'primary', 16000).error)
})
test('pistol purchase replaces only the secondary slot and preserves the rifle', () => {
  const inventory = startingInventory(2)
  buyGun(inventory, 'm4a1', 2, 4000)
  assert.deepEqual(buyGun(inventory, 'glock18', 2, 800), { money: 400, dropped: { id: 'usp', clip: 12, reserve: 0 } })
  assert.deepEqual(
    inventory.items.map((i) => i.id),
    ['m4a1', 'glock18']
  )
  assert.equal(inventory.active, 'm4a1')
})
test('buying selects the best weapon left after a replacement before considering the new gun', () => {
  const ct = startingInventory(2, 'awp')
  ct.items[1].clip = 4
  assert.equal(buyGun(ct, 'deagle', 2, 1000).money, 350)
  assert.equal(ct.active, 'awp')
  assert.equal(ct.items.find((item) => item.id === 'awp').clip, 4)
  const t = startingInventory(1, 'ak47')
  t.active = 'knife'
  buyGun(t, 'deagle', 1, 16000)
  assert.equal(t.active, 'ak47')
  const pistol = startingInventory(2)
  buyGun(pistol, 'glock18', 2, 16000)
  assert.equal(pistol.active, 'glock18')
  const missing = { active: 'awp', items: [{ id: 'awp', clip: 0, reserve: 0 }] }
  buyGun(missing, 'usp', 2, 16000)
  assert.equal(missing.active, 'awp')
  const empty = { active: 'knife', items: [] }
  buyGun(empty, 'usp', 2, 16000)
  assert.equal(empty.active, 'usp')
})
test('one pistol shot per press also works when a short tap is released before the shot arrives', () => {
  const trigger = new SemiAutoTrigger()
  assert.equal(trigger.claim(), false)
  trigger.update(true)
  assert.equal(trigger.claim(), true)
  for (let i = 0; i < 20; i++) {
    trigger.update(true)
    assert.equal(trigger.claim(), false)
  }
  trigger.update(false)
  trigger.update(true)
  trigger.update(false)
  assert.equal(trigger.claim(), true)
  assert.equal(trigger.claim(), false)
  trigger.reset()
  assert.equal(trigger.claim(), false)
})
test('USP and Glock use previous-shot accuracy, rapid-tap penalties and their own camera punch', () => {
  for (const id of ['usp', 'glock18']) {
    const state = freshGunAccuracy(id),
      base = GUNS[id].accuracy
    near(gunSpread(state, id, 100, 0, true), 0.1 * (1 - base))
    gunKick(state, id, 0, true, () => 0.5)
    near(state.pitch, id === 'usp' ? 2 : 0)
    near(state.yaw, 0)
    near(gunSpread(state, id, 100.15, 0, true), 0.1 * (1 - base))
    assert.ok(state.accuracy < base)
    const previous = state.accuracy
    near(gunSpread(state, id, 101, 0, true), 0.1 * (1 - previous))
    near(state.accuracy, base)
    assert.ok(gunSpread(state, id, 102, 6.25, true) > 0.1 * (1 - base))
    assert.ok(gunSpread(state, id, 103, 0, false) > 0.1 * (1 - base) * 5)
  }
})
test('M4A1 compatibility accuracy uses integer division and its own moving recoil limits', () => {
  const state = freshGunAccuracy('m4a1')
  near(gunSpread(state, 'm4a1', 100, 0, true), 0.004)
  near(state.accuracy, 0.3)
  gunKick(state, 'm4a1', 0, true, () => 0.5)
  near(state.pitch, 0.65)
  for (let i = 0; i < 30; i++) {
    gunSpread(state, 'm4a1', 100.01 + i * 0.01, 5.75, true)
    gunKick(state, 'm4a1', 5.75, true, () => 0.5)
  }
  assert.equal(state.accuracy, 1)
  assert.ok(state.pitch <= 3.75)
  assert.ok(Math.abs(state.yaw) <= 3)
})
test('local pistol and M4 prediction matches server punch without replaying delayed acknowledgements', () => {
  for (const id of ['usp', 'glock18', 'm4a1']) {
    const recoil = new RecoilPrediction(id),
      server = freshGunAccuracy(id)
    recoil.trigger(true, 100)
    recoil.predict(1, 100, 0, true)
    gunSpread(server, id, 100, 0, true)
    gunKick(server, id, 0, true, () => 0.5)
    near(recoil.punch(100).pitch, server.pitch)
    const before = recoil.punch(100.4)
    recoil.confirm(1, server, 100.4)
    near(recoil.punch(100.4).pitch, before.pitch)
  }
})
