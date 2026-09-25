import assert from 'node:assert/strict'
import { test } from 'node:test'
import { touchUI, buttons, InputAction, nodes } from './helpers/touch-ui.mjs'
import { touchBuyLayout } from '../src/touch-layout.ts'

const overlap = (a, b) =>
  a.position.left < b.position.left + b.width &&
  a.position.left + a.width > b.position.left &&
  a.position.top < b.position.top + b.height &&
  a.position.top + a.height > b.position.top

test('the scene HUD leaves native FIRE alone and keeps weapons on the bottom bar', () => {
  const ui = touchUI()
  const controls = buttons(ui.controls())
  assert.deepEqual(
    controls.map((button) => button.label),
    ['OPTIONS', 'BUY', 'PRIMARY', 'PISTOL', 'KNIFE', 'GRENADE', 'C4']
  )
  for (const button of controls) assert.equal(button.props.uiInputBinding.actions.length, 0)
  assert.equal(ui.load('combat-input.ts').fireInputAction(), InputAction.IA_ACTION_6)
  const primary = controls.find((button) => button.label === 'PRIMARY')
  assert.ok(primary.props.uiTransform.position.top > 390 * 0.75)
  controls.find((button) => button.label === 'BUY').props.onMouseDown()
  controls.find((button) => button.label === 'GRENADE').props.onMouseDown()
  ui.openOptions()
  buttons(ui.controls())
    .find((button) => button.label === 'DROP')
    .props.onMouseDown()
  assert.deepEqual(ui.calls, [['buy'], ['slot', 'grenade'], ['drop']])
  ui.state.mobile = false
  assert.equal(ui.controls(), null)
})

test('buy and equipment controls disappear when unavailable; utilities are tucked into OPTIONS', () => {
  const ui = touchUI()
  ui.state.canBuy = false
  ui.state.bomb.carrier = ''
  ui.state.inventory.items = [{ id: 'usp' }]
  assert.deepEqual(
    buttons(ui.controls()).map((b) => b.label),
    ['OPTIONS', 'PISTOL', 'KNIFE']
  )
  buttons(ui.controls())
    .find((b) => b.label === 'OPTIONS')
    .props.onMouseDown()
  assert.deepEqual(
    buttons(ui.controls()).map((b) => b.label),
    ['OPTIONS', 'SCORES', 'TEAM', 'DROP']
  )
  buttons(ui.controls())
    .find((b) => b.label === 'OPTIONS')
    .props.onMouseDown()
  assert.ok(!buttons(ui.controls()).some((b) => b.label === 'TEAM'))
})

test('defuse and spectator controls keep their independent held actions', () => {
  const ui = touchUI()
  ui.state.bomb.phase = 'planted'
  ui.state.defuse = 'ready'
  const defuse = buttons(ui.controls()).find((b) => b.label === 'DEFUSE\nHOLD')
  assert.deepEqual([...defuse.props.uiInputBinding.actions], [InputAction.IA_PRIMARY])
  ui.state.dead = true
  ui.state.observing = true
  const controls = buttons(ui.controls())
  assert.ok(controls.some((button) => button.label === 'NEXT'))
  assert.ok(controls.some((button) => button.label === 'PREVIOUS'))
  assert.ok(!controls.some((button) => button.label === 'DEFUSE\nHOLD'))
})

test('opening either menu removes every bound control so the renderer releases held actions', () => {
  const ui = touchUI()
  ui.state.buy = true
  assert.equal(ui.controls(), null)
  ui.state.buy = false
  ui.state.teamMenu = true
  assert.equal(ui.controls(), null)
  ui.state.teamMenu = false
  ui.state.stale = true
  assert.ok(buttons(ui.controls()).every((button) => button.props.uiInputBinding.actions.length === 0))
})

