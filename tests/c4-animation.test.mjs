import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'
const load = compile('c4-animation-rules')
const { newC4Animation, advanceC4Animation } = load('c4-animation-rules')
const { freshBomb, stepBomb, cancelBombPlant } = load('bomb-rules')
const advance = (state, now, changes = {}) =>
  advanceC4Animation(state, {
    selected: true,
    held: true,
    site: true,
    readyAt: 0,
    planting: false,
    now,
    ...changes
  })

test('C4 draw waits 0.75s, pressbutton predicts immediately, and drop begins at 2.25s without replay on acknowledgment', () => {
  const state = newC4Animation()
  advance(state, 10)
  assert.equal(state.clip, 'draw')
  advance(state, 10.74)
  assert.equal(state.plantAt, -1)
  advance(state, 10.75)
  assert.equal(state.clip, 'pressbutton')
  const serial = state.serial
  advance(state, 11, { planting: true })
  assert.equal(state.serial, serial)
  advance(state, 12.999, { planting: true })
  assert.equal(state.clip, 'pressbutton')
  advance(state, 13, { planting: true })
  assert.equal(state.clip, 'drop')
  advance(state, 13.5, { selected: false })
  assert.equal(state.plantAt, -1)
})

test('plant release clears prediction immediately; early cancel idles, late cancel redraws, neither restarts before cooldown', () => {
  for (const [at, clip] of [
    [11.5, 'idle1'],
    [13.1, 'draw']
  ]) {
    const state = newC4Animation()
    advance(state, 10)
    advance(state, 10.75)
    advance(state, at, { planting: true, held: false })
    assert.equal(state.clip, clip)
    assert.equal(state.plantAt, -1)
    advance(state, at + 0.999)
    assert.equal(state.plantAt, -1)
    advance(state, at + 1)
    assert.equal(state.clip, 'pressbutton')
    assert.equal(state.plantAt, at + 1)
  }
})

test('authoritative C4 deploy, release and invalid-ground retries enforce source delays', () => {
  const player = {
    address: 't',
    team: 1,
    alive: true,
    selected: true,
    holding: true,
    grounded: true,
    position: { x: 0, y: 0, z: 0 },
    canDefuse: false,
    hasKit: false
  }
  const state = freshBomb(1, 't')
  state.readyAt = 10.75
  const step = (time) => stepBomb(state, [player], time, true, () => 'A')
  step(10.74)
  assert.equal(state.phase, 'carried')
  step(10.75)
  assert.equal(state.actionEnds, 13.75)
  player.grounded = false
  step(11)
  assert.equal(state.readyAt, 12.5)
  player.grounded = true
  step(12.499)
  assert.equal(state.phase, 'carried')
  step(12.5)
  assert.equal(state.phase, 'planting')
  player.holding = false
  step(13)
  assert.equal(state.readyAt, 14)
  player.holding = true
  step(14)
  cancelBombPlant(state, 15)
  assert.equal(state.phase, 'carried', 'holstering cancels before weapon selection')
  assert.equal(state.progress, 0)
})
