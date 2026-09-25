import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeInput, InputAction as A } from './helpers/native-input.mjs'
import { combatClient } from './helpers/combat-client.mjs'
import { touchUI } from './helpers/touch-ui.mjs'

function fixture() {
  const input = nativeInput()
  const game = combatClient({ input: input.sdk, controls: input.controls, readyToShoot: true, touchContext: true })
  const ui = touchUI({ controls: input.controls })
  let timestamp = 0
  return {
    input,
    game,
    ui,
    button(label) {
      const action = label === 'RELOAD' ? A.IA_SECONDARY : A.IA_ACTION_6
      return {
        onMouseDown: () => input.add(input.engine.RootEntity, action, true, ++timestamp),
        onMouseUp: () => input.add(input.engine.RootEntity, action, false, ++timestamp)
      }
    },
    equip(name) {
      game.weapon.name = ui.state.weapon.name = name
      game.weapon.revision++
    },
    async frame(now) {
      await input.frame()
      game.step(now)
    }
  }
}

test('replaced FIRE and RELOAD buttons cannot leave attacks held on knife, grenade or C4 controls', async () => {
  for (const destination of ['Knife', 'Flashbang', 'C4']) {
    const f = fixture()
    f.button('FIRE').onMouseDown()
    f.button('RELOAD').onMouseDown()
    await f.frame(11)
    if (destination === 'C4') f.game.state.selectedBomb = f.ui.state.selectedBomb = true
    else f.equip(destination)
    await f.frame(11.1)
    assert.equal(f.input.controls.isCombatInputPressed(A.IA_ACTION_6), false, destination + ' old fire')
    assert.equal(f.input.controls.isCombatInputPressed(A.IA_SECONDARY), false, destination + ' old reload')
    const label = destination === 'Knife' ? 'SLASH' : destination === 'C4' ? 'PLANT' : 'THROW\nHOLD / RELEASE'
    f.button(label).onMouseUp()
    await f.frame(11.3)
    assert.equal(f.game.sent.filter((event) => event.type === 'knifeAttack').length, 0)
    assert.equal(f.game.sent.filter((event) => event.type === 'grenadeUse' && event.data.held).length, 0)
    f.button(label).onMouseDown()
    await f.frame(11.5)
    assert.equal(f.input.controls.isCombatInputPressed(A.IA_ACTION_6), true, destination + ' new gesture')
  }
})

test('switching equipment cancels native FIRE, including a late native press', async () => {
  const f = fixture()
  f.input.add(f.input.engine.RootEntity, A.IA_ACTION_6, true, 1)
  await f.frame(11)
  f.equip('Smoke Grenade')
  f.input.add(f.input.engine.RootEntity, A.IA_ACTION_6, true, 2)
  await f.frame(11.1)
  assert.equal(f.input.controls.isCombatInputPressed(A.IA_ACTION_6), false)
  f.input.add(f.input.engine.RootEntity, A.IA_ACTION_6, false, 3)
  await f.frame(11.2)
  f.input.add(f.input.engine.RootEntity, A.IA_ACTION_6, true, 4)
  await f.frame(11.3)
  assert.equal(f.input.controls.isCombatInputPressed(A.IA_ACTION_6), true, 'fresh native gesture rearms')
})

test('gun-to-gun changes retain the same FIRE gesture and release normally', async () => {
  const f = fixture()
  f.button('FIRE').onMouseDown()
  await f.frame(11)
  f.equip('M4A1')
  await f.frame(11.2)
  assert.equal(f.input.controls.isCombatInputPressed(A.IA_ACTION_6), true)
  assert.equal(f.game.sent.filter((event) => event.type === 'playerShoot').length, 2)
  f.button('FIRE').onMouseUp()
  await f.frame(11.4)
  assert.equal(f.input.controls.isCombatInputPressed(A.IA_ACTION_6), false)
  assert.equal(f.game.sent.filter((event) => event.type === 'playerShoot').length, 2)
})

test('C4 to gun and grenade to knife require a fresh press on the replacement control', async () => {
  for (const source of ['C4', 'HE Grenade']) {
    const f = fixture()
    if (source === 'C4') f.game.state.selectedBomb = f.ui.state.selectedBomb = true
    else f.equip(source)
    await f.frame(11)
    f.button(source === 'C4' ? 'PLANT' : 'THROW\nHOLD / RELEASE').onMouseDown()
    await f.frame(11.1)
    f.game.state.selectedBomb = f.ui.state.selectedBomb = false
    f.equip(source === 'C4' ? 'AK-47' : 'Knife')
    await f.frame(11.2)
    assert.equal(f.input.controls.isCombatInputPressed(A.IA_ACTION_6), false, source)
    assert.equal(f.game.sent.filter((event) => event.type === 'knifeAttack' || event.type === 'playerShoot').length, 0)
  }
})
