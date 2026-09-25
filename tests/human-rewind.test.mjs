import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'

const load = (name) => {
  const output = buildSync({
    entryPoints: [`src/${name}.ts`],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false
  })
  const module = { exports: {} }
  runInNewContext(output.outputFiles[0].text, { module })
  return module.exports
}
const { HumanHistory, HumanLatency, HUMAN_MAX_REWIND, LATENCY_MAX_AGE } = load('human-rewind')
const { traceShot, PLAYER_HIT_REGIONS } = load('ballistics')
const sample = (at, x = 88, z = 52, yaw = 0) => ({ at, position: { x, y: 10.026, z }, yaw })
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`)

test('latency is measured per sender using one outstanding server probe', () => {
  const latency = new HumanLatency()
  const a = latency.probe('a', 10),
    b = latency.probe('b', 10)
  assert.notEqual(a, b)
  assert.equal(latency.probe('a', 10.1), undefined)
  assert.equal(latency.acknowledge('unknown', a, 10.1), false)
  assert.equal(latency.acknowledge('b', a, 10.1), false)
  assert.equal(latency.acknowledge('a', a + 20, 10.1), false)
  assert.equal(latency.acknowledge('a', a, NaN), false)
  assert.equal(latency.acknowledge('a', a, 9.9), false)
  assert.equal(latency.acknowledge('a', a, 10.2), true)
  assert.equal(latency.acknowledge('a', a, 10.4), false)
  assert.equal(latency.acknowledge('b', b, 10.6), true)
  near(latency.viewTime('a', 11).delay, 0.2)
  near(latency.viewTime('b', 11).delay, 0.4)
})

test('a delayed echo cannot immediately increase compensation and all rewind is capped', () => {
  const latency = new HumanLatency()
  latency.acknowledge('a', latency.probe('a', 10), 10.2)
  latency.acknowledge('a', latency.probe('a', 12), 13.8)
  near(latency.viewTime('a', 14).delay, 0.2)
  near(latency.viewTime('a', 21).delay, HUMAN_MAX_REWIND)
  assert.equal(latency.viewTime('a', 14 + LATENCY_MAX_AGE).rtt, undefined)
  assert.equal(latency.viewTime('missing', 14).at, 14)
})

test('expired probes and reconnect echoes cannot contaminate a new session', () => {
  const latency = new HumanLatency()
  const expired = latency.probe('a', 10)
  assert.equal(latency.acknowledge('a', expired, 12.1), false)
  const oldSession = latency.probe('a', 13)
  latency.forget('a')
  const newSession = latency.probe('a', 13.1)
  assert.notEqual(oldSession, newSession)
  assert.equal(latency.acknowledge('a', oldSession, 13.2), false)
  assert.equal(latency.acknowledge('a', newSession, 13.3), true)
  latency.forget('a')
  assert.equal(latency.viewTime('a', 14).delay, 0)
})

test('human histories interpolate both position and the short yaw arc without moving live entities', () => {
  const history = new HumanHistory()
  const first = sample(10, 88, 52, Math.PI - 0.1)
  history.record('target', 'life', first)
  history.record('target', 'life', sample(10.2, 88, 53.2, -Math.PI + 0.1))
  first.position.z = 900
  const midpoint = history.at('target', 'life', 10.1)
  near(midpoint.position.z, 52.6)
  near(Math.abs(midpoint.yaw), Math.PI)
  midpoint.position.z = 800
  near(history.at('target', 'life', 10.1).position.z, 52.6)
  assert.equal(history.at('target', 'life', 9.99), undefined)
  assert.equal(history.at('target', 'life', 11), undefined)
})

test('a new life, team, entity or round never reuses old target positions', () => {
  for (const life of ['respawn', 'team', 'entity', 'round']) {
    const history = new HumanHistory()
    history.record('target', 'old', sample(10))
    history.record('target', life, sample(10.1))
    assert.equal(history.at('target', life, 10), undefined)
    assert.equal(history.at('target', 'old', 10.1), undefined)
    assert.ok(history.at('target', life, 10.1))
    history.clear('target')
    assert.equal(history.at('target', life, 10.1), undefined)
    history.record('target', life, sample(10.2))
    assert.equal(history.at('target', life, 10.1), undefined)
  }
})

test('teleports, missing samples and invalid poses break history instead of drawing a hit path', () => {
  for (const next of [sample(10.1, 110), sample(10.4), sample(10.1, NaN)]) {
    const history = new HumanHistory()
    history.record('target', 'life', sample(10))
    history.record('target', 'life', next)
    assert.equal(history.at('target', 'life', 10.05), undefined)
  }
})

test('history remains bounded while retaining a bracketing sample at the cutoff', () => {
  const history = new HumanHistory()
  for (let tick = 0; tick <= 100; tick++)
    history.record('target', 'life', sample(10 + tick * 0.03, 88, 52 + tick * 0.01))
  near(history.at('target', 'life', 12).position.z, 52 + 2 / 3)
  assert.equal(history.at('target', 'life', 11.99), undefined)
  assert.equal(history.at('target', 'life', NaN), undefined)
  history.record('target', 'life', sample(12.9, 100))
  near(history.at('target', 'life', 13).position.z, 53)
})

test('rewind fixes a crossing-human miss at 6 m/s for several measured latencies', () => {
  for (const rtt of [0.1, 0.2, 0.4, 1.2]) {
    const latency = new HumanLatency(),
      history = new HumanHistory()
    latency.acknowledge('shooter', latency.probe('shooter', 8), 8 + rtt)
    const view = latency.viewTime('shooter', 10)
    for (let tick = 0; tick <= 40; tick++) {
      const at = 9 + tick * 0.025
      history.record('target', 'life', sample(at, 88, 52 + 6 * (at - view.at)))
    }
    const current = history.at('target', 'life', 10),
      past = history.at('target', 'life', view.at)
    const target = (pose) => ({ id: 'human', center: pose.position, yaw: pose.yaw, regions: PLAYER_HIT_REGIONS })
    const eye = { x: 95, y: 11.626, z: 52 },
      west = { x: -1, y: 0, z: 0 }
    assert.equal(traceShot(eye, west, [target(current)]).hit, undefined, `current-position baseline, RTT ${rtt}`)
    assert.equal(traceShot(eye, west, [target(past)]).hit?.target, 'human')
    assert.equal(traceShot(eye, west, [target(past)]).hit?.group, 'head')
    near(current.position.z - past.position.z, 6 * view.delay)
  }
})

test('historical human hitboxes still respect Dust2 walls and nearest target order', () => {
  const history = new HumanHistory()
  for (const at of [10, 10.1]) history.record('target', 'life', sample(at, 103))
  const target = { id: 'human', center: history.at('target', 'life', 10.05).position, regions: PLAYER_HIT_REGIONS }
  const eye = { x: 95, y: 11.626, z: 52 }
  assert.equal(traceShot(eye, { x: 1, y: 0, z: 0 }, [target]).hit, undefined)
  const far = { ...target, id: 'enemy', center: { x: 83, y: 10.026, z: 52 } }
  const near = { ...target, id: 'teammate', center: { x: 88, y: 10.026, z: 52 } }
  assert.equal(traceShot(eye, { x: -1, y: 0, z: 0 }, [far, near]).hit.target, 'teammate')
})

test('client observation tolerates small smoothing differences, only near the measured view time', () => {
  const history = new HumanHistory()
  for (let tick = 0; tick <= 40; tick++) history.record('target', 'life', sample(10 + tick / 40, 88, 46 + tick * 0.15))
  const allowed = history.observed('target', 'life', 10.7, 11, { x: 88.2, y: 10.026, z: 50.5 })
  assert.ok(allowed)
  near(allowed.position.x, 88.2)
  near(allowed.at, 10.75)
  assert.equal(history.observed('target', 'life', 10.7, 11, { x: 90, y: 10.026, z: 50.5 }), undefined)
  assert.equal(history.observed('target', 'life', 10.7, 11, { x: 88, y: 10.026, z: 46 }), undefined)
  assert.equal(history.observed('target', 'life', 10.7, 11, { x: NaN, y: 10.026, z: 50.5 }), undefined)
  assert.equal(history.observed('target', 'other-life', 10.7, 11, { x: 88, y: 10.026, z: 50.5 }), undefined)
})

test('the observation allowance cannot extend the half-second maximum rewind', () => {
  const history = new HumanHistory()
  for (let tick = 0; tick <= 40; tick++) history.record('target', 'life', sample(10 + tick / 40, 88, 46 + tick * 0.15))
  assert.equal(history.observed('target', 'life', 10.5, 11, { x: 88, y: 10.026, z: 48.4 }), undefined)
  assert.ok(history.observed('target', 'life', 10.5, 11, { x: 88, y: 10.026, z: 49 }))
})
