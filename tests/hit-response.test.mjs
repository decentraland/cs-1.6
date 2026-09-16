import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'
const load = compile('ballistics', 'economy-rules', 'knife-rules', 'player-sound-rules', 'damage-feedback')
const { traceShot, fireGunShot, PLAYER_HIT_REGIONS } = load('ballistics')
const { hitMultiplier, armorCovers, regionDistance, damageBatches } = load('hit-regions')
const { armorDamage } = load('economy-rules')
const { freshAccuracy } = load('accuracy')
const { resolveKnifeAttack, freshKnifeCooldown } = load('knife-rules')
const { playerVoice } = load('player-sound-rules')
const { victimPunch } = load('damage-feedback')
const target = { id: 'victim', center: { x: 88, y: 10.026, z: 52 }, yaw: Math.PI / 2, regions: PLAYER_HIT_REGIONS }
const origin = { x: 95, y: 11.626, z: 52 }
const aim = (point) => {
  const d = { x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z }
  const n = Math.hypot(d.x, d.y, d.z)
  return { x: d.x / n, y: d.y / n, z: d.z / n }
}
const fire = (height, gun = 'ak47') =>
  fireGunShot({
    gun,
    feet: { ...origin, y: origin.y - 1.6 },
    aim: aim({ ...target.center, y: target.center.y + height }),
    accuracy: freshAccuracy(),
    triggerHeld: true,
    speed: 0,
    grounded: true,
    now: 100,
    damage: gun === 'ak47' ? 36 : 20,
    targets: [target],
    random: () => 0.5
  })
test('front-facing avatar separates head, chest, stomach, arms and legs', () => {
  for (const [height, side, group] of [
    [1.6, 0, 'head'],
    [1.2, 0, 'body'],
    [0.8, 0, 'stomach'],
    [1.1, 0.34, 'arms'],
    [0.3, 0, 'legs']
  ]) {
    const point = { ...target.center, y: target.center.y + height, z: target.center.z - side }
    assert.equal(traceShot(origin, aim(point), [target]).hit?.group, group)
  }
})
test('hit regions rotate with the target while retaining distances', () => {
  const r = PLAYER_HIT_REGIONS.find((r) => r.group === 'arms' && r.x > 0)
  assert.ok(
    regionDistance(
      { x: 0.325, y: 1.1, z: 5 },
      { x: 0, y: 0, z: -1 },
      { id: 0, center: { x: 0, y: 0, z: 0 }, regions: [r] },
      r
    ) < 5
  )
  assert.ok(
    regionDistance(
      { x: 5, y: 1.1, z: -0.325 },
      { x: -1, y: 0, z: 0 },
      { id: 0, center: { x: 0, y: 0, z: 0 }, yaw: Math.PI / 2, regions: [r] },
      r
    ) < 5
  )
  assert.equal(
    regionDistance(
      { x: 0.325, y: 1.1, z: 5 },
      { x: 0, y: 0, z: -1 },
      { id: 0, center: { x: 0, y: 0, z: 0 }, yaw: Math.PI / 2, regions: [r] },
      r
    ),
    undefined
  )
})
test('bullet hit multipliers retain fractional damage until armor and health truncation', () => {
  assert.deepEqual(['head', 'body', 'stomach', 'arms', 'legs'].map(hitMultiplier), [4, 1, 1.25, 1, 0.75])
  assert.equal(fire(1.2).damage, 35)
  assert.equal(fire(0.8).damage, 43.75)
  assert.equal(fire(0.3).damage, 26.25)
  const result = armorDamage(43.75, 100, true, 'stomach', false, 0.775)
  assert.equal(Math.floor(result.damage), 33)
  assert.equal(result.armor, 95.078125)
  assert.equal(
    Math.floor(armorDamage(23.75, 100, true, 'stomach', false, 0.775).damage),
    18,
    'early truncation would incorrectly give 17'
  )
})
test('armor protects torso and arms, helmet protects head, legs bypass both', () => {
  for (const group of ['body', 'stomach', 'arms']) {
    assert.equal(armorCovers(group, 100, false), true)
    assert.equal(armorDamage(40, 100, false, group, false, 0.775).damage, 31)
  }
  assert.equal(armorCovers('head', 100, false), false)
  assert.equal(armorCovers('head', 100, true), true)
  assert.deepEqual(armorDamage(26.25, 100, true, 'legs'), { damage: 26.25, armor: 100 })
  assert.deepEqual(armorDamage(43.75, 1, true, 'stomach', false, 0.775), { damage: 41.75, armor: 0 })
  assert.deepEqual(victimPunch('stomach', 43.75, false), { pitch: 4, roll: 0 })
  assert.deepEqual(victimPunch('arms', 35, false), { pitch: 0, roll: 0 })
})
test('a shotgun combines fractional pellets before applying integer health damage', () => {
  const shot = fire(0.8, 'xm1014'),
    batches = damageBatches(shot.impacts)
  assert.equal(shot.impacts.length, 6)
  assert.equal(batches.length, 1)
  assert.equal(batches[0].group, 'stomach')
  assert.equal(batches[0].damage, 135)
  assert.equal(Math.floor(armorDamage(batches[0].damage, 100, true, 'stomach', false, 0.5).damage), 67)
  assert.equal(batches[0].traces.length, 6)
  assert.equal(batches[0].traces[0].damage, 22.5)
})
test('pellet batches keep the last hit group and flush when a different player is hit', () => {
  const hit = (target, group, damage) => ({ hit: { target, group }, damage })
  const batches = damageBatches([
    hit('a', 'stomach', 23.75),
    { damage: 0 },
    hit('a', 'legs', 14.25),
    hit('b', 'body', 19),
    hit('a', 'head', 76)
  ])
  assert.deepEqual(
    batches.map(({ target, group, damage }) => ({ target, group, damage })),
    [
      { target: 'a', group: 'legs', damage: 38 },
      { target: 'b', group: 'body', damage: 19 },
      { target: 'a', group: 'head', damage: 76 }
    ]
  )
})
test('knife stomach attacks use 125 percent damage including rear stabs', () => {
  assert.equal(resolveKnifeAttack(freshKnifeCooldown(), 'swing', 100, true, 'stomach').damage, 25)
  assert.equal(resolveKnifeAttack(freshKnifeCooldown(), 'stab', 100, true, 'stomach', true).damage, 243.75)
})
test('original player voices distinguish armor coverage, helmet depletion and fatal hits', () => {
  assert.equal(playerVoice('head', true, true, false), 'bhit_helmet-1')
  assert.equal(
    playerVoice('head', true, false, false, () => 0),
    'headshot1'
  )
  assert.equal(playerVoice('arms', true, false, false), 'bhit_kevlar-1')
  assert.equal(playerVoice('stomach', true, false, false), 'bhit_kevlar-1')
  assert.equal(
    playerVoice('legs', true, true, false, () => 0.9),
    'bhit_flesh-3'
  )
  assert.equal(
    playerVoice('body', false, false, false, () => 0),
    'bhit_flesh-1'
  )
  assert.equal(
    playerVoice('head', true, true, true, () => 0.9),
    'death6'
  )
})
