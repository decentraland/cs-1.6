import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeInput, InputAction as A } from './helpers/native-input.mjs'
import { combatClient } from './helpers/combat-client.mjs'
import { touchUI, buttons } from './helpers/touch-ui.mjs'
import { compile } from './compile.mjs'

const load = compile('weapon-profiles')
const { GUNS } = load('weapon-profiles')

function fixture(source = 'ui') {
  const input = nativeInput(),
    ui = touchUI({ controls: input.controls }),
    game = combatClient({ input: input.sdk, controls: input.controls, readyToShoot: true })
  input.state.mobile = game.state.mobile = source !== 'desktop'
  let timestamp = 0
  const bound = new Map()
  function pointerEntity(label) {
    if (bound.has(label)) return bound.get(label)
    const action = label === 'RELOAD' || label === 'STAB' ? A.IA_SECONDARY : A.IA_ACTION_6
    const button = ui.actionButton(label, [action])
    const entity = input.engine.addEntity()
    const data = { entity, opts: { button: A.IA_POINTER, showFeedback: true } }
    input.pointerEvents.onPointerDown(data, button.props.onMouseDown)
    input.pointerEvents.onPointerUp(data, button.props.onMouseUp)
    bound.set(label, entity)
    return entity
  }
  return {
    input,
    ui,
    game,
    shots: () => game.sent.filter((event) => event.type === 'playerShoot'),
    reloads: () => game.sent.filter((event) => event.type === 'playerReload'),
    native(action, down) {
      input.add(input.engine.RootEntity, action, down, ++timestamp)
    },
    press(label, down) {
      const action =
        label === 'RELOAD' || label === 'STAB' ? A.IA_SECONDARY : source === 'desktop' ? A.IA_POINTER : A.IA_ACTION_6
      input.add(
        source === 'ui' ? pointerEntity(label) : input.engine.RootEntity,
        source === 'ui' ? A.IA_POINTER : action,
        down,
        ++timestamp
      )
    },
    tap(label) {
      this.press(label, true)
      this.press(label, false)
    },
    async frame(now) {
      await input.frame()
      game.step(now)
    }
  }
}

test('all 24 firearms preserve short taps through native input and the shared UI hold adapter', async () => {
  for (const source of ['ui', 'native', 'desktop']) {
    for (const gun of Object.values(GUNS)) {
      const f = fixture(source)
      Object.assign(f.game.weapon, {
        name: gun.name,
        fireRate: gun.fireRate,
        ammoClip: gun.clip,
        maxAmmoClip: gun.clip
      })
      await f.frame(10.1)
      f.tap('FIRE')
      await f.frame(12)
      assert.equal(f.shots().length, 1, `${source}: ${gun.name} short tap`)
      await f.frame(14)
      assert.equal(f.shots().length, 1, `${source}: ${gun.name} does not repeat after release`)
      f.tap('FIRE')
      await f.frame(16)
      assert.equal(f.shots().length, 2, `${source}: ${gun.name} second tap`)
    }
  }
})

test('a short RELOAD tap starts when ready and never retries after release', async () => {
  for (const source of ['ui', 'native', 'desktop']) {
    const f = fixture(source)
    await f.frame(10.1)
    f.tap('RELOAD')
    await f.frame(11)
    assert.equal(f.reloads().length, 1, source)
    await f.frame(11.4)
    assert.equal(f.reloads().length, 1, 'released reload never retries')
    f.game.weapon.readyAt = 14
    f.tap('RELOAD')
    await f.frame(12)
    await f.frame(14.1)
    assert.equal(f.reloads().length, 1, 'blocked tap is not queued across weapon draw')
  }
})

test('short knife slash and stab taps attack once instead of disappearing or repeating', async () => {
  const f = fixture()
  f.game.weapon.name = f.ui.state.weapon.name = 'Knife'
  f.tap('SLASH')
  await f.frame(11)
  await f.frame(11.5)
  f.tap('STAB')
  await f.frame(12)
  await f.frame(13.1)
  assert.deepEqual(
    f.game.sent.filter((event) => event.type === 'knifeAttack').map((event) => event.data.attack),
    ['swing', 'stab']
  )
})

test('a short grenade tap pulls the pin then releases the throw for all three grenades', async () => {
  for (const name of ['HE Grenade', 'Flashbang', 'Smoke Grenade']) {
    const f = fixture()
    f.game.weapon.name = f.ui.state.weapon.name = name
    f.game.weapon.ammoReserve = 1
    f.tap('THROW\nHOLD / RELEASE')
    await f.frame(11)
    await f.frame(11.016)
    await f.frame(11.6)
    assert.deepEqual(
      f.game.sent.filter((event) => event.type === 'grenadeUse').map((event) => event.data.held),
      [true, false],
      name
    )
  }
})

test('a short burst-mode tap finishes exactly three rounds after the finger is released', async () => {
  for (const id of ['glock18', 'famas']) {
    const f = fixture()
    Object.assign(f.game.weapon, { name: GUNS[id].name, mode: 1 })
    f.tap('FIRE')
    await f.frame(11)
    await f.frame(11.06)
    await f.frame(11.17)
    await f.frame(11.7)
    assert.equal(f.shots().length, 3, id)
    assert.deepEqual(
      f.shots().map((event) => event.data.burstIndex),
      [0, 1, 2],
      id
    )
  }
})

test('real UI press dispatch and native binding together do not add a second automatic shot after release', async () => {
  const f = fixture()
  f.press('FIRE', true)
  f.native(A.IA_ACTION_6, true)
  await f.frame(11)
  assert.equal(f.shots().length, 1)
  f.press('FIRE', false)
  f.native(A.IA_ACTION_6, false)
  await f.frame(11.2)
  await f.frame(11.4)
  assert.equal(f.shots().length, 1)
})

test('short taps still obey menus, death, round phases, C4 ownership and weapon readiness', async () => {
  const gates = [
    (f) => {
      f.game.state.menu = true
    },
    (f) => {
      f.game.state.buy = true
    },
    (f) => {
      f.game.component('Dead').create(512, {})
    },
    (f) => {
      f.game.match.phase = 'freeze'
    },
    (f) => {
      f.game.match.matchOver = true
    },
    (f) => {
      f.game.state.selectedBomb = true
    },
    (f) => {
      f.game.state.busy = true
    },
    (f) => {
      f.game.weapon.readyAt = 12
    }
  ]
  for (const gate of gates) {
    const f = fixture()
    gate(f)
    f.tap('FIRE')
    await f.frame(11)
    assert.equal(f.shots().length, 0)
    f.game.state.menu = f.game.state.buy = f.game.state.selectedBomb = f.game.state.busy = false
    f.game.match.phase = 'live'
    f.game.match.matchOver = false
    f.game.component('Dead').deleteFrom(512)
    await f.frame(12.1)
    assert.equal(f.shots().length, 0, 'blocked tap does not fire later')
  }
})
