import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { humanServer } from './helpers/human-server.mjs'
import { combatClient, InputAction as A } from './helpers/combat-client.mjs'
import { touchUI, buttons } from './helpers/touch-ui.mjs'
import { compile } from './compile.mjs'

const load = compile('round-rules', 'weapon-profiles')
const { canFight, canHandleWeapons, finishRound } = load('round-rules')
const { GUNS } = load('weapon-profiles')
const results = ['won', 'lost', 'draw']

function duel(phase = 'won', options = {}) {
  const game = humanServer(options)
  const shooter = game.addPlayer('shooter', 1, { x: 95, y: 10.026, z: 52 })
  const target = game.addPlayer('target', 2, { x: 88, y: 10.026, z: 52 })
  Object.assign(game.match, { phase, ctScore: 7, tScore: 4, maxWins: 16, matchOver: false, timeLeft: 4 })
  game.tick(10)
  game.tick(11)
  return { game, shooter, target }
}

test('round results keep combat and equipment usable; freeze and match end have separate rules', () => {
  for (const phase of ['live', ...results]) {
    assert.equal(canFight({ phase }), true, phase)
    assert.equal(canHandleWeapons({ phase }), true, phase)
    assert.equal(canFight({ phase, matchOver: true }), false)
    assert.equal(canHandleWeapons({ phase, matchOver: true }), false)
  }
  assert.equal(canFight({ phase: 'freeze' }), false)
  assert.equal(canHandleWeapons({ phase: 'freeze' }), true)
  for (const phase of ['ready', 'waiting', 'end', 'unknown']) {
    assert.equal(canFight({ phase }), false)
    assert.equal(canHandleWeapons({ phase }), false)
  }
  assert.equal(canFight(undefined), false)
  assert.equal(canHandleWeapons(undefined), false)
})

test('server shots after each result spend ammo and credit one kill without changing the round result', () => {
  for (const phase of results) {
    const { game, shooter, target } = duel(phase)
    game.shoot('shooter')
    assert.equal(shooter.weapon().ammoClip, 29, phase)
    assert.equal(target.health().current, 0, phase)
    assert.equal(game.server.matchStats.get('shooter').kills, 1)
    assert.equal(game.server.matchStats.get('target').deaths, 1)
    game.shoot('shooter')
    assert.equal(shooter.weapon().ammoClip, 29, 'duplicate remains rejected')
    assert.equal(finishRound(game.match, 't'), false)
    assert.equal(game.match.phase, phase)
    assert.equal(game.match.ctScore, 7)
    assert.equal(game.match.tScore, 4)
  }
})

test('queued bullets may cross the result transition but cannot cross freeze, match end or a new round', () => {
  for (const transition of ['won', 'freeze', 'match-over', 'new-round']) {
    const { game, shooter, target } = duel('live')
    shooter.weapon().lastShotTime = 10.9445
    game.shoot('shooter')
    assert.equal(shooter.weapon().ammoClip, 30)
    game.match.phase = transition === 'freeze' ? 'freeze' : 'won'
    if (transition === 'match-over') game.match.matchOver = true
    if (transition === 'new-round') game.match.round++
    game.tick(11.04)
    assert.equal(shooter.weapon().ammoClip, transition === 'won' ? 29 : 30, transition)
    assert.equal(target.health().current, transition === 'won' ? 0 : 100, transition)
  }
})

test('after-result gun and knife attacks still enforce death, eligibility, bomb actions and match end', () => {
  for (const reason of [
    'dead',
    'future-round',
    'spectator',
    'disconnected',
    'match-over',
    'freeze',
    'bomb',
    'objective'
  ]) {
    const { game, shooter, target } = duel('won', { isBombBusy: () => reason === 'objective' })
    const seat = game.match.roster.find((seat) => seat.address === 'shooter')
    if (reason === 'dead') game.component('Dead').create(shooter.id, { deathTime: 10 })
    if (reason === 'future-round') seat.eligibleRound = 2
    if (reason === 'spectator') seat.team = 0
    if (reason === 'disconnected') seat.connected = false
    if (reason === 'match-over') game.match.matchOver = true
    if (reason === 'freeze') game.match.phase = 'freeze'
    if (reason === 'bomb') game.component('PlayerEquipment').getMutable(shooter.id).bombSelected = true
    game.shoot('shooter')
    assert.equal(shooter.weapon().ammoClip, 30, reason)
    Object.assign(shooter.weapon(), { name: 'Knife', lastShotId: 0 })
    target.move({ x: 94.4, y: 10.026, z: 52 })
    game.message('knifeAttack', 'shooter', {
      round: 1,
      shotId: 2,
      revision: 1,
      attack: 'stab',
      direction: { x: -1, y: 0, z: 0 }
    })
    assert.equal(target.health().current, 100, reason)
    assert.equal(game.sent.filter((event) => event.type === 'knifeResult').length, 0, reason)
  }
})