test('touch buttons remain separate and inside phone safe areas in portrait and landscape', () => {
  for (const [width, height] of [
    [844, 390],
    [780, 360],
    [390, 844],
    [1280, 720],
    [1600, 720],
    [320, 568],
    [568, 320],
    [1560, 720],
    [720, 1560],
    [2340, 1080]
  ]) {
    const ui = touchUI()
    ui.state.weapon.name = 'AWP'
    ui.state.nightVision = true
    ui.state.nightVisionOn = true
    ui.state.bomb.phase = 'planted'
    ui.state.insets = { left: 12, right: 12, top: 8, bottom: 12 }
    const controls = buttons(ui.controls(width, height)).map((button) => ({
      label: button.label,
      ...button.props.uiTransform
    }))
    for (const control of controls) {
      assert.ok(
        control.position.left >= 12 && control.position.top >= 8,
        `${width}x${height}: ${control.label} starts in safe area`
      )
      assert.ok(
        control.position.left + control.width <= width - 12 && control.position.top + control.height <= height - 12,
        `${width}x${height}: ${control.label} ends in safe area`
      )
      assert.ok(control.width >= 44 && control.height >= 44, `${control.label} tap target`)
    }
    for (let a = 0; a < controls.length; a++)
      for (let b = a + 1; b < controls.length; b++)
        assert.ok(
          !overlap(controls[a], controls[b]),
          `${width}x${height}: ${controls[a].label} overlaps ${controls[b].label}`
        )
  }
})

test('mobile action targets use phone proportions at native canvas sizes and preserve the center for aiming', () => {
  for (const [width, height, insets, minimum] of [
    [780, 360, { left: 12, right: 12, top: 8, bottom: 12 }, 56, 96],
    [390, 844, { left: 12, right: 12, top: 8, bottom: 12 }, 56, 96],
    [1560, 720, { left: 108, right: 108, top: 32, bottom: 45 }, 100, 170],
    [1280, 720, { left: 108, right: 108, top: 32, bottom: 45 }, 90, 150],
    [720, 1560, { left: 108, right: 108, top: 32, bottom: 45 }, 84, 144],
    [2340, 1080, { left: 162, right: 162, top: 48, bottom: 67.5 }, 150, 255]
  ]) {
    const ui = touchUI()
    ui.state.weapon.name = 'AWP'
    ui.state.nightVision = ui.state.nightVisionOn = true
    ui.state.bomb.phase = 'planted'
    ui.state.insets = insets
    const controls = buttons(ui.controls(width, height)).map((button) => ({
      label: button.label,
      ...button.props.uiTransform
    }))
    for (const control of controls) {
      assert.ok(control.width >= minimum && control.height >= minimum, `${width}x${height}: ${control.label} too small`)
      assert.ok(control.position.left >= insets.left && control.position.top >= insets.top)
      assert.ok(control.position.left + control.width <= width - insets.right + 1e-6)
      assert.ok(control.position.top + control.height <= height - insets.bottom + 1e-6)
      assert.ok(
        !overlap(control, { position: { left: width / 2 - 20, top: height / 2 - 20 }, width: 40, height: 40 }),
        `${control.label} covers aim`
      )
    }
    for (let a = 0; a < controls.length; a++)
      for (let b = a + 1; b < controls.length; b++)
        assert.ok(
          !overlap(controls[a], controls[b]),
          `${width}x${height}: ${controls[a].label} overlaps ${controls[b].label}`
        )
  }
})

test('mobile buy rows remain large, scroll when needed, show prices and ignore disabled taps', () => {
  const ui = touchUI()
  let bought = 0,
    closed = 0
  const props = {
    width: 844,
    height: 390,
    title: 'BUY',
    funds: 800,
    onClose: () => closed++,
    rows: [
      { label: '1 AK-47', purchase: true, price: 2500, enabled: false, info: [], action: () => bought++ },
      { label: '2 KEVLAR', purchase: true, price: 650, enabled: true, info: [], action: () => bought++ }
    ]
  }
  const tree = ui.menu.TouchMenu(props)
  const labels = nodes(tree)
    .filter((node) => node.kind === 'Label')
    .map((node) => node.props.value)
  assert.ok(labels.includes('$2500   NOT ENOUGH MONEY'))
  const controls = buttons(tree)
  controls.find((button) => button.label === 'AK-47').props.onMouseDown()
  assert.equal(bought, 0)
  assert.equal(closed, 0)
  controls.find((button) => button.label === 'KEVLAR').props.onMouseDown()
  assert.equal(bought, 0)
  buttons(ui.menu.TouchMenu(props))
    .find((button) => button.label === 'PURCHASE')
    .props.onMouseDown()
  assert.equal(bought, 1)
  controls.find((button) => button.label === 'CLOSE').props.onMouseDown()
  assert.equal(closed, 1)
  const portrait = touchBuyLayout(390, 360, 10)
  assert.ok(portrait.rowHeight >= 48)
  assert.ok(portrait.contentHeight > portrait.viewportHeight)
})

