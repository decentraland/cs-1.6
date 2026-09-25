import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'
import { combatClient, InputAction } from './helpers/combat-client.mjs'
import { humanServer } from './helpers/human-server.mjs'
import { sdkRooms, AUTH_SERVER } from './helpers/sdk-room.mjs'

const load = compile('ballistics', 'knife-rules')
const ballistics = load('ballistics')
const { traceKnife } = load('knife-rules')
const feet = { x: 95, y: 10.026, z: 52 }
const targetPosition = { x: 94.4, y: feet.y, z: feet.z }
const origin = { ...feet, y: feet.y + 1.6 }
const west = { x: -1, y: 0, z: 0 }
const bodyAim = { x: -Math.SQRT1_2, y: -Math.SQRT1_2, z: 0 }
const request = (patch = {}) => ({
  round: 1,
  revision: 1,
  shotId: 1,
  attack: 'stab',
  direction: west,
  view: { origin, speed: 0, seenAt: 10.7, target: 'target', targetPosition },
  ...patch
})
const result = (f) => f.sent.filter((event) => event.type === 'knifeResult').at(-1)?.data

function client(options = {}) {
  const f = combatClient({
    readyToShoot: true,
    aim: options.aim ?? west,
    room: options.room,
    modules: { './ballistics': ballistics, './hit-regions': load('hit-regions') }
  })
  Object.assign(f.weapon, { name: 'Knife', readyAt: 0, lastShotTime: 0 })
  f.component('Transform').getMutable(1).position = feet
  f.component('ServerClock').create(701, { now: 10.7 })
  if (options.target !== false) {
    f.component('PlayerIdentityData').create(700, { address: 'target' })
    f.component('Transform').create(700, {
      position: options.target ?? targetPosition,
      rotation: { x: 0, y: 0, z: 0, w: 1 }
    })
  }
  f.state.mobile = options.mobile ?? true
  f.step(10.5)
  f.hold(
    options.attack === 'swing'
      ? f.state.mobile
        ? InputAction.IA_ACTION_6
        : InputAction.IA_POINTER
      : InputAction.IA_SECONDARY,
    true
  )
  f.step(11)
  return { ...f, request: f.sent.find((event) => event.type === 'knifeAttack')?.data }
}
function crossing(options = {}) {
  const f = humanServer({ room: options.room })
  const shooter = f.addPlayer('me', 1, feet)
  const target = f.addPlayer('target', options.team ?? 2, targetPosition)
  shooter.weapon().name = 'Knife'
  f.tick(10)
  if (!options.noPing) f.echo('me', 10.4)
  for (let tick = 1; tick <= 60; tick++) {
    const at = 10 + tick / 60
    target.move({ ...targetPosition, z: 52 + 6 * (at - 10.7) })
    f.tick(at)
  }
  return { ...f, shooter, target }
}
function stationary(position = targetPosition, options = {}) {
  const f = humanServer()
  const shooter = f.addPlayer('me', 1, options.feet ?? feet)
  const target = f.addPlayer('target', 2, position)
  shooter.weapon().name = 'Knife'
  f.tick(10)
  f.echo('me', 10.4)
  for (let tick = 1; tick <= 60; tick++) f.tick(10 + tick / 60)
  return { ...f, shooter, target }
}

test('desktop and touch knife requests carry the traced target, origin, zero speed and drawn bot time through SDK Room', async () => {
  for (const mobile of [true, false])
    for (const attack of ['swing', 'stab']) {
      const wire = sdkRooms(),
        authority = wire.add(AUTH_SERVER),
        local = wire.add('me')
      let received
      authority.onMessage('knifeAttack', (data) => {
        received = data
      })
      const f = client({ mobile, attack, room: local })
      assert.ok(f.request?.view)
      assert.deepEqual(f.request.view.origin, origin)
      assert.equal(f.request.view.target, 'target')
      assert.deepEqual(f.request.view.targetPosition, targetPosition)
      await wire.deliverFrom('me')
      assert.equal(received.view.speed, 0)
      assert.equal(received.view.seenAt, 10.7)
      assert.equal(received.attack, attack)
    }
  const miss = client({ target: false })
  assert.equal(miss.request.view.target, undefined)
  assert.equal(miss.request.view.targetPosition, undefined)
})

