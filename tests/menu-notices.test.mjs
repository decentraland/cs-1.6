import assert from 'node:assert/strict'
import { test } from 'node:test'
import { touchUI, nodes } from './helpers/touch-ui.mjs'

for (const submenu of [false, true]) {
  test(`desktop buy ${submenu ? 'rifle submenu' : 'categories'} keeps confirmations clear of money and buttons`, () => {
    const elements = []
    const ui = touchUI({ onElement: (kind, props) => elements.push({ kind: kind.name ?? kind, props }) })
    ui.state.mobile = false
    ui.state.buy = true
    const buy = ui.load('buy-ui.tsx')
    const render = (width, height, notice) => {
      elements.length = 0
      return buy.BuyHud({ width, height, notice })
    }
    if (submenu) {
      render(1280, 720)
      const rifles = elements.find((e) => e.kind === 'MenuButton' && e.props.label.includes('RIFLES'))
      assert.ok(rifles)
      rifles.props.action()
    }
    for (const [width, height] of [
      [640, 480],
      [800, 450],
      [1280, 720],
      [1920, 1080]
    ]) {
      render(width, height)
      const before = elements.filter((e) => e.kind === 'MenuButton').map((e) => e.props)
      const tree = render(width, height, 'Bought M4A1.')
      const notices = elements.filter((e) => e.kind === 'MenuText' && e.props.value === 'Bought M4A1.')
      assert.equal(notices.length, 1, 'confirmation is rendered inside the menu')
      const rect = notices[0].props
      const layout = ui.frame.menuLayout(width, height)
      assert.ok(rect.top >= layout.y(73), 'below the title divider')
      assert.ok(rect.top + rect.height <= Math.min(...before.map((b) => b.top)), 'above all controls')
      assert.ok(rect.left >= 0 && rect.left + rect.width <= width)
      const info = elements.find((e) => e.kind === 'MenuInfoPanel').props
      assert.ok(rect.top + rect.height <= layout.y(info.top ?? 116), 'above the money panel')
      const after = elements.filter((e) => e.kind === 'MenuButton').map((e) => e.props)
      assert.deepEqual(
        after.map(({ left, top, width, height }) => ({ left, top, width, height })),
        before.map(({ left, top, width, height }) => ({ left, top, width, height })),
        'notices never move targets'
      )
      const noticeBox = nodes(tree).find((node) => {
        const t = node.props.uiTransform
        return t?.position?.left === rect.left && t?.position?.top === rect.top && t?.height === rect.height
      })
      assert.equal(noticeBox?.props.uiTransform.pointerFilter, 'none', 'notice cannot intercept clicks')
    }
  })
}
