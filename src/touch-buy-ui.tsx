import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { engine, UiCanvasInformation } from '@dcl/sdk/ecs'
import { BitmapText, bitmapTextWidth } from './bitmap-text'
import { amber, border, panel, MenuButton, clearTouchMenuPress } from './menu-ui'
import { touchControlLayout } from './touch-layout'
import { touchNoticeText } from './touch-menu-ui'

let selection: { title: string; label: string } | undefined

export function clearTouchBuySelection() {
  selection = undefined
  clearTouchMenuPress()
}

export function ClassicTouchBuyMenu(props: {
  width: number
  height: number
  title: string
  funds: number
  notice?: string
  onClose: () => void
  rows: readonly {
    label: string
    price?: number
    enabled: boolean
    quickBuy?: boolean
    info: readonly string[]
    action: () => void
  }[]
}) {
  const layout = touchControlLayout(
    props.width,
    props.height,
    UiCanvasInformation.getOrNull(engine.RootEntity)?.screenInsetArea
  )
  const s = layout.scale
  const margin = 12 * s
  const left = layout.left + margin
  const top = layout.top + margin
  const width = layout.width - margin * 2
  const height = layout.height - margin * 2
  const header = 40 * s
  const noticeHeight = 28 * s
  const gap = 6 * s
  const rowHeight = Math.min(52 * s, (height - header - noticeHeight - gap * 8) / 9)
  const pitch = rowHeight + gap
  const listWidth = Math.floor(width * (layout.portrait ? 0.62 : 0.48))
  const infoLeft = left + listWidth + margin
  const infoWidth = width - listWidth - margin
  const list = props.rows.filter((row) => !row.quickBuy)
  const quick = props.rows.filter((row) => row.quickBuy)
  const font =
    [24, 20, 18, 14, 13, 12, 10].find(
      (size) =>
        size <= rowHeight * 0.72 &&
        list.every(
          (row) =>
            bitmapTextWidth(row.label, size) +
              (row.price === undefined ? 0 : bitmapTextWidth(`$${row.price}`, size) + 6) <=
            listWidth - 12
        )
    ) ?? 10
  const selected =
    selection?.title === props.title ? props.rows.find((row) => row.label === selection?.label) : undefined
  const infoTop = top + header + (quick.length ? pitch * quick.length + margin : 0)
  const lines = [
    `MONEY: $${props.funds}`,
    '',
    ...(selected?.info ?? [props.title === 'BUY' ? 'SELECT A CATEGORY' : 'SELECT AN ITEM', '', 'Tap an item to buy.'])
  ]
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', width: props.width, height: props.height, pointerFilter: 'block' }}
      uiBackground={{ color: panel }}
    >
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left, top },
          width: 32 * s,
          height: 32 * s,
          pointerFilter: 'none'
        }}
        uiBackground={{
          texture: { src: 'assets/ui/cs-logo.png', filterMode: 'point' },
          textureMode: 'stretch',
          color: amber
        }}
      />
      <BitmapText
        value={props.title}
        left={left + 40 * s}
        top={top}
        width={width - 92 * s}
        height={32 * s}
        size={font >= 18 ? 24 : 18}
        color={amber}
      />
      <MenuButton
        label="CLOSE"
        left={left + width - 52 * s}
        top={top}
        width={52 * s}
        height={32 * s}
        size={font}
        enabled
        touch
        action={() => {
          clearTouchBuySelection()
          props.onClose()
        }}
      />
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left, top: top + header - gap },
          width,
          height: 1,
          pointerFilter: 'none'
        }}
        uiBackground={{ color: border }}
      />
      {list.map((row, index) => (
        <MenuButton
          key={row.label}
          label={row.label}
          detail={row.price === undefined ? undefined : `$${row.price}`}
          left={left}
          top={top + header + index * pitch}
          width={listWidth}
          height={rowHeight}
          size={font}
          enabled={row.enabled}
          touch
          selected={selected?.label === row.label}
          onPress={() => {
            selection = { title: props.title, label: row.label }
          }}
          action={row.action}
        />
      ))}
      {quick.map((row, index) => (
        <MenuButton
          key={row.label}
          label={row.label}
          left={infoLeft}
          top={top + header + index * pitch}
          width={infoWidth}
          height={rowHeight}
          size={font}
          enabled={row.enabled}
          touch
          selected={selected?.label === row.label}
          onPress={() => {
            selection = { title: props.title, label: row.label }
          }}
          action={row.action}
        />
      ))}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: infoLeft, top: infoTop },
          width: infoWidth,
          height: top + height - noticeHeight - infoTop,
          borderWidth: 1,
          borderColor: border,
          pointerFilter: 'none',
          overflow: 'hidden'
        }}
        uiBackground={{ color: panel }}
      >
        {lines.map((line, index) => (
          <BitmapText
            key={String(index)}
            value={line}
            left={4}
            top={4 + index * (font + 6)}
            width={infoWidth - 8}
            height={font + 6}
            size={font}
            color={amber}
          />
        ))}
      </UiEntity>
      {props.notice && (
        <BitmapText
          value={touchNoticeText(props.notice)}
          left={left}
          top={top + height - noticeHeight}
          width={width}
          height={noticeHeight}
          size={font}
          color={amber}
        />
      )}
    </UiEntity>
  )
}
