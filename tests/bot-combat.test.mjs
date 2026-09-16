import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const output = mkdtempSync(join(tmpdir(), 'cs16-bot-combat-'))
const require = createRequire(import.meta.url)
execFileSync(process.execPath, [
  'node_modules/typescript/bin/tsc',
  'src/bot-combat.ts',
  'src/economy-rules.ts',
  '--target',
  'es2020',
  '--module',
  'commonjs',
  '--outDir',
  output,
  '--skipLibCheck'
])
const { traceShot, fireAkShot, PLAYER_HIT_REGIONS, BOT_HIT_REGIONS } = require(join(output, 'ballistics.js'))
const { freshAccuracy } = require(join(output, 'accuracy.js'))
const { createBotCombat, botShot, BOT_EYE_HEIGHT } = require(join(output, 'bot-combat.js'))
const { armorDamage } = require(join(output, 'economy-rules.js'))
after(() => rmSync(output, { recursive: true, force: true }))

const feet = { x: 95, y: 10.026, z: 52 }
const target = { x: 88, y: feet.y + 1.05, z: 52 }
const targets = [{ id: 'player', center: { ...target, y: feet.y }, yaw: Math.PI / 2, regions: PLAYER_HIT_REGIONS }]
const options = (now, extra = {}) => ({
  feet,
  target,
  targets,
  speed: 0,
  now,
  alive: true,
  random: () => 0.5,
  difficulty: 'expert',
  ...extra
})
const first = (extra = {}) => {
  const state = createBotCombat(0)
  botShot(state, options(0, extra))
  return { state, shot: botShot(state, options(0.35, extra)) }
}