test('real desktop/touch knife attacks hit the crossing human where drawn and damage only once through SDK Room', async () => {
  for (const mobile of [true, false])
    for (const attack of ['swing', 'stab']) {
      const wire = sdkRooms(),
        authority = wire.add(AUTH_SERVER),
        local = wire.add('me')
      const f = crossing({ room: authority })
      const before = { ...f.component('Transform').get(f.target.avatar).position }
      const c = client({
        mobile,
        attack,
        room: {
          onMessage: (...args) => local.onMessage(...args),
          send: (type, ...args) => (type === 'playerJoin' ? undefined : local.send(type, ...args))
        }
      })
      await wire.deliverFrom('me')
      assert.ok(f.target.health().current < 100, `${attack}/${mobile}`)
      assert.ok(f.logs.some((line) => line.includes('[KNIFE]') && line.includes('humanDelay=300ms')))
      assert.equal(result(f).target, true)
      assert.deepEqual(
        f.component('Transform').get(f.target.avatar).position,
        before,
        'rewind must not move the live avatar'
      )
      const health = f.target.health().current
      local.send('knifeAttack', c.request)
      await wire.deliverFrom('me')
      assert.equal(f.target.health().current, health)
      assert.equal(f.sent.filter((event) => event.type === 'knifeResult').length, 1)
      if (attack === 'stab') assert.equal(f.server.matchStats.get('me').kills, 1)
    }
})

test('client bot time and target claims cannot substitute a measured human latency', () => {
  const f = crossing({ noPing: true })
  f.message('knifeAttack', 'me', request())
  assert.equal(f.target.health().current, 100)
  assert.equal(result(f).target, false)
})

test('backstab damage uses the victim facing at the historical contact rather than its new direction', () => {
  for (const rear of [true, false]) {
    const f = humanServer(),
      shooter = f.addPlayer('me', 1, feet),
      target = f.addPlayer('target', 2, targetPosition)
    shooter.weapon().name = 'Knife'
    f.message('playerFacing', 'target', { direction: { x: rear ? -1 : 1, y: 0, z: 0 } })
    f.tick(10)
    f.echo('me', 10.4)
    for (let tick = 1; tick <= 60; tick++) {
      if (tick === 49) f.message('playerFacing', 'target', { direction: { x: rear ? 1 : -1, y: 0, z: 0 } })
      f.tick(10 + tick / 60)
    }
    f.message('knifeAttack', 'me', request({ direction: bodyAim }))
    assert.equal(target.health().current, rear ? 0 : 35)
    assert.ok(f.logs.some((line) => line.includes(`backstab=${rear}`)))
  }
})

test('a running knife origin may lead sampled movement, while remote and nonfinite origins fall back', () => {
  for (const valid of [true, false]) {
    const sampled = { ...feet, x: 96.7 }
    const f = stationary(targetPosition, { feet: sampled })
    f.message(
      'knifeAttack',
      'me',
      request({ view: { origin: valid ? origin : { ...origin, x: 75 }, speed: 6, seenAt: 10.7 } })
    )
    assert.equal(result(f).target, valid)
    assert.equal(f.target.health().current < 100, valid)
    assert.ok(f.logs.some((line) => line.includes(`origin=${valid ? 'accepted' : 'rejected'}`)))
  }
  const f = stationary(targetPosition, { feet: { ...feet, x: 96.7 } })
  f.message('knifeAttack', 'me', request({ view: { origin: { ...origin, x: NaN }, speed: Infinity } }))
  assert.equal(f.target.health().current, 100)
})

