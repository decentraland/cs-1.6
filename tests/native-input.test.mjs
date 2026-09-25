import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeInput, InputAction as A, PointerEventType as P } from './helpers/native-input.mjs'
import { combatClient } from './helpers/combat-client.mjs'

function overlapping(fixture, action, down, timestamp) {
  fixture.add(fixture.ui, A.IA_POINTER, down, timestamp + 2)
  fixture.add(fixture.engine.RootEntity, action, down, timestamp)
  fixture.add(fixture.engine.RootEntity, A.IA_POINTER, down, timestamp + 1)
}

test('native combat presses survive a newer UI pointer event in the installed SDK', async () => {
  for (const action of [A.IA_ACTION_6, A.IA_SECONDARY, A.IA_PRIMARY, A.IA_WALK, A.IA_JUMP, A.IA_MODIFIER]) {
    const fixture = nativeInput()
    overlapping(fixture, action, true, 1)
    await fixture.frame()
    assert.equal(fixture.sdk.isPressed(action), true, 'SDK 7.29 retains the native press')
    assert.equal(fixture.controls.isCombatInputPressed(action), true, `action ${action} held`)
    assert.equal(fixture.controls.isCombatInputTriggered(action, P.PET_DOWN), true)
    await fixture.frame()
    assert.equal(fixture.controls.isCombatInputPressed(action), true)
    assert.equal(fixture.controls.isCombatInputTriggered(action, P.PET_DOWN), false, 'edge lasts one frame')
  }
})

test('native release cannot get stuck behind a newer UI pointer event', async () => {
  for (const action of [A.IA_ACTION_6, A.IA_SECONDARY, A.IA_PRIMARY, A.IA_WALK, A.IA_MODIFIER]) {
    const fixture = nativeInput()
    fixture.add(fixture.ui, A.IA_POINTER, true, 1)
    fixture.add(fixture.engine.RootEntity, action, true, 2)
    await fixture.frame()
    assert.equal(fixture.sdk.isPressed(action), true)
    overlapping(fixture, action, false, 3)
    await fixture.frame()
    assert.equal(fixture.sdk.isPressed(action), false, 'SDK 7.29 retains the native release')
    assert.equal(fixture.controls.isCombatInputPressed(action), false, `action ${action} released`)
    assert.equal(fixture.controls.isCombatInputTriggered(action, P.PET_UP), true)
  }
})

test('only native root actions drive mobile controls; old events never replay', async () => {
  const fixture = nativeInput()
  fixture.add(fixture.ui, A.IA_ACTION_6, true, 1)
  fixture.add(fixture.ui, A.IA_SECONDARY, true, 2)
  await fixture.frame()
  assert.equal(fixture.controls.isCombatInputPressed(A.IA_ACTION_6), false)
  assert.equal(fixture.controls.isCombatInputPressed(A.IA_SECONDARY), false)
  fixture.add(fixture.engine.RootEntity, A.IA_ACTION_6, true, 3)
  fixture.add(fixture.engine.RootEntity, A.IA_ACTION_6, false, 4)
  fixture.add(fixture.engine.RootEntity, A.IA_WALK, true, 5)
  await fixture.frame()
  assert.equal(fixture.controls.isCombatInputPressed(A.IA_ACTION_6), false)
  assert.equal(fixture.controls.isCombatInputTriggered(A.IA_ACTION_6, P.PET_DOWN), true)
  assert.equal(fixture.controls.isCombatInputTriggered(A.IA_ACTION_6, P.PET_UP), true)
  assert.equal(fixture.controls.isCombatInputPressed(A.IA_WALK), true)
  await fixture.frame()
  assert.equal(fixture.controls.isCombatInputTriggered(A.IA_ACTION_6, P.PET_UP), false)
  assert.equal(fixture.controls.isCombatInputTriggered(A.IA_ACTION_6, P.PET_DOWN), false)
})

test('desktop input continues to use the SDK including entity-bound actions', async () => {
  const fixture = nativeInput()
  fixture.state.mobile = false
  fixture.add(fixture.ui, A.IA_POINTER, true, 1)
  await fixture.frame()
  assert.equal(fixture.controls.fireInputAction(), A.IA_POINTER)
  assert.equal(fixture.controls.isCombatInputPressed(A.IA_POINTER), true)
  assert.equal(fixture.controls.isCombatInputTriggered(A.IA_POINTER, P.PET_DOWN), true)
  fixture.add(fixture.ui, A.IA_POINTER, false, 2)
  await fixture.frame()
  assert.equal(fixture.controls.isCombatInputPressed(A.IA_POINTER), false)
})

test('actual client starts and stops automatic fire across overlapping native/UI events', async () => {
  const fixture = nativeInput(),
    game = combatClient({ input: fixture.sdk, controls: fixture.controls, readyToShoot: true })
  const shots = () => game.sent.filter((event) => event.type === 'playerShoot')
  overlapping(fixture, A.IA_ACTION_6, true, 1)
  await fixture.frame()
  game.step(11)
  assert.equal(shots().length, 1)
  fixture.add(fixture.engine.RootEntity, A.IA_ACTION_6, true, 4)
  await fixture.frame()
  game.step(11.1)
  assert.equal(shots().length, 2)
  overlapping(fixture, A.IA_ACTION_6, false, 5)
  await fixture.frame()
  game.step(11.2)
  assert.equal(shots().length, 2, 'release stops shots even though SDK still reports held')
  const trigger = game.sent.filter((event) => event.type === 'playerTrigger').at(-1)
  assert.equal(trigger.data.held, false)
  await fixture.frame()
  game.step(11.3)
  assert.equal(shots().length, 2)
})

test('actual client reload starts from native press and stops retrying after release', async () => {
  const fixture = nativeInput(),
    game = combatClient({ input: fixture.sdk, controls: fixture.controls })
  const reloads = () => game.sent.filter((event) => event.type === 'playerReload')
  fixture.add(fixture.ui, A.IA_POINTER, true, 1)
  fixture.add(fixture.engine.RootEntity, A.IA_SECONDARY, true, 2)
  await fixture.frame()
  game.step(11)
  assert.equal(reloads().length, 1)
  overlapping(fixture, A.IA_SECONDARY, false, 3)
  await fixture.frame()
  game.step(11.3)
  assert.equal(reloads().length, 1, 'no retry after the native release')
})
