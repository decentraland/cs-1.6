import test from 'node:test'
import assert from 'node:assert/strict'
import { compile } from './compile.mjs'
const { FootstepRules, FootstepMotion, landingVolume } = compile('footstep-rules')('footstep-rules')

test('walking and exactly 150 HU/s remain silent; running uses 300 ms steps', () => {
  const walk = new FootstepRules(() => 0)
  for (let t = 0; t < 3; t += 0.02) assert.equal(walk.update(t, 3.75, 0, true, 'D'), undefined)
  const run = new FootstepRules(() => 0)
  assert.deepEqual(run.update(0, 6.25, 0, true, 'D'), { clip: 'pl_dirt2.wav', volume: 0.55, kind: 'step' })
  assert.equal(run.update(0.299, 6.25, 0, true, 'D'), undefined)
  assert.equal(run.update(0.3, 6.25, 0, true, 'D').clip, 'pl_dirt1.wav')
  assert.equal(run.update(0.6, 6.25, 0, true, 'D').clip, 'pl_dirt2.wav')
})

test('a slow-speed check retains its 400 ms timer after accelerating', () => {
  const steps = new FootstepRules(() => 0)
  assert.equal(steps.update(0, 0, 0, true, 'C'), undefined)
  assert.equal(steps.update(0.399, 6, 0, true, 'C'), undefined)
  assert.equal(steps.update(0.4, 6, 0, true, 'C').kind, 'step')
})

test('source foot alternation, material fallback and occasional fifth tile', () => {
  for (const [material, prefix, volume] of [
    ['M', 'metal', 0.5],
    ['V', 'duct', 0.7],
    ['G', 'grate', 0.5],
    ['W', 'step', 0.5],
    ['N', 'snow', 0.5],
    ['S', 'slosh', 0.5]
  ]) {
    const steps = new FootstepRules(() => 0.9)
    assert.deepEqual(steps.update(0, 6, 0, true, material), { clip: `pl_${prefix}4.wav`, volume, kind: 'step' })
    assert.equal(steps.update(0.3, 6, 0, true, material).clip, `pl_${prefix}3.wav`)
  }
  assert.equal(new FootstepRules(() => 0).update(0, 6, 0, true, 'T').clip, 'pl_tile5.wav')
})

test('running jumps sound once using takeoff material; walking jumps stay silent', () => {
  const jump = new FootstepRules(() => 0)
  jump.update(0, 3.75, 0, true, 'M')
  assert.deepEqual(jump.update(0.1, 3.75, 5, false, 'C'), { clip: 'pl_metal2.wav', volume: 1, kind: 'jump' })
  assert.equal(jump.update(0.4, 6, 3, false, 'C'), undefined)
  const walk = new FootstepRules(() => 0)
  walk.update(0, 3.25, 0, true, 'C')
  assert.equal(walk.update(0.1, 3.25, 5, false, 'C'), undefined)
})

test('landing volume follows original strict thresholds, not fall-damage thresholds', () => {
  for (const [speed, volume] of [
    [268.328, 0],
    [290, 0],
    [291, 0.85],
    [350, 0.85],
    [500, 0.85],
    [580, 0.85],
    [581, 1]
  ]) {
    assert.equal(landingVolume(speed * 0.025), volume, `${speed} HU/s`)
  }
  const fall = new FootstepRules(() => 0)
  fall.update(0, 0, 0, true, 'C')
  fall.update(0.1, 0, -15, false, 'C')
  assert.deepEqual(fall.update(0.3, 0, -2, true, 'D'), {
    clip: 'pl_dirt2.wav',
    volume: 1,
    kind: 'land',
    impactSpeed: 15
  })
  assert.equal(fall.update(0.4, 6, 0, true, 'D'), undefined)
  assert.equal(fall.update(0.6, 6, 0, true, 'D').kind, 'step')
})

test('unchanged network frames do not shorten the next movement sampling interval', () => {
  const motion = new FootstepMotion()
  motion.sample({ x: 0, y: 0, z: 0 }, 0)
  motion.sample({ x: 0, y: 0, z: 0 }, 0.1)
  motion.sample({ x: 0.65, y: 0, z: 0 }, 0.2)
  assert.equal(motion.horizontal, 3.25)
  motion.sample({ x: 0.65, y: 0, z: 0 }, 0.3)
  motion.sample({ x: 1.3, y: 0, z: 0 }, 0.4)
  assert.equal(motion.horizontal, 3.25)
  motion.sample({ x: 1.3, y: 0, z: 0 }, 0.65)
  assert.equal(motion.horizontal, 0)
})

test('teleports, stale resumes and impossible displacement reset movement sound history', () => {
  const motion = new FootstepMotion()
  assert.equal(motion.sample({ x: 0, y: 0, z: 0 }, 0), true)
  assert.equal(motion.sample({ x: 10, y: 0, z: 0 }, 0.1), true)
  assert.equal(motion.horizontal, 0)
  assert.equal(motion.sample({ x: 10, y: 10, z: 0 }, 0.2), true)
  assert.equal(motion.vertical, 0)
  assert.equal(motion.sample({ x: 11, y: 10, z: 0 }, 2), true)
})