test('small target smoothing is accepted inside the unchanged bound; an invented nearby victim is rejected', () => {
  for (const offset of [0.3, 0.7]) {
    const actual = { ...targetPosition, x: 93.2 },
      seen = { ...actual, x: actual.x + offset }
    const f = stationary(actual)
    const baseline = traceKnife(
      origin,
      west,
      [{ id: 'target', center: actual, yaw: 0, regions: ballistics.PLAYER_HIT_REGIONS }],
      'stab'
    )
    assert.equal(baseline.hit, undefined)
    f.message('knifeAttack', 'me', request({ view: { origin, speed: 0, target: 'target', targetPosition: seen } }))
    assert.equal(f.target.health().current < 100, offset === 0.3)
    assert.ok(f.logs.some((line) => line.includes(`humanClaim=${offset === 0.3 ? 'accepted' : 'rejected'}`)))
  }
})

test('rewound knife targets remain blocked by actual Dust2 walls', () => {
  const position = { ...feet, x: 99.1 },
    shooterFeet = { ...feet, x: 98.3 },
    eye = { ...shooterFeet, y: feet.y + 1.6 }
  const f = stationary(position, { feet: shooterFeet })
  f.message(
    'knifeAttack',
    'me',
    request({
      direction: { x: 1, y: 0, z: 0 },
      view: { origin: eye, speed: 0, target: 'target', targetPosition: position }
    })
  )
  assert.equal(f.target.health().current, 100)
  assert.equal(result(f).contact, true)
  assert.equal(result(f).target, false)
})

test('rewind does not revive dead, disconnected or respawned humans, and teammates still block without damage', () => {
  for (const reason of ['dead', 'disconnected', 'spectator', 'future-round', 'respawn', 'team']) {
    const f = crossing({ team: reason === 'team' ? 1 : 2 })
    const seat = f.match.roster.find((seat) => seat.address === 'target')
    if (reason === 'dead') f.component('Dead').create(f.target.id, { deathTime: 11 })
    if (reason === 'disconnected') seat.connected = false
    if (reason === 'spectator') seat.team = 0
    if (reason === 'future-round') seat.eligibleRound = 2
    if (reason === 'respawn') {
      f.server.resetPlayerAccuracy('target', true)
      f.target.move(targetPosition)
      f.tick(11.01)
    }
    f.message('knifeAttack', 'me', request())
    assert.equal(f.target.health().current, 100, reason)
    assert.equal(result(f).target, reason === 'team', reason)
    assert.equal(f.sent.filter((event) => event.type === 'damageConfirmed').length, 0)
  }
})

test('knife bot traces select the bounded historical pose and facing through the practice adapter', () => {
  for (const seenAt of [10.7, -100, 100, undefined]) {
    const at = [],
      damage = []
    const current = {
      id: 900,
      center: { ...targetPosition, z: 54 },
      yaw: Math.PI / 2,
      regions: ballistics.PLAYER_HIT_REGIONS
    }
    const old = { ...current, center: targetPosition, yaw: -Math.PI / 2 }
    const f = humanServer({
      practice: {
        practiceTargets: () => [current],
        practiceTargetsAt: (time) => {
          at.push(time)
          return [old]
        },
        damageBot: (...args) => damage.push(args)
      }
    })
    f.addPlayer('me', 1, feet).weapon().name = 'Knife'
    f.component('Bot').create(900, { alive: true, index: 0, team: 2 })
    f.component('Transform').create(900, {
      position: current.center,
      rotation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }
    })
    f.tick(11)
    f.message(
      'knifeAttack',
      'me',
      request({ direction: bodyAim, view: { origin, speed: 0, seenAt, target: 'bot:0', targetPosition } })
    )
    assert.deepEqual(at, seenAt === undefined ? [] : [Math.min(11, Math.max(10, seenAt))])
    assert.equal(result(f).target, seenAt !== undefined)
    assert.equal(damage.length, seenAt === undefined ? 0 : 1)
    if (damage.length) assert.equal(damage[0][1], 195, 'historical backstab body damage')
  }
})
