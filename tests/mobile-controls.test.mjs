import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { nativeInput, InputAction as A } from './helpers/native-input.mjs'
import { combatClient } from './helpers/combat-client.mjs'
import { touchUI, buttons, nodes } from './helpers/touch-ui.mjs'
import { compile } from './compile.mjs'

function fireFixture() {
  const input = nativeInput(),
    ui = touchUI({ controls: input.controls })
  const game = combatClient({ input: input.sdk, controls: input.controls, readyToShoot: true })
  const control = (name) => ui.actionButton(name, [A.IA_ACTION_6])
  return { input, ui, game, control, shots: () => game.sent.filter((event) => event.type === 'playerShoot') }
}

test('mobile FIRE starts and stops actual client shots with only UI callbacks and no native binding events', async () => {
  const f = fireFixture(),
    fire = f.control('FIRE')
  fire.props.onMouseDown?.()
  await f.input.frame()
  f.game.step(11)
  f.game.step(11.1)
  f.game.step(11.2)
  assert.equal(f.shots().length, 3)
  fire.props.onMouseUp()
  await f.input.frame()
  f.game.step(11.3)
  assert.equal(f.shots().length, 3)
  assert.equal(f.game.sent.filter((event) => event.type === 'playerTrigger').at(-1).data.held, false)
})

test('leaving an untouched FIRE button does not disable native firing', async () => {
  const f = fireFixture()
  f.control('FIRE').props.onMouseLeave()
  f.input.add(f.input.engine.RootEntity, A.IA_ACTION_6, true, 1)
  await f.input.frame()
  f.game.step(11)
  assert.equal(f.shots().length, 1)
  f.input.add(f.input.engine.RootEntity, A.IA_ACTION_6, false, 2)
  await f.input.frame()
  f.game.step(11.1)
  assert.equal(f.shots().length, 1)
})

test('native FIRE can start a new gesture after a callback-controlled gesture ends', async () => {
  for (const nativeReleaseFirst of [false, true]) {
    const f = fireFixture(),
      fire = f.control('FIRE')
    fire.props.onMouseDown()
    f.input.add(f.input.engine.RootEntity, A.IA_ACTION_6, true, 1)
    await f.input.frame()
    f.game.step(11)
    if (!nativeReleaseFirst) fire.props.onMouseUp()
    f.input.add(f.input.engine.RootEntity, A.IA_ACTION_6, false, 2)
    await f.input.frame()
    if (nativeReleaseFirst) fire.props.onMouseUp()
    f.game.step(11.1)
    assert.equal(f.shots().length, 1, 'first gesture released')
    f.input.add(f.input.engine.RootEntity, A.IA_ACTION_6, true, 3)
    await f.input.frame()
    f.game.step(11.2)
    f.game.step(11.3)
    assert.equal(f.shots().length, 3, 'new native press fires without a UI callback')
    f.input.add(f.input.engine.RootEntity, A.IA_ACTION_6, false, 4)
    await f.input.frame()
    f.game.step(11.4)
    assert.equal(f.shots().length, 3, 'native release stops firing')
  }
})

test('shared UI hold adapter keeps independent sources and ignores stale native input', async () => {
  const f = fireFixture(),
    left = f.control('FIRE LEFT'),
    right = f.control('FIRE')
  left.props.onMouseDown()
  right.props.onMouseDown()
  f.input.add(f.input.engine.RootEntity, A.IA_ACTION_6, true, 1)
  await f.input.frame()
  f.game.step(11)
  left.props.onMouseUp()
  f.input.add(f.input.engine.RootEntity, A.IA_ACTION_6, false, 2)
  await f.input.frame()
  f.game.step(11.1)
  assert.equal(f.shots().length, 2, 'other finger remains held')
  f.input.add(f.input.engine.RootEntity, A.IA_ACTION_6, true, 3)
  await f.input.frame()
  right.props.onMouseLeave()
  f.game.step(11.2)
  assert.equal(f.shots().length, 2, 'sliding off releases even if binding remains down')
})

test('menu/death/round transitions cancel touch fire until a new press', async () => {
  const f = fireFixture(),
    fire = f.control('FIRE')
  f.input.controls.updateTouchControlContext('round1:alive:live')
  fire.props.onMouseDown()
  await f.input.frame()
  f.game.step(11)
  f.input.controls.updateTouchControlContext('round1:alive:menu')
  f.input.controls.updateTouchControlContext('round1:alive:live')
  f.input.add(f.input.engine.RootEntity, A.IA_ACTION_6, true, 1)
  await f.input.frame()
  f.game.step(11.1)
  assert.equal(f.shots().length, 1)
  fire.props.onMouseDown()
  f.game.step(11.2)
  assert.equal(f.shots().length, 2)
  f.input.controls.updateTouchControlContext('round1:dead:live')
  f.game.step(11.3)
  assert.equal(f.shots().length, 2)
  f.input.controls.updateTouchControlContext('round2:alive:live')
  f.game.step(12)
  assert.equal(f.shots().length, 2)
})

