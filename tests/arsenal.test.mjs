import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'
const load = compile(
  'weapon-modes',
  'gun-accuracy',
  'inventory-rules',
  'combat-rules',
  'ballistics',
  'recoil-prediction',
  'shared-random'
)
const { GUNS, modeStats, buyMenuGuns } = load('weapon-profiles')
const { alternateWeapon, leaveScope, firedScope, resumeScope, beginBurst, advanceBurst } = load('weapon-modes')
const { freshGunAccuracy, gunSpread } = load('gun-accuracy')
const { startingInventory, buyGun, buyGunAmmo, syncAmmoPool } = load('inventory-rules')
const { startReload, finishReload, fireShot } = load('combat-rules')
const { fireGunShot, PLAYER_HIT_REGIONS } = load('ballistics')
const { RecoilPrediction } = load('recoil-prediction')
const { shotRandom } = load('shared-random')
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`)
const weapon = (id) => ({
  name: GUNS[id].name,
  mode: 0,
  zoom: 90,
  resumeZoom: 90,
  alternateAt: 0,
  readyAt: 0,
  lastShotTime: 0,
  fireRate: GUNS[id].fireRate,
  damage: GUNS[id].damage,
  isReloading: false,
  ammoClip: GUNS[id].clip,
  maxAmmoClip: GUNS[id].clip,
  ammoReserve: GUNS[id].reserve,
  reloadTime: GUNS[id].reloadTime,
  reloadStartTime: 0,
  lastShotId: 0
})
const prices = {
  glock18: 400,
  usp: 500,
  p228: 600,
  deagle: 650,
  elite: 800,
  fiveseven: 750,
  m3: 1700,
  xm1014: 3000,
  mac10: 1400,
  tmp: 1250,
  mp5: 1500,
  ump45: 1700,
  p90: 2350,
  galil: 2000,
  famas: 2250,
  ak47: 2500,
  m4a1: 3100,
  aug: 3500,
  sg552: 3500,
  scout: 2750,
  awp: 4750,
  g3sg1: 5000,
  sg550: 4200,
  m249: 5750
}
const damage = {
  glock18: 25,
  usp: 34,
  p228: 32,
  deagle: 54,
  elite: 36,
  fiveseven: 20,
  m3: 20,
  xm1014: 20,
  mac10: 29,
  tmp: 20,
  mp5: 26,
  ump45: 30,
  p90: 21,
  galil: 30,
  famas: 30,
  ak47: 36,
  m4a1: 32,
  aug: 32,
  sg552: 33,
  scout: 75,
  awp: 115,
  g3sg1: 80,
  sg550: 70,
  m249: 32
}

test('the complete firearm roster charges the original prices and carries distinct damage values', () => {
  assert.equal(Object.keys(GUNS).length, 24)
  for (const [id, price] of Object.entries(prices)) {
    const gun = GUNS[id],
      team = gun.team || 2,
      inventory = startingInventory(team)
    inventory.items = []
    assert.equal(buyGun(inventory, id, team, 16000).money, 16000 - price, id)
    assert.equal(gun.damage, damage[id], id)
    assert.equal(inventory.items[0].clip, gun.clip)
    assert.equal(inventory.items[0].reserve, 0)
    assert.ok(gun.fireRate > 0 && gun.reloadTime > 0 && gun.ammoPack > 0 && gun.ammoPrice > 0)
    if (gun.team) assert.ok(buyGun(startingInventory(3 - team), id, 3 - team, 16000).error)
  }
})
test('the original team-specific buy order exposes every gun', () => {
  assert.deepEqual(
    buyMenuGuns(1, 'rifles').map((g) => g.id),
    ['galil', 'ak47', 'scout', 'sg552', 'awp', 'g3sg1']
  )
  assert.deepEqual(
    buyMenuGuns(2, 'rifles').map((g) => g.id),
    ['famas', 'scout', 'm4a1', 'aug', 'sg550', 'awp']
  )
  const all = new Set(
    [1, 2].flatMap((t) =>
      ['pistols', 'shotguns', 'smgs', 'rifles', 'machineguns'].flatMap((c) => buyMenuGuns(t, c).map((g) => g.id))
    )
  )
  assert.deepEqual([...all].sort(), Object.keys(GUNS).sort())
})
test('Glock/MP5 share 9mm reserves and changing caliber preserves ammunition already bought', () => {
  const inventory = startingInventory(1)
  buyGun(inventory, 'mp5', 1, 16000)
  assert.equal(inventory.items[1].reserve, 40)
  buyGunAmmo(inventory, 'primary', 100)
  assert.deepEqual(
    inventory.items.map((i) => i.reserve),
    [70, 70]
  )
  syncAmmoPool(inventory, 'mp5', 50)
  assert.deepEqual(
    inventory.items.map((i) => i.reserve),
    [50, 50]
  )
  buyGun(inventory, 'ak47', 1, 16000)
  buyGun(inventory, 'deagle', 1, 16000)
  buyGun(inventory, 'mp5', 1, 16000)
  assert.equal(inventory.items.find((i) => i.id === 'mp5').reserve, 50)
})
test('AWP cycles 40/10 FOV, loses no-scope penalty when zoomed, and re-scopes after the bolt cycle', () => {
  const w = weapon('awp')
  assert.ok(alternateWeapon(w, GUNS.awp, 100))
  assert.equal(w.zoom, 40)
  assert.equal(alternateWeapon(w, GUNS.awp, 100.1), false)
  assert.ok(alternateWeapon(w, GUNS.awp, 100.31))
  assert.equal(w.zoom, 10)
  near(gunSpread(freshGunAccuracy('awp'), 'awp', 101, 0, true, 0, 90), 0.081)
  near(gunSpread(freshGunAccuracy('awp'), 'awp', 101, 0, true, 0, 10), 0.001)
  near(modeStats(GUNS.awp, 0, 10).speed, 3.75)
  w.lastShotTime = 101
  firedScope(w, GUNS.awp)
  assert.equal(w.zoom, 90)
  resumeScope(w, 102.44)
  assert.equal(w.zoom, 90)
  resumeScope(w, 102.45)
  assert.equal(w.zoom, 10)
  leaveScope(w, GUNS.awp)
  assert.equal(w.zoom, 90)
  assert.equal(w.resumeZoom, 90)
})
test('silencers change damage and accuracy only after an uninterrupted attach delay', () => {
  for (const [id, seconds, silencedDamage] of [
    ['usp', 3, 30],
    ['m4a1', 2, 33]
  ]) {
    const w = weapon(id)
    assert.ok(alternateWeapon(w, GUNS[id], 100))
    assert.equal(w.damage, silencedDamage)
    assert.equal(w.readyAt, 100 + seconds)
    assert.equal(alternateWeapon(w, GUNS[id], 100 + seconds - 0.01), false)
    assert.ok(alternateWeapon(w, GUNS[id], 100 + seconds))
    assert.equal(w.damage, GUNS[id].damage)
  }
  near(modeStats(GUNS.m4a1, 1).rangeModifier, 0.95)
  near(gunSpread(freshGunAccuracy('usp'), 'usp', 100, 0, true, 1), 0.012)
})
test('Glock continuations run on successive updates while FAMAS continuations retain their deadlines', () => {
  for (const [id, delay, interval, cycle] of [
    ['glock18', 0, 0, 0.5],
    ['famas', 0.05, 0.1, 0.55]
  ]) {
    const b = beginBurst(GUNS[id], 1, 3, 100)
    near(b.nextAt, 100 + delay)
    near(b.readyAt, 100 + cycle)
    assert.equal(advanceBurst(b, 100 + delay - 0.001), false)
    assert.ok(advanceBurst(b, 100 + delay))
    assert.equal(b.index, 2)
    near(b.nextAt, 100 + delay + interval)
    assert.ok(advanceBurst(b, b.nextAt))
    assert.equal(b.remaining, 0)
    assert.equal(advanceBurst(b, 101), false)
    assert.equal(beginBurst(GUNS[id], 1, 1, 100).remaining, 0)
    assert.equal(beginBurst(GUNS[id], 1, 2, 100).remaining, 1)
    assert.equal(beginBurst(GUNS[id], 1, 0, 100), undefined)
    assert.equal(beginBurst(GUNS[id], 0, 3, 100), undefined)
  }
})
test('Glock burst repeats on a held trigger; semi-auto pistols still require a new press', () => {
  const pistols = ['glock18', 'usp', 'p228', 'deagle', 'elite', 'fiveseven']
  for (const id of pistols) {
    assert.equal(modeStats(GUNS[id], 0).automatic, false, id)
    assert.equal(modeStats(GUNS[id], 1).automatic, id === 'glock18', id)
  }
  assert.equal(modeStats(GUNS.famas, 0).automatic, true)
  assert.equal(modeStats(GUNS.famas, 1).automatic, true)
  near(modeStats(GUNS.glock18, 0).fireRate, 0.15)
  near(modeStats(GUNS.glock18, 1).fireRate, 0.5)
  near(modeStats(GUNS.famas, 1).fireRate, 0.55)
})
test('both shotguns insert individual shells, finish with finite reserves, and can interrupt without free ammo', () => {
  for (const [id, interval] of [
    ['m3', 0.45],
    ['xm1014', 0.3]
  ]) {
    const w = weapon(id)
    w.ammoClip = 0
    w.ammoReserve = 2
    assert.ok(startReload(w, 100, true))
    finishReload(w, 100.54)
    assert.equal(w.ammoClip, 0)
    finishReload(w, 100.55)
    assert.equal(w.ammoClip, 0)
    finishReload(w, 100.55 + interval)
    assert.equal(w.ammoClip, 1)
    assert.equal(w.ammoReserve, 1)
    assert.equal(fireShot(w, 100.55 + interval, true), undefined)
    assert.equal(w.ammoClip, 0)
    assert.equal(w.isReloading, false)
    finishReload(w, 110)
    assert.equal(w.ammoClip, 0)
    assert.equal(w.ammoReserve, 1)
    assert.ok(startReload(w, 111, true))
    finishReload(w, 120)
    assert.equal(w.ammoClip, 1)
    assert.equal(w.ammoReserve, 0)
    assert.equal(w.isReloading, false)
  }
})
test('one shotgun shell produces nine M3 or six XM pellet hits but only one camera kick', () => {
  for (const [id, count, punch] of [
    ['m3', 9, 5],
    ['xm1014', 6, 4]
  ]) {
    const accuracy = freshGunAccuracy(id)
    const shot = fireGunShot({
      gun: id,
      feet: { x: 95, y: 10.026, z: 52 },
      aim: { x: -1, y: 0, z: 0 },
      accuracy,
      triggerHeld: true,
      speed: 0,
      grounded: true,
      now: 100,
      damage: GUNS[id].damage,
      targets: [{ id: 'target', center: { x: 88, y: 10.026, z: 52 }, regions: PLAYER_HIT_REGIONS }],
      random: () => 0.5
    })
    assert.equal(shot.pellets.length, count)
    assert.ok(
      shot.pellets.every((p) => p.hit?.target === 'target' && p.damage === 72),
      'linear buckshot falloff is truncated before the head multiplier'
    )
    assert.equal(accuracy.shots, 1)
    assert.equal(accuracy.pitch, punch)
  }
})
test('every gun predicts the same recoil as authority for standing, moving and airborne firing', () => {
  for (const id of Object.keys(GUNS))
    for (const grounded of [true, false])
      for (const speed of [0, 6]) {
        const prediction = new RecoilPrediction(id, 77),
          accuracy = freshGunAccuracy(id)
        for (let i = 1; i <= 5; i++) {
          const now = 100 + i * GUNS[id].fireRate
          prediction.predict(i, now, speed, grounded, 1, 40)
          fireGunShot({
            gun: id,
            mode: 1,
            zoom: 40,
            feet: { x: 95, y: 10.026, z: 52 },
            aim: { x: -1, y: 0, z: 0 },
            accuracy,
            triggerHeld: true,
            speed,
            grounded,
            now,
            damage: GUNS[id].damage,
            targets: [],
            random: shotRandom(77, i)
          })
          const p = prediction.punch(now)
          near(p.pitch, accuracy.pitch)
          near(p.yaw, accuracy.yaw)
        }
      }
})
