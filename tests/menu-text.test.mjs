import assert from 'node:assert/strict'
import { test } from 'node:test'
import { touchUI, buttons, nodes } from './helpers/touch-ui.mjs'

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} buy menu renders real text without depending on font or logo images`, () => {
    const ui = touchUI()
    ui.state.mobile = mobile
    ui.state.buy = true
    const buy = ui.load('buy-ui.tsx')
    const render = () => buy.BuyHud({ width: 1280, height: 720, notice: 'Purchase ready.' })
    const verify = (tree, expected) => {
      const labels = nodes(tree).filter((node) => node.kind === 'Label')
      for (const value of expected) {
        const label = labels.find((node) => node.props.value === value)
        assert.ok(label, `${value} is a native text label`)
        assert.equal(label.props.uiTransform.pointerFilter, 'none')
      }
      assert.ok(!nodes(tree).some((node) => node.props.uiBackground?.texture), 'menu needs no image downloads')
    }
    const tree = render()
    verify(tree, ['BUY', '1 PISTOLS', '4 RIFLES', 'AUTO BUY', 'REBUY', 'Purchase ready.'])
    const rifles = buttons(tree).find((button) => button.label === 'RIFLES')
    assert.ok(rifles)
    rifles.props.onMouseDown()
    if (mobile) rifles.props.onMouseUp()
    verify(render(), [mobile ? 'BUY / RIFLES' : 'BUY', '$3100', 'Purchase ready.'])
    ui.state.money = 100
    const disabledRow = buttons(render()).find((button) => button.label === 'M4A1')
    assert.ok(disabledRow)
    const rowText = (row) => nodes(row).filter((node) => node.kind === 'Label')
    for (const label of rowText(disabledRow)) assert.deepEqual(label.props.color, ui.frame.disabled)
    disabledRow.props.onMouseDown()
    if (mobile) disabledRow.props.onMouseUp()
    assert.deepEqual(ui.calls, [], 'disabled rows cannot buy or close the menu')
    ui.state.money = 16000
    const enabledRow = buttons(render()).find((button) => button.label === 'M4A1')
    assert.ok(enabledRow)
    for (const label of rowText(enabledRow)) assert.deepEqual(label.props.color, ui.frame.amber)
  })
}
