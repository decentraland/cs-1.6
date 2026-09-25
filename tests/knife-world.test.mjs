import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { compile } from './compile.mjs'
import { humanServer } from './helpers/human-server.mjs'

const load = compile('knife-rules', 'knife-world', 'ballistics')
const { traceKnife } = load('knife-rules')
const { boxDistance } = load('world-query')
const { PLAYER_HIT_REGIONS } = load('ballistics')
const { knifeWorldDistance, knifeHullDistance } = load('knife-world')
const origin = { x: 0, y: 1.6, z: 0 },
  forward = { x: 0, y: 0, z: 1 }
const box = (center, half) => (o, d, limit) => Math.min(limit, boxDistance(o, d, center, half) ?? limit)
const edge = box({ x: 0.35, y: 1.6, z: 1 }, { x: 0.1, y: 1, z: 0.3 })
const edgeHull = box({ x: 0.35, y: 1.6, z: 1 }, { x: 0.5, y: 1.45, z: 0.7 })
const actor = (x, z) => ({ id: 'enemy', center: { x, y: 0, z }, regions: PLAYER_HIT_REGIONS })
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`)

test('knife catches a nearby wall edge and refines its contact onto the actual surface', () => {
  for (const attack of ['swing', 'stab']) {
    const result = traceKnife(origin, forward, [], attack, edge, edgeHull)
    assert.equal(result.contact, true)
    assert.equal(result.hit, undefined)
    near(result.position.z, 0.7)
    assert.ok(result.position.x >= 0.25 && result.position.x <= 0.45)
    near(result.distance, Math.hypot(result.position.x, result.position.y - origin.y, result.position.z))
  }
})

test('a nearer world hull blocks an otherwise reachable fallback player box', () => {
  const result = traceKnife(origin, forward, [actor(0.7, 1.3)], 'swing', edge, edgeHull)
  assert.equal(result.contact, true)
  assert.equal(result.hit, undefined, 'nearby player behind the wall edge must not take damage')
})

test('direct anatomical lines take priority over off-axis world hulls', () => {
  const result = traceKnife(origin, forward, [actor(0, 1)], 'swing', edge, edgeHull)
  assert.deepEqual(result.hit, { target: 'enemy', group: 'head' })
  near(result.distance, 0.84)
})

test('the doubled center ray refines a wall beyond the original knife line length', () => {
  const line = box({ x: 0, y: 1.6, z: 1.5 }, { x: 1, y: 1, z: 0.1 })
  const hull = box({ x: 0, y: 1.6, z: 1.5 }, { x: 1.4, y: 1.45, z: 0.5 })
  const result = traceKnife(origin, forward, [], 'swing', line, hull)
  assert.equal(result.contact, true)
  near(result.distance, 1.4)
  near(result.position.z, 1.4)
})

test('the original Dust2 head hull catches an edge missed by its point hull', () => {
  const eye = { x: 90, y: 11.626, z: 54.2 }
  const direction = { x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 }
  near(knifeWorldDistance(eye, direction, 1.2), 1.2)
  near(knifeHullDistance(eye, direction, 1.2), 0.8604075313477855)
  const result = traceKnife(eye, direction, [], 'swing')
  assert.equal(result.contact, true)
  assert.equal(result.hit, undefined)
  assert.ok(result.distance > 0)
})

test('the production server acknowledges the Dust2 edge as a wall strike and applies contact cooldown', () => {
  const f = humanServer()
  const shooter = f.addPlayer('me', 1, { x: 90, y: 10.026, z: 54.2 })
  shooter.weapon().name = 'Knife'
  const attack = (time, shotId) => {
    f.tick(time)
    f.message('knifeAttack', 'me', {
      round: 1,
      revision: 1,
      shotId,
      attack: 'swing',
      direction: { x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 }
    })
  }
  const results = () => f.sent.filter((e) => e.type === 'knifeResult')
  attack(11, 1)
  assert.equal(results()[0]?.data.feedback.sound, 'knife_hitwall1')
  assert.equal(results()[0].data.target, false)
  attack(11.36, 2)
  assert.equal(results().length, 1, 'wall contact waits 0.4 seconds, not the 0.35-second miss delay')
  attack(11.4, 3)
  assert.equal(results().length, 2)
})

test('runtime head-hull traces match independently sampled original BSP contents', () => {
  const reference = JSON.parse(readFileSync(new URL('./fixtures/knife-hull.json', import.meta.url), 'utf8'))
  assert.equal(reference.samples.length, 24)
  assert.equal(reference.sourceSha256, load('dust2-knife-hull').DUST2_KNIFE_HULL.sourceSha256)
  for (const ray of reference.samples) near(knifeHullDistance(ray.origin, ray.direction, ray.limit), ray.distance)
})
