import assert from 'node:assert/strict'
import { test } from 'node:test'
import { touchUI, buttons, nodes } from './helpers/touch-ui.mjs'

function fixture() {
  const ui = touchUI()
  ui.state.buy = true
  const buy = ui.load('buy-ui.tsx')
  const render = (width = 844, height = 390, notice) => buy.BuyHud({ width, height, notice })
  const row = (name) => {
    const button = buttons(render()).find((item) => item.label === name)
    assert.ok(button, name)
    return button.props
  }
  const tap = (name) => {
    row(name).onMouseDown()
    row(name).onMouseUp()
  }
  return { ui, buy, render, row, tap }
}

test('mobile buys use the same numbered category order as desktop and one completed tap purchases', () => {
  const f = fixture()
  assert.deepEqual(
    buttons(f.render()).map((b) => b.props.key),
    [
      'CLOSE',
      '1 PISTOLS',
      '2 SHOTGUNS',
      '3 SUB-MACHINE GUNS',
      '4 RIFLES',
      '5 MACHINE GUN',
      '6 PRIMARY AMMO',
      '7 SECONDARY AMMO',
      '8 EQUIPMENT',
      '0 CANCEL',
      'AUTO BUY',
      'REBUY'
    ]
  )
  f.tap('RIFLES')
  const before = f.row('M4A1').uiBackground.color
  f.row('M4A1').onMouseDown()
  assert.notDeepEqual(f.row('M4A1').uiBackground.color, before, 'selected row uses desktop highlight')
  assert.equal(f.ui.calls.length, 0, 'press alone cannot purchase')
  f.row('M4A1').onMouseUp()
  assert.deepEqual(f.ui.calls, [['purchase', 'weapon:m4a1']])
  assert.ok(!buttons(f.render()).some((b) => b.label === 'PURCHASE'))
})

test('sliding off or releasing over another item cancels the purchase', () => {
  const f = fixture()
  f.tap('RIFLES')
  f.row('M4A1').onMouseDown()
  f.row('M4A1').onMouseLeave()
  f.row('M4A1').onMouseUp()
  f.row('AUG').onMouseUp()
  assert.equal(f.ui.calls.length, 0)
  f.tap('SCOUT')
  assert.deepEqual(f.ui.calls, [['purchase', 'weapon:scout']])
})

test('release rechecks funds and ownership; disabled purchases do not close the menu', () => {
  const f = fixture()
  f.tap('RIFLES')
  f.row('M4A1').onMouseDown()
  f.ui.state.money = 100
  f.row('M4A1').onMouseUp()
  assert.equal(f.ui.calls.length, 0)
  f.ui.state.money = 16000
  f.row('M4A1').onMouseDown()
  f.ui.state.inventory.items.push({ id: 'm4a1' })
  f.row('M4A1').onMouseUp()
  f.tap('BACK')
  f.tap('EQUIPMENT')
  f.tap('TACTICAL SHIELD')
  assert.equal(f.ui.calls.length, 0)
})

test('closing the menu cannot carry a pressed item into the next opening', () => {
  const f = fixture()
  f.tap('RIFLES')
  f.row('M4A1').onMouseDown()
  f.ui.state.buy = false
  f.buy.buyMenuInputSystem()
  f.ui.state.buy = true
  f.tap('RIFLES')
  f.row('M4A1').onMouseUp()
  assert.equal(f.ui.calls.length, 0)
  f.tap('CLOSE')
  assert.deepEqual(f.ui.calls, [['closeBuy']])
})

test('classic lists fit safe areas without scrolling or moving controls when notices appear', () => {
  const f = fixture()
  f.ui.state.insets = { left: 12, right: 12, top: 8, bottom: 12 }
  for (const category of [undefined, 'RIFLES', 'EQUIPMENT']) {
    if (category) f.tap(category)
    for (const [width, height] of [
      [780, 360],
      [844, 390],
      [390, 844],
      [320, 568],
      [1280, 720],
      [1600, 720]
    ]) {
      const before = buttons(f.render(width, height)).map((b) => b.props.uiTransform)
      const tree = f.render(width, height, 'Bought M4A1.')
      assert.ok(!nodes(tree).some((n) => n.props.uiTransform?.overflow === 'scroll'))
      const rects = buttons(tree).map((b) => b.props.uiTransform)
      assert.deepEqual(rects, before)
      for (const rect of rects) {
        assert.ok(rect.width >= 40 && rect.height >= 20, `${width}x${height}: readable row`)
        assert.ok(rect.position.left >= 12 && rect.position.left + rect.width <= width - 12 + 1e-6)
        assert.ok(rect.position.top >= 8 && rect.position.top + rect.height <= height - 12 + 1e-6)
      }
    }
    if (category) f.tap('BACK')
  }
})
