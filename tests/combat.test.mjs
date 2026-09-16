import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'
const { authorizeShot, finishReload, startReload } = compile('combat-rules')('combat-rules')

const epoch = 1789032000
const fresh = (overrides = {}) => ({
  ammoClip: 30,
  maxAmmoClip: 30,
  ammoReserve: 90,
  fireRate: 0.1,
  lastShotTime: 0,
  lastShotId: 0,
  isReloading: false,
  reloadTime: 2.5,
  reloadStartTime: 0,
  ...overrides
})

test('misses consume ammunition and duplicate or reordered requests cannot spend another round', () => {
  const state = fresh()
  assert.equal(authorizeShot(state, 1, epoch, true), undefined)
  assert.equal(state.ammoClip, 29)
  assert.equal(authorizeShot(state, 1, epoch + 1, true), 'sequence')
  assert.equal(authorizeShot(state, 0, epoch + 2, true), 'sequence')
  assert.equal(state.ammoClip, 29)
})

test('server clock enforces cadence at modern epoch precision, including the exact boundary', () => {
  const state = fresh()
  authorizeShot(state, 1, epoch, true)
  assert.equal(authorizeShot(state, 2, epoch + 0.099, true), 'cooldown')
  assert.equal(authorizeShot(state, 2, epoch + 1, true), 'sequence')
  assert.equal(authorizeShot(state, 3, epoch + 0.1, true), undefined)
  assert.equal(state.ammoClip, 28)
})

test('dead, empty, and reloading players cannot shoot', () => {
  for (const [state, alive, reason] of [
    [fresh(), false, 'dead'],
    [fresh({ ammoClip: 0 }), true, 'empty'],
    [fresh({ isReloading: true, reloadStartTime: epoch }), true, 'reloading']
  ]) {
    const ammo = state.ammoClip
    assert.equal(authorizeShot(state, 1, epoch, alive), reason)
    assert.equal(state.ammoClip, ammo)
  }
})

test('reload conserves total ammo and completes only at its server deadline', () => {
  const state = fresh({ ammoClip: 12 })
  assert.equal(startReload(state, epoch, true), true)
  assert.equal(startReload(state, epoch + 1, true), false)
  assert.equal(finishReload(state, epoch + 2.499), false)
  assert.equal(state.ammoClip, 12)
  assert.equal(finishReload(state, epoch + 2.5), true)
  assert.equal(state.ammoClip, 30)
  assert.equal(state.ammoReserve, 72)
  assert.equal(finishReload(state, epoch + 5), false)
})

test('limited reserve loads only available rounds; full, empty reserve, and dead reloads are rejected', () => {
  const state = fresh({ ammoClip: 0, ammoReserve: 7 })
  assert.equal(startReload(state, epoch, true), true)
  finishReload(state, epoch + 2.5)
  assert.equal(state.ammoClip, 7)
  assert.equal(state.ammoReserve, 0)
  assert.equal(startReload(state, epoch + 3, true), false)
  assert.equal(startReload(fresh(), epoch, true), false)
  assert.equal(startReload(fresh({ ammoClip: 1 }), epoch, false), false)
})

test('first shot after reload deadline is accepted even before the next reload system tick', () => {
  const state = fresh({ ammoClip: 0 })
  startReload(state, epoch, true)
  assert.equal(authorizeShot(state, 1, epoch + 2.5, true), undefined)
  assert.equal(state.ammoClip, 29)
  assert.equal(state.ammoReserve, 60)
})

test('invalid shot identifiers never change weapon state', () => {
  for (const id of [NaN, Infinity, -1, 1.2, 2147483648]) {
    const state = fresh()
    assert.equal(authorizeShot(state, id, epoch, true), 'sequence')
    assert.deepEqual(state, fresh())
  }
})
