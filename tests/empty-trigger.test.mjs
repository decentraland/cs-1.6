import assert from 'node:assert/strict'
import { test } from 'node:test'
import { combatClient, InputAction as A } from './helpers/combat-client.mjs'
import { humanServer } from './helpers/human-server.mjs'
import { sdkRooms, AUTH_SERVER } from './helpers/sdk-room.mjs'
import { compile } from './compile.mjs'

const load = compile('weapon-profiles', 'weapon-modes')
const { GUNS } = load('weapon-profiles')
const { resumeScope } = load('weapon-modes')
const shots = (f) => f.sent.filter((event) => event.type === 'playerShoot')
const clicks = (f) => f.sounds.filter((sound) => sound.name.startsWith('dryfire'))

function client(id = 'ak47', mobile = true, options = {}) {
  const f = combatClient({ readyToShoot: true, ...options })
  f.state.mobile = mobile
  const gun = GUNS[id]
  Object.assign(f.weapon, {
    name: gun.name,
    fireRate: gun.fireRate,
    ammoClip: 0,
    maxAmmoClip: gun.clip,
    ammoReserve: 0,
    lastShotTime: 0
  })
  f.step(9)
  f.fire = (held) => f.hold(mobile ? A.IA_ACTION_6 : A.IA_POINTER, held)
  return f
}

function server(id = 'ak47', options = {}) {
  const f = humanServer(options)
  const player = f.addPlayer('me', 2, { x: 95, y: 10.026, z: 52 })
  Object.assign(player.weapon(), {
    name: GUNS[id].name,
    fireRate: GUNS[id].fireRate,
    ammoClip: 0,
    ammoReserve: 0,
    maxAmmoClip: GUNS[id].clip,
    alternateAt: 0,
    zoom: 90,
    resumeZoom: 90
  })
  return { ...f, player, weapon: player.weapon() }
}

test('all 24 empty firearms send an intent with the original pistol/rifle click and no predicted shot effects', () => {
  for (const mobile of [true, false])
    for (const gun of Object.values(GUNS)) {
      const f = client(gun.id, mobile)
      f.fire(true)
      f.step(10)
      assert.equal(shots(f).length, 1, `${mobile}/${gun.id}`)
      assert.equal(clicks(f).length, 1)
      assert.equal(clicks(f)[0].name, gun.slot === 'secondary' ? 'dryfire_pistol' : 'dryfire')
      assert.equal(clicks(f)[0].volume, 0.8)
      assert.equal(f.sounds.length, 1, 'empty trigger does not play a gunshot')
      assert.deepEqual(f.effects, [], 'empty trigger does not predict recoil or a firing animation')
      assert.equal(f.weapon.ammoClip, 0)
    }
})

test('empty clicks obey life, match, menu, synchronization, pose and draw gates', () => {
  for (const block of [
    'draw',
    'freeze',
    'over',
    'team',
    'dead',
    'health',
    'buy',
    'menu',
    'busy',
    'bomb',
    'sync',
    'pose'
  ]) {
    const f = client()
    if (block === 'draw') f.weapon.readyAt = 11
    if (block === 'freeze') f.match.phase = 'freeze'
    if (block === 'over') f.match.matchOver = true
    if (block === 'team') f.match.roster[0].team = 0
    if (block === 'dead') f.component('Dead').create(512, {})
    if (block === 'health') f.component('PlayerHealth').getMutable(512).current = 0
    if (block === 'buy') f.state.buy = true
    if (block === 'menu') f.state.menu = true
    if (block === 'busy') f.state.busy = true
    if (block === 'bomb') f.state.selectedBomb = true
    if (block === 'sync') f.state.synced = false
    if (block === 'pose') f.component('PlayerPose').getMutable(512).valid = false
    f.fire(true)
    f.step(10)
    assert.equal(clicks(f).length, 0, block)
    assert.equal(shots(f).length, 0, block)
  }
})

test('automatic empty triggers repeat at 0.2 seconds; semi-auto pistols require another press', () => {
  for (const gun of Object.values(GUNS).filter((gun) => !gun.shellReload)) {
    const f = client(gun.id)
    f.fire(true)
    for (const at of [10, 10.1, 10.201, 10.401]) f.step(at)
    assert.equal(clicks(f).length, gun.automatic ? 3 : 1, gun.id)
    f.fire(false)
    f.step(10.5)
    f.fire(true)
    f.step(10.7)
    assert.equal(clicks(f).length, gun.automatic ? 4 : 2, gun.id)
  }
})

