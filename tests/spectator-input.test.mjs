import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { nativeInput, InputAction as A, PointerEventType } from './helpers/native-input.mjs'
import { combatClient } from './helpers/combat-client.mjs'
import { touchUI, buttons } from './helpers/touch-ui.mjs'

const output = buildSync({
  entryPoints: ['src/spectator.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  write: false,
  external: [
    '@dcl/sdk/*',
    './components',
    './client',
    './practice',
    './platform',
    './combat-input',
    './fps-camera',
    './menu-state'
  ]
}).outputFiles[0].text

function fixture(source = 'ui', neutral = false) {
  const input = nativeInput()
  const game = combatClient({ input: input.sdk, controls: input.controls, touchContext: true })
  const ui = touchUI({ controls: input.controls })
  input.state.mobile = game.state.mobile = source !== 'desktop'
  ui.state.dead = ui.state.observing = true
  game.match.roster[0].team = neutral ? 0 : 2
  game.component('Dead').create(512, {})
  const ids = [512, 600, 601, 602, 603]
  for (let index = 0; index < 4; index++) {
    const team = index === 3 ? 1 : 2
    game.component('Bot').create(600 + index, { index, team, name: `Bot ${index}`, health: 100, alive: true })
    game.component('Transform').create(600 + index, { position: { x: index * 10, y: 0, z: 10 } })
    game.match.roster.push({ address: `bot:${index}`, team, connected: true, eligibleRound: 1 })
  }
  const views = []
  const modules = {
    '@dcl/sdk/ecs': {
      engine: {
        PlayerEntity: 1,
        *getEntitiesWith(...components) {
          for (const id of ids)
            if (components.every((component) => component.has(id)))
              yield [id, ...components.map((component) => component.get(id))]
        }
      },
      Transform: game.component('Transform'),
      InputAction: A,
      PointerEventType
    },
    '@dcl/sdk/network': { myProfile: { userId: 'me' } },
    './components': new Proxy({}, { get: (_, name) => game.component(name) }),
    './client': { getLocalPlayerEntity: () => 512 },
    './practice': { getPractice: () => game.match },
    './platform': {
      hasAimControl: () => game.state.mobile || game.state.locked,
      isTouchPlatform: () => game.state.mobile
    },
    './combat-input': input.controls,
    './fps-camera': { setSpectatorView: (...args) => views.push(args) },
    './menu-state': { isTeamMenuOpen: () => game.state.menu }
  }
  const module = { exports: {} }
  runInNewContext(output, {
    module,
    Date: { now: () => game.state.now * 1000 },
    require(name) {
      assert.ok(name in modules, name)
      return modules[name]
    }
  })
  const observer = module.exports
  let timestamp = 0
  const bound = new Map()
  function pointerEntity(label) {
    if (bound.has(label)) return bound.get(label)
    const button = buttons(ui.controls()).find((item) => item.label === label)
    assert.ok(button, label)
    const entity = input.engine.addEntity()
    const options = { entity, opts: { button: A.IA_POINTER, showFeedback: true } }
    input.pointerEvents.onPointerDown(options, button.props.onMouseDown)
    input.pointerEvents.onPointerUp(options, button.props.onMouseUp)
    bound.set(label, entity)
    return entity
  }
  return {
    game,
    input,
    observer,
    views,
    target: () => observer.getSpectatorTarget()?.address,
    press(label, down) {
      if (source === 'ui') input.add(pointerEntity(label), A.IA_POINTER, down, ++timestamp)
      else {
        if (label === 'PREVIOUS') input.add(input.engine.RootEntity, A.IA_MODIFIER, down, ++timestamp)
        const action = label === 'MODE' ? A.IA_JUMP : source === 'desktop' ? A.IA_POINTER : A.IA_ACTION_6
        input.add(input.engine.RootEntity, action, down, ++timestamp)
      }
    },
    tap(label) {
      this.press(label, true)
      this.press(label, false)
    },
    async frame(now) {
      game.state.now = now
      await input.frame()
      game.client.touchControlsSystem()
      observer.spectatorSystem()
    },
    async ready() {
      await this.frame(10)
      await this.frame(13.1)
    }
  }
}

test('short spectator NEXT taps reach the next teammate through SDK callbacks and native/desktop input', async () => {
  for (const source of ['ui', 'native', 'desktop']) {
    const f = fixture(source)
    await f.ready()
    assert.equal(f.target(), 'bot:0')
    f.tap('NEXT')
    await f.frame(14)
    assert.equal(f.target(), 'bot:1', source)
    await f.frame(15)
    assert.equal(f.target(), 'bot:1', 'released tap never repeats')
    f.tap('NEXT')
    await f.frame(16)
    assert.equal(f.target(), 'bot:2')
    f.tap('NEXT')
    await f.frame(17)
    assert.equal(f.target(), 'bot:0', 'wrap excludes the enemy')
  }
})

test('short spectator PREVIOUS retains its reverse modifier after both actions release', async () => {
  for (const source of ['ui', 'native', 'desktop']) {
    const f = fixture(source)
    await f.ready()
    f.tap('PREVIOUS')
    await f.frame(14)
    assert.equal(f.target(), 'bot:2', source)
    f.tap('NEXT')
    await f.frame(15)
    assert.equal(f.target(), 'bot:0', 'the released modifier does not reverse the next tap')
  }
})

test('spectator taps respect switch cooldown without delaying rejected taps', async () => {
  const f = fixture()
  await f.ready()
  f.tap('NEXT')
  await f.frame(14)
  f.tap('NEXT')
  await f.frame(14.1)
  assert.equal(f.target(), 'bot:1')
  await f.frame(14.4)
  assert.equal(f.target(), 'bot:1')
  f.tap('PREVIOUS')
  await f.frame(14.5)
  assert.equal(f.target(), 'bot:0')
})

test('death, menu closure and respawn discard stale spectator input', async () => {
  const f = fixture()
  await f.frame(10)
  f.tap('NEXT')
  await f.frame(11)
  await f.frame(13.1)
  assert.equal(f.target(), 'bot:0', 'death-transition tap is discarded')
  f.game.state.menu = true
  f.tap('PREVIOUS')
  await f.frame(14)
  f.game.state.menu = false
  await f.frame(14.3)
  assert.equal(f.target(), 'bot:0', 'menu tap is discarded')
  f.tap('NEXT')
  await f.frame(15)
  assert.equal(f.target(), 'bot:1', 'fresh input after menu close works')
  f.game.component('Dead').deleteFrom(512)
  f.tap('PREVIOUS')
  await f.frame(16)
  assert.equal(f.observer.isSpectating(), false)
  assert.equal(f.views.at(-1)[0], false, 'respawn releases the spectator view')
})

test('held spectator inputs switch once and require release across menu capture', async () => {
  const f = fixture()
  await f.ready()
  f.press('NEXT', true)
  await f.frame(14)
  await f.frame(15)
  assert.equal(f.target(), 'bot:1')
  f.game.state.menu = true
  await f.frame(16)
  f.game.state.menu = false
  await f.frame(17)
  assert.equal(f.target(), 'bot:1')
  f.press('NEXT', false)
  await f.frame(17.2)
  f.press('PREVIOUS', true)
  await f.frame(18)
  assert.equal(f.target(), 'bot:0')
})

test('a short desktop mode tap toggles neutral roaming once', async () => {
  const f = fixture('desktop', true)
  await f.ready()
  f.tap('MODE')
  await f.frame(14)
  assert.equal(f.observer.getObserverMode(), 'roaming')
  await f.frame(15)
  assert.equal(f.observer.getObserverMode(), 'roaming')
  f.tap('MODE')
  await f.frame(16)
  assert.equal(f.observer.getObserverMode(), 'chase')
})