test('bot reaction and spawn grace delay the first shot, then shared AK ballistics determine damage', () => {
  const state = createBotCombat(6)
  assert.equal(botShot(state, options(0)), undefined)
  assert.equal(botShot(state, options(5.99)), undefined)
  assert.equal(state.weapon.ammoClip, 30)
  const shot = botShot(state, options(6))
  const eye = { ...feet, y: feet.y + BOT_EYE_HEIGHT },
    distance = Math.hypot(target.x - eye.x, target.y - eye.y, target.z - eye.z)
  const expected = fireAkShot({
    feet,
    eyeHeight: BOT_EYE_HEIGHT,
    aim: { x: (target.x - eye.x) / distance, y: (target.y - eye.y) / distance, z: 0 },
    accuracy: freshAccuracy(),
    triggerHeld: true,
    speed: 0,
    now: 6,
    damage: 36,
    targets,
    random: () => 0.5
  })
  const { direction: actualDirection, impacts: actualImpacts, ...actual } = shot,
    { direction: expectedDirection, impacts: expectedImpacts, ...rest } = expected
  assert.equal(actualImpacts.length, expectedImpacts.length)
  actualImpacts.forEach((impact, index) => {
    const { position, ...values } = impact,
      { position: expectedPosition, ...expectedValues } = expectedImpacts[index]
    assert.deepEqual(values, expectedValues)
    for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(position[axis] - expectedPosition[axis]) < 1e-10)
  })
  for (const result of [actual, rest]) for (const pellet of result.pellets) delete pellet.direction
  assert.deepEqual(actual, rest)
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(actualDirection[axis] - expectedDirection[axis]) < 1e-12)
  assert.equal(shot.hit.group, 'body')
  assert.equal(shot.damage, 35)
  assert.equal(state.weapon.ammoClip, 29)
  assert.equal(botShot(state, options(6)), undefined, 'same frame cannot fire twice')
  const head = first({ target: { ...target, y: feet.y + 1.6 } }).shot
  assert.equal(head.hit.group, 'head')
  assert.ok(head.damage > 100)
  const armored = armorDamage(shot.damage, 100, true, shot.hit.group, false, 0.775)
  assert.ok(armored.damage < shot.damage && armored.armor < 100)
})
test('bots fire at AK cadence within a burst independently of the 10Hz navigation tick', () => {
  const state = createBotCombat(0),
    shots = []
  for (let frame = 0; frame < 90; frame++) {
    const now = frame / 30,
      shot = botShot(state, options(now))
    if (shot) shots.push({ now, scheduled: state.weapon.lastShotTime, burst: state.burst })
  }
  assert.ok(shots.length >= 10)
  for (let i = 1; i < shots.length; i++) {
    const previous = shots[i - 1],
      shot = shots[i]
    if (previous.burst > 0) {
      assert.ok(Math.abs(shot.scheduled - previous.scheduled - 0.0955) < 1e-6)
      assert.ok(shot.now - previous.now <= 0.134)
    } else assert.ok(shot.now - previous.now >= 0.5 - 1e-6)
  }
  assert.equal(state.weapon.ammoClip, 30 - shots.length)
  assert.ok(state.accuracy.pitch > 0, 'burst recoil is retained')
})
test('losing sight releases the trigger immediately and reacquisition has a reaction delay', () => {
  const { state } = first()
  const ammo = state.weapon.ammoClip
  assert.equal(botShot(state, options(0.4, { target: undefined })), undefined)
  assert.equal(state.accuracy.held, false)
  assert.equal(state.burst, 0)
  assert.equal(botShot(state, options(0.5)), undefined)
  assert.equal(botShot(state, options(0.84)), undefined)
  assert.equal(state.weapon.ammoClip, ammo)
  assert.ok(botShot(state, options(0.86)))
})
test('empty magazines reload for the profile duration, consume finite reserve, and never reload dead bots', () => {
  const state = createBotCombat(0)
  state.weapon.ammoClip = 1
  state.weapon.ammoReserve = 2
  botShot(state, options(0))
  assert.ok(botShot(state, options(0.35)))
  botShot(state, options(0.45))
  assert.equal(state.weapon.isReloading, true)
  assert.equal(botShot(state, options(2.899)), undefined)
  assert.equal(state.weapon.ammoClip, 0)
  botShot(state, options(2.901, { target: undefined }))
  assert.equal(state.weapon.ammoClip, 2)
  assert.equal(state.weapon.ammoReserve, 0)
  assert.equal(state.accuracy.shots, 0)
  botShot(state, options(3))
  assert.ok(botShot(state, options(3.36)))
  assert.ok(botShot(state, options(3.46)))
  assert.equal(state.weapon.ammoClip, 0)
  assert.equal(botShot(state, options(10)), undefined)
  const dead = createBotCombat(0)
  dead.weapon.ammoClip = 0
  assert.equal(botShot(dead, options(10, { alive: false })), undefined)
  assert.equal(dead.weapon.isReloading, false)
})
test('bot rounds hit map walls or an intervening teammate instead of awarding guaranteed player damage', () => {
  const wallTarget = { ...target, x: 103 }
  const wall = first({
    target: wallTarget,
    targets: [{ id: 'player', center: { ...wallTarget, y: feet.y }, yaw: Math.PI / 2, regions: PLAYER_HIT_REGIONS }]
  })
  assert.equal(wall.shot.hit, undefined)
  assert.equal(wall.shot.damage, 0)
  assert.ok(wall.shot.position.x < 99)
  assert.equal(wall.state.weapon.ammoClip, 29, 'a wall hit still uses ammunition')
  const friend = { id: 'friend', center: { x: 91, y: feet.y, z: 52 }, regions: BOT_HIT_REGIONS }
  assert.equal(first({ targets: [...targets, friend] }).shot.hit.target, 'friend')
})
test('bot fire inherits running and airborne spread, and each bot has independent ammunition and recoil', () => {
  const scatter = () => {
    const samples = [0.5, 0.9, 0.9, 0.9, 0.9]
    return () => samples.shift() ?? 0.5
  }
  const standing = first({ random: scatter() }).shot
  const running = first({ speed: 5.525, random: scatter() }).shot
  const airborne = first({ feet: { ...feet, y: feet.y + 1 }, random: scatter() }).shot
  const deviation = (shot) => Math.abs(shot.direction.z)
  assert.ok(deviation(running) > deviation(standing))
  assert.ok(deviation(airborne) > deviation(running))
  const other = createBotCombat(0)
  assert.equal(other.weapon.ammoClip, 30)
  assert.equal(other.accuracy.shots, 0)
})
