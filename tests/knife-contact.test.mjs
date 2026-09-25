import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'
import { humanServer } from './helpers/human-server.mjs'
import { combatClient, InputAction } from './helpers/combat-client.mjs'
import { sdkRooms, AUTH_SERVER } from './helpers/sdk-room.mjs'

const load = compile('knife-rules', 'ballistics')
const { traceKnife, resolveKnifeAttack, freshKnifeCooldown } = load('knife-rules')
const ballistics = load('ballistics')
const clear = (_origin, _direction, limit) => limit
const forward = { x: 0, y: 0, z: 1 }
const origin = { x: 0, y: 1.6, z: 0 }
const actor = (id, x, z, yaw = 0) => ({
  id,
  center: { x, y: 0, z },
  yaw,
  regions: ballistics.PLAYER_HIT_REGIONS
})

test('ordinary first, held and paused slashes use the audited 15 base damage', () => {
  const state = freshKnifeCooldown()
  for (const at of [10, 10.4, 10.8, 20]) assert.equal(resolveKnifeAttack(state, 'swing', at, true).damage, 15)
  assert.equal(resolveKnifeAttack(freshKnifeCooldown(), 'swing', 21, true, 'head').damage, 60)
  assert.equal(resolveKnifeAttack(freshKnifeCooldown(), 'swing', 21, true, 'stomach').damage, 18.75)
  assert.equal(resolveKnifeAttack(freshKnifeCooldown(), 'swing', 21, true, 'legs').damage, 11.25)
})

test('fallback contacts use the standing box and generic damage instead of expanded head regions', () => {
  const elevated = { ...origin, y: 2.1 }
  for (const attack of ['swing', 'stab']) {
    const hit = traceKnife(elevated, forward, [actor('enemy', 0, 1)], attack, clear)
    assert.equal(hit.hit?.target, 'enemy')
    assert.equal(hit.hit.group, 'body', 'the head hull contact does not award a headshot')
    assert.ok(Math.abs(hit.distance - 0.2) < 1e-8)
  }
})

test('direct knife lines retain hit groups and take precedence over a nearer fallback box', () => {
  const result = traceKnife(origin, forward, [actor('near', 0.65, 0.5), actor('head', 0, 1)], 'swing', clear)
  assert.deepEqual(result.hit, { target: 'head', group: 'head' })
  assert.ok(Math.abs(result.distance - 0.84) < 1e-8)
})

test('fallback reach uses axis-aligned player bounds independently of animation and facing', () => {
  for (const [attack, inside, outside] of [
    ['swing', 1.99, 2.01],
    ['stab', 1.59, 1.61]
  ])
    for (const yaw of [0, Math.PI / 4, Math.PI / 2]) {
      const enemy = actor('enemy', 0.75, inside, yaw)
      assert.equal(traceKnife(origin, forward, [enemy], attack, clear).hit?.target, 'enemy')
      assert.equal(
        traceKnife(origin, forward, [{ ...enemy, center: { ...enemy.center, z: outside } }], attack, clear).hit,
        undefined
      )
    }
})

test('a world line blocks fallback contacts and neither attack accepts an invalid direction', () => {
  const enemy = actor('enemy', 0.5, 1)
  for (const attack of ['swing', 'stab']) {
    const blocked = traceKnife(origin, forward, [enemy], attack, () => 0.1)
    assert.equal(blocked.hit, undefined)
    assert.equal(blocked.contact, true)
    assert.equal(traceKnife(origin, { x: 0, y: 0, z: NaN }, [enemy], attack, clear), undefined)
  }
})

test('desktop and touch fallback stabs cross SDK Room without becoming lethal headshots', async () => {
  for (const mobile of [false, true])
    for (const armor of [0, 100]) {
      const wire = sdkRooms(),
        authority = wire.add(AUTH_SERVER),
        local = wire.add('me')
      const f = humanServer({ room: authority })
      const feet = { x: 95, y: 10.526, z: 52 }
      const targetFeet = { x: 94, y: 10.026, z: 52 }
      const shooter = f.addPlayer('me', 1, feet),
        target = f.addPlayer('target', 2, targetFeet)
      shooter.weapon().name = 'Knife'
      target.health().armor = armor
      f.tick(11)
      const c = combatClient({
        readyToShoot: true,
        aim: { x: -1, y: 0, z: 0 },
        modules: { './ballistics': ballistics, './hit-regions': load('hit-regions') },
        room: {
          onMessage: (...args) => local.onMessage(...args),
          send: (type, ...args) => (type === 'playerJoin' ? undefined : local.send(type, ...args))
        }
      })
      c.state.mobile = mobile
      Object.assign(c.weapon, { name: 'Knife', readyAt: 0, lastShotTime: 0 })
      c.component('Transform').getMutable(1).position = feet
      c.component('PlayerIdentityData').create(700, { address: 'target' })
      c.component('Transform').create(700, { position: targetFeet, rotation: { x: 0, y: 0, z: 0, w: 1 } })
      c.step(10.5)
      c.hold(InputAction.IA_SECONDARY, true)
      c.step(11)
      const request = c.sent.find((e) => e.type === 'knifeAttack')?.data
      assert.equal(request?.view.target, 'target', 'local prediction found the fallback contact')
      await wire.deliverFrom('me')
      assert.equal(target.health().current, armor ? 45 : 35)
      assert.equal(f.server.matchStats.get('me').kills, 0)
      assert.ok(f.logs.some((line) => line.includes('[KNIFE]') && line.includes('hit=body')))
      local.send('knifeAttack', request)
      await wire.deliverFrom('me')
      assert.equal(target.health().current, armor ? 45 : 35, 'duplicate cannot damage again')
    }
})

test('server slash cadence, revised damage and kill credit remain authoritative', () => {
  const f = humanServer()
  const shooter = f.addPlayer('me', 1, { x: 95, y: 10.526, z: 52 })
  const target = f.addPlayer('target', 2, { x: 94, y: 10.026, z: 52 })
  shooter.weapon().name = 'Knife'
  const attack = (time, shotId) => {
    f.tick(time)
    f.message('knifeAttack', 'me', { round: 1, revision: 1, shotId, attack: 'swing', direction: { x: -1, y: 0, z: 0 } })
  }
  attack(11, 1)
  assert.equal(target.health().current, 85)
  attack(11.2, 2)
  assert.equal(target.health().current, 85, 'early slash rejected')
  attack(11.4, 3)
  assert.equal(target.health().current, 70)
  attack(20, 4)
  assert.equal(target.health().current, 55, 'pause does not add damage')
  for (let i = 0; i < 4; i++) attack(21 + i * 0.4, 5 + i)
  assert.equal(target.health().current, 0)
  assert.equal(f.server.matchStats.get('me').kills, 1)
  attack(24, 9)
  assert.equal(f.server.matchStats.get('me').kills, 1)
})
