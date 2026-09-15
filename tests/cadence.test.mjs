import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authorizeShot, claimShot, fireShot, shotDeadline, nextClientShotTime } from '../src/combat-rules.ts'

const epoch = 1789032000
const rate = 0.0955
const fresh = () => ({
  ammoClip: 30,
  maxAmmoClip: 30,
  ammoReserve: 90,
  fireRate: rate,
  lastShotTime: 0,
  lastShotId: 0,
  isReloading: false,
  reloadTime: 2.45,
  reloadStartTime: 0
})

test('a request arriving 20 ms early waits without spending ammo or firing before the deadline', () => {
  const weapon = fresh()
  authorizeShot(weapon, 1, epoch, true)
  assert.equal(claimShot(weapon, 2), undefined)
  const at = shotDeadline(weapon.lastShotTime, rate, epoch + rate - 0.02)
  assert.equal(at, epoch + rate)
  assert.equal(fireShot(weapon, at - 0.001, true, at), 'cooldown')
  assert.equal(weapon.ammoClip, 29)
  assert.equal(fireShot(weapon, at, true, at), undefined)
  assert.equal(weapon.ammoClip, 28)
  assert.equal(claimShot(weapon, 2), 'sequence')
})

test('thirty full-auto shots survive 60 Hz client frames, 30 Hz server ticks, and variable arrival delay', () => {
  const requests = []
  let clientTime = 0
  for (let frame = 0; requests.length < 30; frame++) {
    const now = epoch + frame / 60
    if (now - clientTime + 1e-6 < rate) continue
    clientTime = nextClientShotTime(clientTime, rate, now)
    requests.push({ id: requests.length + 1, at: now + 0.04 + [0, 0.008, -0.008, 0.012, -0.012][requests.length % 5] })
  }
  const weapon = fresh(),
    legacy = fresh(),
    fired = []
  let pending,
    index = 0,
    legacyCount = 0
  for (let tick = 0; tick < 100; tick++) {
    const now = epoch + tick / 30
    if (pending && pending.at <= now) {
      assert.equal(fireShot(weapon, now, true, pending.at), undefined)
      fired.push({ at: pending.at, actual: now })
      pending = undefined
    }
    while (index < requests.length && requests[index].at <= now) {
      const request = requests[index++]
      if (!authorizeShot(legacy, request.id, now, true)) legacyCount++
      assert.equal(claimShot(weapon, request.id), undefined)
      assert.equal(pending, undefined, 'one pending request suffices at the supported cadence')
      const at = shotDeadline(weapon.lastShotTime, rate, now)
      assert.notEqual(at, undefined, 'valid full-auto request is not discarded')
      if (at > now) pending = { at }
      else {
        assert.equal(fireShot(weapon, now, true, at), undefined)
        fired.push({ at, actual: now })
      }
    }
  }
  assert.equal(fired.length, 30)
  assert.equal(weapon.ammoClip, 0)
  assert.ok(legacyCount < 30, 'reproduces the old dropped-shot failure')
  for (let i = 1; i < fired.length; i++) {
    assert.ok(Math.abs(fired[i].at - fired[i - 1].at - rate) < 1e-6)
    assert.ok(fired[i].actual >= fired[i].at)
  }
  assert.ok(fired.at(-1).actual - fired[0].actual < 2.85)
})

test('requests far ahead of cadence cannot queue; a long stall starts a fresh schedule', () => {
  assert.equal(shotDeadline(epoch, 0.4, epoch + 0.2), undefined)
  assert.equal(shotDeadline(epoch, rate, epoch + 1), epoch + 1)
  assert.equal(nextClientShotTime(epoch, rate, epoch + 1), epoch + 1)
  const weapon = fresh()
  authorizeShot(weapon, 1, epoch, true)
  assert.equal(fireShot(weapon, epoch, true, epoch + rate), 'cooldown')
  assert.equal(weapon.ammoClip, 29)
})

test('deferred shots still honor death, reload, and ammo at execution time', () => {
  for (const [overrides, alive, reason] of [
    [{}, false, 'dead'],
    [{ isReloading: true, reloadStartTime: epoch }, true, 'reloading'],
    [{ ammoClip: 0 }, true, 'empty']
  ]) {
    const weapon = { ...fresh(), ...overrides }
    const ammo = weapon.ammoClip
    claimShot(weapon, 1)
    assert.equal(fireShot(weapon, epoch + 0.1, alive, epoch + 0.0955), reason)
    assert.equal(weapon.ammoClip, ammo)
  }
  const weapon = { ...fresh(), isReloading: true, ammoClip: 0, reloadStartTime: epoch - 2.35 }
  assert.equal(fireShot(weapon, epoch + 0.11, true, epoch + 0.0955), undefined, 'reload uses actual execution time')
  assert.equal(weapon.ammoClip, 29)
})
