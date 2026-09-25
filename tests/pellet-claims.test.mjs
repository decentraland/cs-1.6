import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'
import { combatClient, InputAction } from './helpers/combat-client.mjs'
import { humanServer } from './helpers/human-server.mjs'
import { sdkRooms, AUTH_SERVER } from './helpers/sdk-room.mjs'

const load = compile('ballistics', 'shared-random')
const ballistics = load('ballistics')
const { aimShot, fireGunShot, PLAYER_HIT_REGIONS } = ballistics
const { freshGunAccuracy } = load('gun-accuracy')
const { shotRandom } = load('shared-random')
const { GUNS } = load('weapon-profiles')
const feet = { x: 95, y: 10.026, z: 52 }
const west = { x: -1, y: 0, z: 0 }
const targetAt = (center) => ({ id: 'target', center, yaw: 0, regions: PLAYER_HIT_REGIONS })

function aiming(gun, options = {}) {
  return {
    gun,
    feet: options.feet ?? feet,
    aim: options.aim ?? west,
    accuracy: freshGunAccuracy(gun),
    triggerHeld: true,
    speed: 0,
    now: 11,
    grounded: true,
    random: options.straight ? () => 0.5 : shotRandom(1234, 1)
  }
}

function client(gun, target, options = {}) {
  const f = combatClient({
    readyToShoot: true,
    aim: options.aim ?? west,
    room: options.room,
    plan: () => aimShot(aiming(gun, options)),
    modules: {
      './ballistics': ballistics,
      './hit-regions': load('hit-regions'),
      './delaySystem': { delay() {} }
    }
  })
  Object.assign(f.weapon, {
    name: GUNS[gun].name,
    fireRate: GUNS[gun].fireRate,
    damage: GUNS[gun].damage,
    ammoClip: GUNS[gun].clip,
    maxAmmoClip: GUNS[gun].clip,
    lastShotTime: 0
  })
  f.component('Transform').getMutable(1).position = options.feet ?? feet
  f.component('Transform').create(700, { position: target.center, rotation: { x: 0, y: 0, z: 0, w: 1 } })
  f.component('PlayerIdentityData').create(700, { address: target.id })
  f.state.mobile = options.mobile ?? true
  f.step(10.5)
  f.hold(f.state.mobile ? InputAction.IA_ACTION_6 : InputAction.IA_POINTER, true)
  f.step(11)
  const request = f.sent.find((event) => event.type === 'playerShoot')?.data
  assert.ok(request, 'production firing sends the shot')
  return { ...f, request }
}

test('desktop and touch shotguns report a target struck by later pellets when the first pellet misses', () => {
  const target = targetAt({ x: 88, y: feet.y, z: 52.2 })
  for (const gun of ['m3', 'xm1014']) {
    const result = fireGunShot({ ...aiming(gun), damage: GUNS[gun].damage, targets: [target] })
    assert.equal(result.hit, undefined, 'fixed source seed: first pellet misses')
    assert.deepEqual(
      result.impacts.filter((hit) => hit.hit).map((hit) => hit.hit.group),
      ['arms', 'head', 'arms']
    )
    for (const mobile of [true, false]) {
      const f = client(gun, target, { mobile })
      assert.equal(f.request.target, target.id, `${gun}/${mobile}`)
      assert.deepEqual(f.request.targetPosition, target.center)
      assert.equal(f.request.shotId, 1)
    }
  }
})