test('empty feedback waits for the last live shot cycle and resets for a newly equipped weapon', () => {
  const f = client()
  f.weapon.ammoClip = 1
  f.fire(true)
  f.step(10)
  f.weapon.ammoClip = 0
  f.step(10.01)
  assert.equal(clicks(f).length, 0)
  f.step(10.1)
  assert.equal(clicks(f).length, 1)
  Object.assign(f.weapon, { name: 'M3', revision: 2, fireRate: 0.875 })
  f.step(10.2)
  assert.equal(clicks(f).length, 2)
})

test('server empty attempts advance only the primary deadline and never consume ammunition or damage a target', () => {
  const f = server()
  f.weapon.ammoReserve = 90
  f.shoot('me')
  assert.ok(Math.abs(f.weapon.nextPrimaryAt - 10.2) < 1e-6)
  assert.equal(f.weapon.alternateAt, 0)
  assert.equal(f.weapon.lastShotTime, 0)
  assert.equal(f.weapon.ammoClip, 0)
  assert.equal(f.weapon.ammoReserve, 90)
  assert.equal(f.sent.filter((event) => event.type === 'weaponDryFire').length, 1)
  assert.equal(
    f.sent.filter((event) => ['practiceShot', 'damageConfirmed', 'combatImpact'].includes(event.type)).length,
    0
  )
  f.at(10.01)
  f.shoot('me', { shotId: 2 })
  assert.equal(f.sent.filter((event) => event.type === 'weaponDryFire').length, 1)
  f.at(10.201)
  f.shoot('me', { shotId: 3 })
  assert.equal(f.sent.filter((event) => event.type === 'weaponDryFire').length, 2)
})

test('empty shotguns click once per hold, retry at one second and can start their shell reload', () => {
  for (const id of ['m3', 'xm1014']) {
    const f = client(id)
    f.fire(true)
    for (const at of [10, 10.201, 11.001, 12.001]) f.step(at)
    assert.equal(shots(f).length, 3, id)
    assert.equal(clicks(f).length, 1)
    const s = server(id)
    s.shoot('me')
    assert.equal(s.weapon.nextPrimaryAt, 11)
    s.at(11.001)
    s.shoot('me', { shotId: 2 })
    assert.equal(s.sent.filter((event) => event.type === 'weaponDryFire').length, 1)
    const loaded = server(id)
    loaded.weapon.ammoReserve = 4
    loaded.shoot('me')
    assert.equal(loaded.weapon.isReloading, true)
    assert.equal(loaded.weapon.nextPrimaryAt, 11)
    assert.equal(loaded.weapon.ammoReserve, 4)
  }
})

test('empty AWP and Scout unscope for the dry cycle without changing the alternate deadline', () => {
  for (const id of ['awp', 'scout']) {
    const f = server(id)
    f.weapon.zoom = 40
    f.weapon.alternateAt = 10.3
    f.shoot('me')
    assert.equal(f.weapon.zoom, 90, id)
    assert.equal(f.weapon.resumeZoom, 40)
    assert.equal(f.weapon.alternateAt, 10.3)
    resumeScope(f.weapon, 10.199)
    assert.equal(f.weapon.zoom, 90)
    resumeScope(f.weapon, 10.201)
    assert.equal(f.weapon.zoom, 40)
  }
})

test('empty touch intents cross SDK Room without echoing the local click or producing a live shot', async () => {
  const wire = sdkRooms()
  const authority = wire.add(AUTH_SERVER),
    local = wire.add('me'),
    other = wire.add('observer')
  const s = server('usp', { room: authority })
  const f = client('usp', true, {
    room: {
      onMessage: (...args) => local.onMessage(...args),
      send: (type, ...args) => (type === 'playerJoin' ? undefined : local.send(type, ...args))
    }
  })
  const remote = []
  other.onMessage('weaponDryFire', (data) => remote.push(data))
  f.fire(true)
  f.step(10)
  await wire.deliverFrom('me')
  assert.equal(s.weapon.ammoClip, 0)
  assert.equal(s.sent.filter((event) => event.type === 'weaponDryFire').length, 1)
  await wire.deliverFrom(AUTH_SERVER)
  assert.equal(clicks(f).length, 1, 'confirmation does not replay the local click')
  assert.equal(remote.length, 1)
  assert.equal(remote[0].gun, 'usp')
})
