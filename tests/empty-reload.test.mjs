import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'

const load = compile('combat-rules', 'weapon-profiles')
const { canAutoReload, startReload, finishReload } = load('combat-rules')
const { GUNS } = load('weapon-profiles')
const empty = (id) => {
  const gun = GUNS[id]
  return {
    name: gun.name,
    ammoClip: 0,
    maxAmmoClip: gun.clip,
    ammoReserve: gun.reserve,
    fireRate: gun.fireRate,
    lastShotTime: 10,
    lastShotId: 1,
    isReloading: false,
    reloadTime: gun.reloadTime,
    reloadStartTime: 0
  }
}

test('only M3 and XM1014 automatically reload an empty gun while fire remains held', () => {
  for (const id of Object.keys(GUNS)) {
    const weapon = empty(id)
    assert.equal(canAutoReload(weapon, true, true), id === 'm3' || id === 'xm1014', id)
    assert.equal(canAutoReload(weapon, true, false), true, id + ' released')
    assert.equal(canAutoReload(weapon, false, false), false, id + ' dead')
    assert.equal(canAutoReload({ ...weapon, ammoClip: 1 }, true, false), false, id + ' loaded')
    assert.equal(canAutoReload({ ...weapon, ammoReserve: 0 }, true, false), false, id + ' no reserve')
    assert.equal(canAutoReload({ ...weapon, isReloading: true }, true, false), false, id + ' in progress')
  }
})

test('release starts a magazine reload once, with its original duration and conserved reserve', () => {
  for (const id of ['ak47', 'm4a1', 'awp', 'usp', 'famas', 'glock18', 'p90', 'm249']) {
    const weapon = empty(id)
    assert.equal(canAutoReload(weapon, true, true), false)
    assert.equal(canAutoReload(weapon, true, false), true)
    assert.equal(startReload(weapon, 20, true), true)
    assert.equal(canAutoReload(weapon, true, false), false)
    assert.equal(finishReload(weapon, 20 + weapon.reloadTime - 0.01), false)
    assert.equal(finishReload(weapon, 20 + weapon.reloadTime), true)
    assert.equal(weapon.ammoClip, GUNS[id].clip)
    assert.equal(weapon.ammoReserve, GUNS[id].reserve - GUNS[id].clip)
  }
})
