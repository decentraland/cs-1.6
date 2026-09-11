import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  decayVictimPunch,
  fadePainDirections,
  mergePainDirections,
  painDirections,
  victimPunch
} from '../src/damage-feedback.ts'

const origin = { x: 0, y: 0, z: 0 }
const view = { x: 0, y: 0, z: 1 }

test('pain compass resolves attack origins relative to the current view', () => {
  assert.deepEqual(painDirections({ x: 0, y: 0, z: 10 }, origin, view), { front: 1, right: 0, rear: 0, left: 0 })
  assert.deepEqual(painDirections({ x: 10, y: 0, z: 0 }, origin, view), { front: 0, right: 1, rear: 0, left: 0 })
  assert.deepEqual(painDirections({ x: 0, y: 0, z: -10 }, origin, view), { front: 0, right: 0, rear: 1, left: 0 })
  assert.deepEqual(painDirections({ x: -10, y: 0, z: 0 }, origin, view), { front: 0, right: 0, rear: 0, left: 1 })
  assert.deepEqual(painDirections({ x: 1, y: 0.5, z: 0 }, origin, view), { front: 1, right: 1, rear: 1, left: 1 })
  assert.deepEqual(painDirections({ x: 1, y: 20, z: 0 }, origin, view), { front: 0, right: 0, rear: 0, left: 0 })
})

test('pain compass keeps stronger recent directions and uses the GoldSrc fade threshold', () => {
  assert.deepEqual(mergePainDirections({ front: 0.8, right: 0, rear: 0, left: 0 }, { front: 0.5, right: 1, rear: 0, left: 0 }), { front: 0.8, right: 1, rear: 0, left: 0 })
  assert.deepEqual(fadePainDirections({ front: 1, right: 0.5, rear: 0.4, left: 0 }, 0.1), { front: 0.8, right: 0.3, rear: 0, left: 0 })
  assert.deepEqual(fadePainDirections({ front: 0.3, right: 0, rear: 0, left: 0 }, 0.1), { front: 0, right: 0, rear: 0, left: 0 })
})

test('victim punch follows hitgroup caps and armor suppression', () => {
  assert.deepEqual(victimPunch('head', 35, false, () => 0), { pitch: 12, roll: -9 })
  assert.deepEqual(victimPunch('head', 10, false, () => 0.75), { pitch: 5, roll: 5 })
  assert.deepEqual(victimPunch('body', 35, false), { pitch: 3.5, roll: 0 })
  assert.deepEqual(victimPunch('body', 100, false), { pitch: 4, roll: 0 })
  assert.deepEqual(victimPunch('head', 100, true), { pitch: 0, roll: 0 })
  assert.deepEqual(victimPunch('legs', 100, false), { pitch: 0, roll: 0 })
})

test('victim punch decays with the shared GoldSrc punch formula', () => {
  const initial = { pitch: 12, roll: 9 }
  const later = decayVictimPunch(initial, 0.2)
  assert.ok(later.pitch > 0 && later.pitch < initial.pitch)
  assert.ok(later.roll > 0 && later.roll < initial.roll)
  assert.ok(Math.abs(later.pitch / later.roll - initial.pitch / initial.roll) < 1e-9)
  assert.deepEqual(decayVictimPunch(initial, 2), { pitch: 0, roll: 0 })
})
