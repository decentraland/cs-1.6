import assert from 'node:assert/strict'
import { test } from 'node:test'
import { humanServer } from './helpers/human-server.mjs'
import { combatClient, InputAction as A } from './helpers/combat-client.mjs'
import { compile } from './compile.mjs'

const load = compile('weapon-profiles')
const { GUNS, modeStats } = load('weapon-profiles')
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`)

function serverGun(id, mode = 0) {
  const game = humanServer({ inventory: true })
  const player = game.addPlayer('shooter', 2, { x: 95, y: 10.026, z: 52 })
  const gun = GUNS[id]
  Object.assign(player.weapon(), {
    name: gun.name,
    mode,
    zoom: 90,
    resumeZoom: 90,
    alternateAt: 0,
    fireRate: modeStats(gun, mode).fireRate,
    damage: gun.damage,
    ammoClip: gun.clip,
    maxAmmoClip: gun.clip,
    ammoReserve: gun.reserve,
    reloadTime: gun.reloadTime
  })
  game.component('PlayerInventory').create(player.id, {
    active: id,
    items: [{ id, clip: gun.clip, reserve: gun.reserve, mode }]
  })
  let shotId = 0
  return {
    game,
    player,
    weapon: player.weapon(),
    shoot(at, burstIndex = 0) {
      game.at(at)
      game.shoot('shooter', { shotId: ++shotId, burstIndex })
    },
    alternate(at, extra = {}) {
      game.at(at)
      game.message('weaponAlternate', 'shooter', { revision: 1, round: 1, ...extra })
    },
    reload(at) {
      game.at(at)
      game.message('playerReload', 'shooter', { revision: 1, round: 1 })
    }
  }
}

test('a rifle shot replaces the preceding zoom-action deadline with its firing cycle', () => {
  for (const id of ['aug', 'sg552', 'g3sg1', 'sg550']) {
    const f = serverGun(id)
    f.alternate(10)
    assert.equal(f.weapon.zoom, GUNS[id].zoomLevels[0])
    const interval = f.weapon.fireRate
    f.shoot(10.01)
    assert.equal(f.weapon.ammoClip, GUNS[id].clip - 1)
    const before = f.weapon.zoom
    f.alternate(10.01 + interval - 0.001)
    assert.equal(f.weapon.zoom, before, `${id}: cannot zoom before the shot is ready`)
    f.alternate(10.01 + interval + 0.0001)
    assert.notEqual(f.weapon.zoom, before, `${id}: the shot replaced the old 0.3-second zoom deadline`)
  }
})

test('Glock and FAMAS continuations do not postpone mode changes beyond the original burst deadline', () => {
  for (const [id, cycle, second, third] of [
    ['glock18', 0.5, 0.016, 0.032],
    ['famas', 0.55, 0.05, 0.15]
  ]) {
    const f = serverGun(id, 1)
    f.shoot(10)
    f.shoot(10 + second, 1)
    f.shoot(10 + third, 2)
    assert.equal(f.weapon.ammoClip, GUNS[id].clip - 3)
    f.alternate(10 + cycle - 0.001)
    assert.equal(f.weapon.mode, 1)
    f.alternate(10 + cycle + 0.0001)
    assert.equal(f.weapon.mode, 0, `${id}: switching is ready after the first bullet's cycle`)
  }
})

test('switching to a slower fire mode does not delay a primary attack that is already ready', () => {
  for (const id of ['aug', 'sg552', 'famas']) {
    const f = serverGun(id)
    f.shoot(10)
    const ready = 10 + GUNS[id].fireRate
    f.alternate(ready + 0.001)
    const nextInterval = f.weapon.fireRate
    assert.ok(nextInterval > GUNS[id].fireRate)
    f.shoot(ready + 0.002)
    assert.equal(f.weapon.ammoClip, GUNS[id].clip - 2, `${id}: mode change preserves the preceding shot's deadline`)
    near(f.weapon.lastShotTime, ready)
    near(f.weapon.nextPrimaryAt, ready + nextInterval)
  }
})

test('manual reload becomes ready at the first bullet burst deadline, including an empty final burst', () => {
  for (const [id, cycle, second, third] of [
    ['glock18', 0.5, 0.016, 0.032],
    ['famas', 0.55, 0.05, 0.15]
  ])
    for (const clip of [3, 6]) {
      const f = serverGun(id, 1)
      f.weapon.ammoClip = clip
      f.shoot(10)
      f.shoot(10 + second, 1)
      f.shoot(10 + third, 2)
      f.reload(10 + cycle - 0.001)
      assert.equal(f.weapon.isReloading, false)
      f.reload(10 + cycle + 0.0001)
      assert.equal(f.weapon.isReloading, true, `${id}/${clip}: continuations do not restart reload cooldown`)
      assert.equal(f.weapon.ammoClip, clip - 3)
    }
})

test('mode actions still obey draw, reload, revision, phase, life and bomb guards', () => {
  for (const block of ['draw', 'reload', 'revision', 'round', 'dead', 'bomb', 'lobby']) {
    const f = serverGun('aug')
    if (block === 'draw') f.weapon.readyAt = 11
    if (block === 'reload') f.weapon.isReloading = true
    if (block === 'dead') f.player.health().current = 0
    if (block === 'bomb') f.game.component('PlayerEquipment').getMutable(f.player.id).bombSelected = true
    if (block === 'lobby') f.game.match.phase = 'lobby'
    f.alternate(10, block === 'revision' ? { revision: 2 } : block === 'round' ? { round: 2 } : {})
    assert.equal(f.weapon.zoom, 90, block)
  }
})

test('desktop and touch prediction retain the firing interval captured before a mode change', () => {
  for (const mobile of [true, false])
    for (const id of ['aug', 'sg552', 'famas']) {
      const f = combatClient({ readyToShoot: true })
      const gun = GUNS[id]
      f.state.mobile = mobile
      Object.assign(f.weapon, { name: gun.name, fireRate: gun.fireRate, ammoClip: gun.clip, mode: 0 })
      f.step(9)
      f.hold(mobile ? A.IA_ACTION_6 : A.IA_POINTER, true)
      f.step(10)
      const stats = modeStats(gun, id === 'famas' ? 1 : 0, id === 'famas' ? 90 : gun.zoomLevels[0])
      Object.assign(f.weapon, { ...stats, mode: id === 'famas' ? 1 : 0, zoom: id === 'famas' ? 90 : gun.zoomLevels[0] })
      f.step(10 + gun.fireRate + 0.001)
      assert.equal(f.sent.filter((event) => event.type === 'playerShoot').length, 2, `${mobile}/${id}`)
    }
})

test('held client reload is ready when the burst ends without waiting again after the third bullet', () => {
  for (const [id, cycle, second, third] of [
    ['glock18', 0.5, 0.016, 0.032],
    ['famas', 0.55, 0.05, 0.15]
  ]) {
    const f = combatClient({ readyToShoot: true })
    const gun = GUNS[id]
    Object.assign(f.weapon, { name: gun.name, mode: 1, fireRate: cycle, lastShotTime: 0 })
    f.step(9)
    f.hold(A.IA_ACTION_6, true)
    f.step(10)
    f.hold(A.IA_ACTION_6, false)
    f.step(10 + second)
    f.step(10 + third)
    assert.equal(f.sent.filter((event) => event.type === 'playerShoot').length, 3)
    f.hold(A.IA_SECONDARY, true)
    f.step(10 + cycle + 0.0001)
    assert.equal(f.sent.filter((event) => event.type === 'playerReload').length, 1, id)
  }
})