test('clicking a disabled desktop buy item cannot close the menu through the backdrop', () => {
  const ui = touchUI()
  let closed = 0,
    purchased = 0
  const frame = ui.frame.MenuFrame({
    width: 1280,
    height: 720,
    title: 'BUY',
    layout: ui.frame.menuLayout(1280, 720),
    onBackdropClick: () => closed++
  })
  const disabled = ui.frame.MenuButton({
    label: 'AK-47',
    left: 0,
    top: 0,
    width: 200,
    height: 30,
    size: 14,
    enabled: false,
    action: () => purchased++
  })
  frame.props.onMouseDown()
  disabled.props.onMouseDown?.()
  ui.state.now += 0.2
  ui.frame.menuClickSystem()
  assert.equal(closed, 0)
  assert.equal(purchased, 0)
})

test('mobile menu notices stay below the scroll area without moving rows and use touch hints', () => {
  for (const [width, height] of [
    [780, 360],
    [844, 390],
    [390, 844],
    [1280, 720]
  ]) {
    const ui = touchUI()
    ui.state.insets = { left: 12, right: 12, top: 8, bottom: 12 }
    let purchases = 0
    const props = {
      width,
      height,
      title: 'BUY',
      funds: 16000,
      rows: Array.from({ length: 10 }, (_, index) => ({
        label: `${index + 1} ITEM`,
        price: 200,
        purchase: true,
        enabled: true,
        info: [],
        action: () => purchases++
      }))
    }
    buttons(ui.menu.TouchMenu(props))
      .find((row) => row.props.key === '1 ITEM')
      .props.onMouseDown()
    const before = buttons(ui.menu.TouchMenu(props)).map((row) => row.props.uiTransform)
    for (const [message, expected] of [
      ['Bought M4A1.', 'Bought M4A1.'],
      ['Bought USP. Press 2 to equip.', 'Bought USP. Tap the pistol icon to equip.'],
      ['Bought MP5. Press 1 to equip.', 'Bought MP5. Tap the rifle icon to equip.'],
      ['Grenade purchased. Shift+3 to select.', 'Grenade purchased. Tap the grenade icon to select.'],
      ['You must be in your buy zone.', 'You must be in your buy zone.']
    ]) {
      const tree = ui.menu.TouchMenu({ ...props, notice: message })
      const notice = nodes(tree).find((node) => node.kind === 'Label' && node.props.value === expected)
      assert.ok(notice, `${width}x${height}: ${expected}`)
      const rect = notice.props.uiTransform
      const scroll = nodes(tree).find((node) => node.props.uiTransform?.overflow === 'scroll').props.uiTransform
      assert.ok(rect.position.top + 1e-6 >= scroll.position.top + scroll.height)
      assert.ok(rect.position.left >= 12 && rect.position.left + rect.width <= width - 12)
      assert.ok(rect.position.top + rect.height <= height - 12)
      assert.equal(rect.pointerFilter, 'none')
      const rows = buttons(tree)
      assert.deepEqual(
        rows.map((row) => row.props.uiTransform),
        before,
        'notices cannot move a button under a held finger'
      )
      rows.find((row) => row.label === 'PURCHASE').props.onMouseDown()
    }
    assert.equal(purchases, 5)
  }
})

test('defuse appears only near the bomb and turns green only when usable', () => {
  const ui = touchUI()
  ui.state.bomb.phase = 'planted'
  const defuse = () => buttons(ui.controls()).find((button) => button.label === 'DEFUSE\nHOLD')
  assert.equal(defuse(), undefined)
  ui.state.defuse = 'near'
  assert.equal(defuse().props.uiBackground.color.r, 1)
  ui.state.defuse = 'ready'
  assert.equal(defuse().props.uiBackground.color.g, 1)
  assert.equal(defuse().props.uiBackground.color.r, 0.2)
  ui.state.defuse = 'none'
  assert.equal(defuse(), undefined)
})
