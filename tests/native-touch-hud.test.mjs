import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeInput, InputAction as A } from './helpers/native-input.mjs'
import { combatClient } from './helpers/combat-client.mjs'

function fixture() {
  const input = nativeInput()
  const game = combatClient({ input: input.sdk, controls: input.controls, readyToShoot: true, touchContext: true })
  let timestamp = 0
  return {
    game,
    input,
    config: () => game.component('TouchScreenControls').get(0),
    async event(action, down, now) {
      input.add(input.engine.RootEntity, action, down, ++timestamp)
      await input.frame()
      game.step(now)
    }
  }
}

test('the native large button fires and releases actual shots; jump stays a smaller separate action', async () => {
  const f = fixture()
  const config = f.config()
  assert.equal(config.mainAction, A.IA_ACTION_6)
  assert.equal(config.hideJoystick, false)
  assert.equal(config.hideCrosshair, true)
  const visible = config.touchInputs.filter((button) => !button.hide)
  assert.equal(visible.length, 4)
  assert.ok(visible.some((button) => button.inputAction === A.IA_JUMP))
  assert.ok(!visible.some((button) => button.inputAction === A.IA_POINTER))
  assert.ok(
    visible.find((button) => button.inputAction === config.mainAction).icon.tex.texture.src.endsWith('/fire.png')
  )
  await f.event(config.mainAction, true, 11)
  f.game.step(11.1)
  assert.equal(f.game.sent.filter((event) => event.type === 'playerShoot').length, 2)
  await f.event(config.mainAction, false, 11.2)
  f.game.step(11.4)
  assert.equal(f.game.sent.filter((event) => event.type === 'playerShoot').length, 2)
})

test('native walk toggles once per press and retains its mode after release and menus', async () => {
  const f = fixture()
  const icon = () => f.config().touchInputs.find((button) => button.inputAction === A.IA_ACTION_3).icon.tex.texture.src
  assert.ok(icon().endsWith('/run.png'))
  await f.event(A.IA_ACTION_3, true, 11)
  assert.ok(icon().endsWith('/walk.png'))
  await f.input.frame()
  f.game.step(11.1)
  assert.ok(icon().endsWith('/walk.png'), 'holding does not keep toggling')
  await f.event(A.IA_ACTION_3, false, 11.2)
  assert.ok(icon().endsWith('/walk.png'))
  f.game.state.buy = true
  f.game.step(11.3)
  assert.ok(f.config().touchInputs.every((button) => button.hide))
  f.game.state.buy = false
  f.game.step(11.4)
  assert.ok(icon().endsWith('/walk.png'))
  await f.event(A.IA_ACTION_3, true, 11.5)
  assert.ok(icon().endsWith('/run.png'))
})

test('native weapon actions stay contextual and never require a sixth gamepad button', async () => {
  const f = fixture()
  for (const [name, alternate] of [
    ['AK-47', undefined],
    ['AWP', 'zoom'],
    ['USP', 'silencer'],
    ['Glock-18', 'burst'],
    ['FAMAS', 'burst'],
    ['Knife', undefined],
    ['Flashbang', undefined]
  ]) {
    f.game.weapon.name = name
    f.game.step(11)
    const visible = f.config().touchInputs.filter((button) => !button.hide)
    assert.ok(visible.length <= 5, name)
    const action = visible.find((button) => button.inputAction === A.IA_ACTION_4)
    assert.equal(action?.icon.tex.texture.src, alternate ? `assets/ui/touch/${alternate}.png` : undefined)
  }
  f.game.state.selectedBomb = true
  f.game.step(11.1)
  const visible = f.config().touchInputs.filter((button) => !button.hide)
  assert.equal(visible.length, 3)
  assert.ok(visible.find((button) => button.inputAction === A.IA_ACTION_6).icon.tex.texture.src.endsWith('/bomb.png'))
})

test('menus, death and disconnect hide native actions and cancel a held FIRE until release', async () => {
  for (const gate of ['buy', 'menu', 'options', 'dead', 'disconnect']) {
    const f = fixture()
    await f.event(A.IA_ACTION_6, true, 11)
    const set = (value) => {
      if (gate === 'options') f.game.state.touchOptions.open = value
      else if (gate === 'dead') {
        if (value) f.game.component('Dead').create(512, {})
        else f.game.component('Dead').deleteFrom(512)
      } else if (gate === 'disconnect') f.game.state.synced = !value
      else f.game.state[gate] = value
    }
    set(true)
    f.game.step(11.1)
    assert.ok(
      f.config().touchInputs.every((button) => button.hide),
      gate
    )
    set(false)
    f.game.step(11.2)
    assert.equal(f.game.sent.filter((event) => event.type === 'playerShoot').length, 1, gate)
    await f.event(A.IA_ACTION_6, false, 11.3)
    await f.event(A.IA_ACTION_6, true, 11.4)
    assert.equal(f.game.sent.filter((event) => event.type === 'playerShoot').length, 2, gate)
  }
})

test('native actions remain available after round results, but hide at match end', () => {
  const f = fixture()
  for (const phase of ['won', 'lost', 'draw']) {
    f.game.match.phase = phase
    f.game.step(11)
    assert.ok(
      f.config().touchInputs.some((button) => button.inputAction === A.IA_ACTION_6 && !button.hide),
      phase
    )
  }
  f.game.match.matchOver = true
  f.game.step(12)
  assert.ok(f.config().touchInputs.every((button) => button.hide))
})

test('the native alternate button sends one weapon-mode request and never a shot', async () => {
  const f = fixture()
  f.game.weapon.name = 'M4A1'
  f.game.step(10.1)
  await f.event(A.IA_ACTION_4, true, 11)
  await f.input.frame()
  f.game.step(11.1)
  await f.event(A.IA_ACTION_4, false, 11.2)
  assert.equal(f.game.sent.filter((event) => event.type === 'weaponAlternate').length, 1)
  assert.equal(f.game.sent.filter((event) => event.type === 'playerShoot').length, 0)
})

test('moving away from the bomb cancels held defuse without interrupting FIRE', async () => {
  const f = fixture()
  f.game.state.defuse = 'ready'
  await f.event(A.IA_PRIMARY, true, 11)
  await f.event(A.IA_ACTION_6, true, 11.1)
  assert.equal(f.input.controls.isCombatInputPressed(A.IA_PRIMARY), true)
  f.game.state.defuse = 'none'
  await f.input.frame()
  f.game.step(11.2)
  assert.equal(f.input.controls.isCombatInputPressed(A.IA_PRIMARY), false)
  assert.equal(f.input.controls.isCombatInputPressed(A.IA_ACTION_6), true)
  f.game.state.defuse = 'ready'
  await f.input.frame()
  f.game.step(11.3)
  assert.equal(f.input.controls.isCombatInputPressed(A.IA_PRIMARY), false)
  await f.event(A.IA_PRIMARY, false, 11.4)
  await f.event(A.IA_PRIMARY, true, 11.5)
  assert.equal(f.input.controls.isCombatInputPressed(A.IA_PRIMARY), true)
})
