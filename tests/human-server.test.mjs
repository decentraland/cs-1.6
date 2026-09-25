import assert from 'node:assert/strict'
import { test } from 'node:test'
import { humanServer } from './helpers/human-server.mjs'

function crossing(options = {}) {
  const game = humanServer()
  const shooter = game.addPlayer('shooter', 1, { x: 95, y: 10.026, z: 52 })
  const target = game.addPlayer('target', options.team ?? 2, { x: 88, y: 10.026, z: 46 })
  game.tick(10)
  if (!options.noPing) game.echo('shooter', 10.4)
  for (let tick = 1; tick <= 60; tick++) {
    const at = 10 + tick / 60
    target.move({ x: 88, y: 10.026, z: 52 + 6 * (at - 10.7) })
    game.tick(at)
  }
  return { game, shooter, target }
}

test('real server handler rewinds a moving human, consumes ammo and confirms a kill exactly once', () => {
  const { game, shooter, target } = crossing()
  game.shoot('shooter')
  assert.equal(target.health().current, 0)
  assert.equal(shooter.weapon().ammoClip, 29)
  assert.equal(game.server.matchStats.get('shooter').kills, 1)
  assert.equal(game.server.matchStats.get('target').deaths, 1)
  assert.equal(game.sent.filter((event) => event.type === 'damageConfirmed' && event.data.wasKill).length, 1)
  assert.ok(game.logs.some((line) => line.includes('humanDelay=300ms humanRewind=1.80')))
  game.shoot('shooter')
  assert.equal(shooter.weapon().ammoClip, 29)
  assert.equal(game.server.matchStats.get('shooter').kills, 1)
})

test('without a measured ping the current-position baseline misses that same crossing human', () => {
  const { game, shooter, target } = crossing({ noPing: true })
  game.shoot('shooter')
  assert.equal(target.health().current, 100)
  assert.equal(shooter.weapon().ammoClip, 29)
})

test('a client cannot override human history with a claimed target position or bot view clock', () => {
  const { game, target } = crossing({ noPing: true })
  game.shoot('shooter', { target: 'target', targetPosition: { x: 88, y: 10.026, z: 52 }, seenAt: 10.7 })
  assert.equal(target.health().current, 100)
})

test('a queued shot keeps its receipt-time rewind when cadence defers execution', () => {
  const { game, shooter, target } = crossing()
  shooter.weapon().lastShotTime = 10.9445
  game.shoot('shooter')
  assert.equal(shooter.weapon().ammoClip, 30)
  target.move({ x: 88, y: 10.026, z: 54.04 })
  game.tick(11.04)
  assert.equal(target.health().current, 0)
  assert.equal(shooter.weapon().ammoClip, 29)
})

test('a queued old shot cannot damage a respawn after the history is reset', () => {
  const { game, shooter, target } = crossing()
  shooter.weapon().lastShotTime = 10.9445
  game.shoot('shooter')
  game.at(11.01)
  game.server.resetPlayerAccuracy('target', true)
  target.move({ x: 88, y: 10.026, z: 52 })
  game.tick(11.04)
  assert.equal(target.health().current, 100)
})

test('current eligibility excludes dead, disconnected, spectator and future-round humans from rewind', () => {
  for (const reason of ['dead', 'disconnected', 'spectator', 'future-round']) {
    const { game, target } = crossing()
    const seat = game.match.roster.find((seat) => seat.address === 'target')
    if (reason === 'dead') game.component('Dead').create(target.id, { deathTime: 11 })
    if (reason === 'disconnected') seat.connected = false
    if (reason === 'spectator') seat.team = 0
    if (reason === 'future-round') seat.eligibleRound = 2
    game.shoot('shooter')
    assert.equal(target.health().current, 100, reason)
  }
})

test('rewound teammates still block the bullet without taking friendly damage', () => {
  const { game, target } = crossing({ team: 1 })
  game.shoot('shooter')
  assert.equal(target.health().current, 100)
  assert.ok(game.logs.some((line) => line.includes('hit=head')))
  assert.equal(game.sent.filter((event) => event.type === 'damageConfirmed').length, 0)
})

test('a validated client head position resolves immediately despite a small avatar smoothing offset', () => {
  const game = humanServer()
  const shooter = game.addPlayer('shooter', 1, { x: 95, y: 10.026, z: 52 })
  const target = game.addPlayer('target', 2, { x: 88, y: 10.026, z: 52.25 })
  game.tick(10)
  game.echo('shooter', 10.4)
  for (let tick = 1; tick <= 60; tick++) game.tick(10 + tick / 60)
  game.shoot('shooter', { target: 'target', targetPosition: { x: 88, y: 10.026, z: 52 } })
  assert.equal(target.health().current, 0)
  assert.equal(shooter.weapon().ammoClip, 29)
  assert.ok(game.logs.some((line) => line.includes('humanClaim=accepted') && line.includes('hit=head')))
})

test('maximum-latency shots still have history when cadence queues them for a later tick', () => {
  const { game, shooter, target } = crossing({ noPing: true })
  game.echo('shooter', 11)
  shooter.weapon().lastShotTime = 10.9445
  game.shoot('shooter', { direction: { x: -7 / Math.hypot(7, 1.2), y: 0, z: -1.2 / Math.hypot(7, 1.2) } })
  game.tick(11.04)
  assert.equal(target.health().current, 0)
})