test('server knife hits during results still damage nearby enemies exactly once', () => {
  for (const phase of results) {
    const { game, shooter, target } = duel(phase)
    Object.assign(shooter.weapon(), { name: 'Knife' })
    target.move({ x: 94.4, y: 10.026, z: 52 })
    const attack = { round: 1, shotId: 1, revision: 1, attack: 'stab', direction: { x: -1, y: 0, z: 0 } }
    game.message('knifeAttack', 'shooter', attack)
    assert.ok(target.health().current < 100, phase)
    const health = target.health().current
    game.message('knifeAttack', 'shooter', attack)
    assert.equal(target.health().current, health)
    assert.equal(game.sent.filter((event) => event.type === 'knifeResult').length, 1)
  }
})

test('every firearm can request a shot and reload from the real client during the result countdown', () => {
  for (const gun of Object.values(GUNS)) {
    const game = combatClient({ readyToShoot: true })
    game.match.phase = 'won'
    Object.assign(game.weapon, {
      name: gun.name,
      fireRate: gun.fireRate,
      ammoClip: gun.clip - 1,
      maxAmmoClip: gun.clip,
      ammoReserve: gun.reserve,
      reloadTime: gun.reloadTime
    })
    game.hold(A.IA_ACTION_6, true)
    game.step(11)
    assert.equal(game.sent.filter((event) => event.type === 'playerShoot').length, 1, gun.id)
    game.hold(A.IA_ACTION_6, false)
    game.hold(A.IA_SECONDARY, true)
    game.step(13)
    assert.equal(game.sent.filter((event) => event.type === 'playerReload').length, 1, gun.id)
    game.match.matchOver = true
    game.hold(A.IA_SECONDARY, false)
    game.hold(A.IA_ACTION_6, true)
    game.step(15)
    assert.equal(game.sent.filter((event) => event.type === 'playerShoot').length, 1, gun.id)
  }
})

test('knife swings, stabs and rifle alternate controls remain available during the result', () => {
  for (const phase of results) {
    const game = combatClient({ readyToShoot: true })
    game.match.phase = phase
    game.weapon.name = 'Knife'
    game.hold(A.IA_ACTION_6, true)
    game.step(11)
    game.hold(A.IA_ACTION_6, false)
    game.hold(A.IA_SECONDARY, true)
    game.step(12)
    assert.deepEqual(
      game.sent.filter((event) => event.type === 'knifeAttack').map((event) => event.data.attack),
      ['swing', 'stab']
    )
    game.weapon.name = 'M4A1'
    game.client.requestWeaponAlternate()
    assert.equal(game.sent.filter((event) => event.type === 'weaponAlternate').length, 1)
    game.match.matchOver = true
    game.client.requestWeaponAlternate()
    assert.equal(game.sent.filter((event) => event.type === 'weaponAlternate').length, 1)
  }
})

test('mobile result screens retain weapon slots, and remove them for dead or finished players', () => {
  const ui = touchUI()
  for (const phase of results) {
    ui.state.match.phase = phase
    const labels = buttons(ui.controls()).map((button) => button.label)
    for (const name of ['PRIMARY', 'PISTOL', 'KNIFE', 'GRENADE']) assert.ok(labels.includes(name), phase + ' ' + name)
  }
  ui.state.match.matchOver = true
  assert.ok(!buttons(ui.controls()).some((button) => button.label === 'PRIMARY'))
  ui.state.match.matchOver = false
  ui.state.dead = true
  assert.ok(!buttons(ui.controls()).some((button) => button.label === 'PRIMARY'))
})

const grenadeClientCode = buildSync({
  entryPoints: ['src/grenade-client.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  write: false,
  external: ['@dcl/sdk/*', './components', './fps-camera', './practice', './index', './weapon-view']
}).outputFiles[0].text

test('a primed grenade can be released across the round result without losing its throw request', () => {
  const match = { round: 1, phase: 'live', matchOver: false },
    weapon = { revision: 1, mode: 0, ammoReserve: 1, readyAt: 0 },
    messages = [],
    animations = [],
    module = { exports: {} }
  let now = 10
  const dependencies = {
    './components': { Weapon: { get: () => weapon } },
    './fps-camera': { getFpsAimDirection: () => ({ x: 0, y: 0, z: 1 }) },
    './practice': { getPractice: () => match },
    './index': { room: { send: (type, data) => messages.push({ type, data }) } },
    './weapon-view': { predictGrenadeAnimation: (mode) => animations.push(mode) }
  }
  runInNewContext(grenadeClientCode, { module, Date: { now: () => now * 1000 }, require: (name) => dependencies[name] })
  module.exports.grenadeInput(1, true)
  match.phase = 'won'
  now = 10.6
  module.exports.grenadeInput(1, false)
  assert.deepEqual(
    messages.map((event) => event.data.held),
    [true, false]
  )
  assert.deepEqual(animations, [1, 2])
  weapon.revision++
  now = 12
  module.exports.grenadeInput(1, true)
  assert.equal(animations.at(-1), 1)
  assert.equal(messages.at(-1).data.held, true)
})