test('a later-pellet observation reaches the authoritative human rewind through SDK Room', async () => {
  for (const gun of ['m3', 'xm1014']) {
    const wire = sdkRooms(),
      authority = wire.add(AUTH_SERVER),
      local = wire.add('me')
    const server = humanServer({ room: authority })
    const shooter = server.addPlayer('me', 1, feet)
    const target = server.addPlayer('target', 2, { x: 88, y: feet.y, z: 52.5 })
    Object.assign(shooter.weapon(), {
      name: GUNS[gun].name,
      damage: GUNS[gun].damage,
      fireRate: GUNS[gun].fireRate,
      ammoClip: GUNS[gun].clip,
      maxAmmoClip: GUNS[gun].clip,
      zoom: 90
    })
    server.tick(10)
    server.echo('me', 10.4)
    for (let tick = 1; tick <= 60; tick++) server.tick(10 + tick / 60)
    const baseline = fireGunShot({
      ...aiming(gun),
      damage: GUNS[gun].damage,
      targets: [targetAt({ x: 88, y: feet.y, z: 52.5 })]
    })
    assert.equal(baseline.impacts.filter((hit) => hit.hit).length, 0, 'unadjusted position misses all pellets')
    const f = client(gun, targetAt({ x: 88, y: feet.y, z: 52.2 }), {
      room: {
        onMessage: (...args) => local.onMessage(...args),
        send: (type, ...args) => (type === 'playerJoin' ? undefined : local.send(type, ...args))
      }
    })
    await wire.deliverFrom('me')
    assert.equal(target.health().current, 0, gun)
    assert.equal(shooter.weapon().ammoClip, GUNS[gun].clip - 1)
    assert.equal(server.server.matchStats.get('me').kills, 1)
    assert.ok(server.logs.some((line) => line.includes('humanClaim=accepted')))
    local.send('playerShoot', f.request)
    await wire.deliverFrom('me')
    assert.equal(shooter.weapon().ammoClip, GUNS[gun].clip - 1, 'duplicate does not spend another shell')
    assert.equal(server.server.matchStats.get('me').kills, 1)
  }
})

test('client target observations follow weapon penetration through the actual Dust2 middle door', () => {
  const eye = { x: 72.68839292839402, y: 9.23072381, z: 69.39560781928131 }
  const aim = { x: -0.42232149839401245, y: 0, z: -0.906446099281311 }
  const target = targetAt({ x: 71.75929160207214, y: eye.y - 1.6, z: 67.40143921483141 })
  for (const gun of ['ak47', 'm4a1', 'awp', 'deagle', 'usp', 'm3', 'xm1014']) {
    const options = { aim, feet: { ...eye, y: eye.y - 1.6 }, straight: true }
    const server = fireGunShot({ ...aiming(gun, options), damage: GUNS[gun].damage, targets: [target] })
    assert.equal(server.hit, undefined, 'door remains the first impact')
    const f = client(gun, target, options)
    const penetrates = ['ak47', 'm4a1', 'awp', 'deagle'].includes(gun)
    assert.equal(
      server.impacts.some((hit) => hit.hit && hit.damage > 0),
      penetrates,
      gun
    )
    assert.equal(f.request.target, penetrates ? target.id : undefined, gun)
  }
})

test('shotguns do not claim targets beyond their original pellet range', () => {
  const world = load('penetration'),
    traceWorld = world.bulletWorldTrace
  world.bulletWorldTrace = (origin, direction, range) => ({
    distance: range,
    solid: false,
    startSolid: false,
    allSolid: false,
    material: '',
    texture: '',
    position: {
      x: origin.x + direction.x * range,
      y: origin.y + direction.y * range,
      z: origin.z + direction.z * range
    }
  })
  try {
    const target = targetAt({ x: 15, y: feet.y, z: feet.z })
    for (const gun of ['m3', 'xm1014']) {
      assert.equal(GUNS[gun].range, gun === 'm3' ? 75 : 76.2)
      const f = client(gun, target, { straight: true })
      assert.equal(f.request.target, undefined, gun)
      assert.equal(f.request.targetPosition, undefined)
    }
  } finally {
    world.bulletWorldTrace = traceWorld
  }
})

test('ordinary clear-sight targets remain reported for all 24 firearms', () => {
  const target = targetAt({ x: 88, y: feet.y, z: feet.z })
  for (const gun of Object.keys(GUNS)) {
    const f = client(gun, target, { straight: true })
    assert.equal(f.request.target, target.id, gun)
    assert.deepEqual(f.request.targetPosition, target.center)
    assert.equal(f.sent.filter((event) => event.type === 'playerShoot').length, 1)
  }
})
