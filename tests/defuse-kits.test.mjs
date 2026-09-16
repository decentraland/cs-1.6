import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'
const load = compile('defuse-kit-rules', 'bomb-rules', 'penetration'),
  { canTakeDefuseKit, defuseKitPosition } = load('defuse-kit-rules'),
  { bulletWorldTrace } = load('penetration'),
  { freshBomb, stepBomb } = load('bomb-rules')
const kit = { x: 10, y: 0, z: 10 },
  ct = { team: 2, alive: true, defuseKit: false, position: kit }
test('only a living CT without a kit can collect the source-sized item', () => {
  assert.equal(canTakeDefuseKit(ct, kit), true)
  for (const changes of [
    { team: 1 },
    { team: 0 },
    { alive: false },
    { defuseKit: true },
    { position: { ...kit, y: 2 } },
    { position: { ...kit, y: -1.81 } },
    { position: { ...kit, x: 10.801 } }
  ])
    assert.equal(canTakeDefuseKit({ ...ct, ...changes }, kit), false)
  assert.equal(canTakeDefuseKit({ ...ct, position: { x: 10.79, y: 0, z: 10.79 } }, kit), true)
})
test('kits drop immediately to the BSP floor within 256 HU, and invalid drops are removed', () => {
  const feet = { x: 21, y: 10.434, z: 60 },
    position = defuseKitPosition(feet, bulletWorldTrace)
  assert.ok(position && Math.abs(position.y - 10.426) < 0.01)
  assert.equal(position.x, feet.x)
  assert.equal(position.z, feet.z)
  assert.equal(
    defuseKitPosition({ x: 21, y: 18, z: 60 }, bulletWorldTrace),
    undefined,
    'floor more than 256 HU below center'
  )
  assert.equal(defuseKitPosition({ x: 21, y: 25, z: 60 }, bulletWorldTrace), undefined, 'entire trace inside solid sky')
})
test('a recovered kit changes the next defuse from ten seconds to five', () => {
  const state = freshBomb(1, 't'),
    t = {
      address: 't',
      team: 1,
      alive: true,
      position: kit,
      grounded: true,
      holding: true,
      selected: true,
      hasKit: false,
      canDefuse: false
    }
  stepBomb(state, [t], 10, true, () => 'A')
  stepBomb(state, [t], 13, true, () => 'A')
  const player = {
    ...ct,
    address: 'ct',
    holding: true,
    grounded: true,
    selected: false,
    hasKit: false,
    canDefuse: true
  }
  stepBomb(state, [player], 14, true, () => 'A')
  assert.equal(state.actionEnds - state.actionStarted, 10)
  stepBomb(state, [{ ...player, holding: false }], 15, true, () => 'A')
  assert.equal(canTakeDefuseKit(ct, kit), true)
  stepBomb(state, [{ ...player, hasKit: true }], 16, true, () => 'A')
  assert.equal(state.actionEnds - state.actionStarted, 5)
  assert.equal(
    stepBomb(state, [{ ...player, hasKit: true }], 21, true, () => 'A'),
    'defused'
  )
})