test('native FIRE rearms after release across a menu transition without resuming a stale hold', async () => {
  const f = fireFixture()
  f.input.controls.updateTouchControlContext('live')
  f.control('FIRE').props.onMouseDown()
  f.input.add(f.input.engine.RootEntity, A.IA_ACTION_6, true, 1)
  await f.input.frame()
  f.game.step(11)
  f.input.controls.updateTouchControlContext('menu')
  f.input.controls.updateTouchControlContext('live')
  f.input.add(f.input.engine.RootEntity, A.IA_ACTION_6, true, 2)
  await f.input.frame()
  f.game.step(11.1)
  assert.equal(f.shots().length, 1, 'stale native hold stays cancelled')
  f.input.add(f.input.engine.RootEntity, A.IA_ACTION_6, false, 3)
  await f.input.frame()
  f.input.add(f.input.engine.RootEntity, A.IA_ACTION_6, true, 4)
  await f.input.frame()
  f.game.step(11.2)
  assert.equal(f.shots().length, 2, 'new native gesture works after release')
})

test('utility and weapon taps never bind FIRE', () => {
  const f = fireFixture()
  for (const control of buttons(f.ui.controls())) {
    assert.ok(!control.props.uiInputBinding.actions.includes(A.IA_ACTION_6), control.label)
  }
  for (const name of ['BUY', 'PRIMARY', 'GRENADE'])
    buttons(f.ui.controls())
      .find((button) => button.label === name)
      .props.onMouseDown()
  assert.equal(f.input.controls.isCombatInputPressed(A.IA_ACTION_6), false)
  assert.equal(nodes(f.ui.controls()).filter((node) => node.kind === 'Label').length, 0)
})

const load = compile('touch-movement')
const movementSource = buildSync({
  entryPoints: ['src/locomotion.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  external: [
    '@dcl/sdk/*',
    './cs-movement',
    './buy-client',
    './menu-state',
    './platform',
    './combat-input',
    './practice',
    './client',
    './bomb-client',
    './components',
    './touch-movement'
  ]
}).outputFiles[0].text

test('latched walk changes real locomotion speed, survives menus, and leaves desktop hold behavior intact', () => {
  const movement = load('touch-movement'),
    state = { mobile: true, menu: false, shift: false, phase: 'live', matchOver: false }
  const settings = [],
    speeds = [],
    module = { exports: {} }
  const modules = {
    '@dcl/sdk/ecs': {
      engine: { PlayerEntity: 1 },
      InputAction: A,
      AvatarLocomotionSettings: { createOrReplace: (_, value) => settings.push(value) },
      InputModifier: { createOrReplace() {} }
    },
    './cs-movement': { updateCsMovement: (speed) => speeds.push(speed) },
    './buy-client': { isBuyMenuVisible: () => state.menu },
    './menu-state': { isTeamMenuOpen: () => false },
    './platform': { isTouchPlatform: () => state.mobile },
    './combat-input': { isCombatInputPressed: () => state.shift },
    './practice': { getPractice: () => state },
    './client': { getLocalPlayerEntity: () => 512 },
    './bomb-client': { hasBombSelected: () => false, isLocalBombBusy: () => false },
    './components': { Dead: { has: () => false }, Weapon: { getOrNull: () => ({ name: 'AK-47' }) } },
    './touch-movement': movement
  }
  runInNewContext(movementSource, {
    module,
    require: (name) => {
      assert.ok(modules[name], name)
      return modules[name]
    }
  })
  const locomotion = module.exports
  locomotion.locomotionSystem()
  const running = settings.at(-1).jogSpeed
  movement.toggleTouchWalking()
  locomotion.locomotionSystem()
  assert.equal(settings.at(-1).jogSpeed, running * 0.52)
  for (let frame = 0; frame < 5; frame++) locomotion.locomotionSystem()
  assert.equal(speeds.at(-1), running * 0.52)
  state.menu = true
  locomotion.locomotionSystem()
  assert.equal(speeds.at(-1), 0)
  state.menu = false
  locomotion.locomotionSystem()
  assert.equal(speeds.at(-1), running * 0.52)
  movement.toggleTouchWalking()
  locomotion.locomotionSystem()
  assert.equal(speeds.at(-1), running)
  for (const phase of ['won', 'lost', 'draw']) {
    state.phase = phase
    locomotion.locomotionSystem()
    assert.equal(speeds.at(-1), running, phase)
  }
  state.matchOver = true
  locomotion.locomotionSystem()
  assert.equal(speeds.at(-1), 0)
  state.matchOver = false
  state.phase = 'freeze'
  locomotion.locomotionSystem()
  assert.equal(speeds.at(-1), 0)
  state.mobile = false
  state.shift = true
  assert.equal(locomotion.isWalking(), true)
  state.shift = false
  assert.equal(locomotion.isWalking(), false)
})
