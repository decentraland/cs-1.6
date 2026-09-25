import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { engine, UiCanvasInformation } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import { amber, border, disabled, panel } from './menu-ui'
import { touchBuyLayout } from './touch-layout'
import { TouchIcon } from './touch-icons'

let purchaseSelection: { menu: string; label: string } | undefined

export function clearTouchPurchaseSelection() {
  purchaseSelection = undefined
}

export function touchNoticeText(message: string) {
  return message
    .replace('Press 1 to equip.', 'Tap the rifle icon to equip.')
    .replace('Press 2 to equip.', 'Tap the pistol icon to equip.')
    .replace('Shift+3 to select.', 'Tap the grenade icon to select.')
}

export function TouchMenu(props: {
  width: number
  height: number
  title: string
  funds?: number
  notice?: string
  onClose?: () => void
  rows: readonly {
    detail?: string
    label: string
    purchase?: boolean
    price?: number
    enabled: boolean
    info: readonly string[]
    action: () => void
  }[]
}) {
  if (purchaseSelection?.menu !== props.title) clearTouchPurchaseSelection()
  const selected = props.rows.find((row) => row.purchase && row.label === purchaseSelection?.label)
  const hasPurchases = props.rows.some((row) => row.purchase)
  const layout = touchBuyLayout(
    props.width,
    props.height,
    props.rows.length,
    UiCanvasInformation.getOrNull(engine.RootEntity)?.screenInsetArea,
    hasPurchases
  )
  const size = Math.max(14, 22 * layout.scale)
  const purchaseTop = layout.top + layout.height - layout.margin - layout.footer - layout.purchaseHeight
  const cartSize = Math.max(48, layout.purchaseHeight - 8)
  const purchaseDetail = !selected
    ? ''
    : [
        selected.price === undefined ? (selected.detail ?? '') : `$${selected.price}`,
        selected.enabled
          ? ''
          : selected.price !== undefined && selected.price > (props.funds ?? 0)
            ? 'NOT ENOUGH MONEY'
            : 'OWNED / FULL / UNAVAILABLE'
      ]
        .filter(Boolean)
        .join('   ')
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', width: props.width, height: props.height, pointerFilter: 'none' }}
      uiBackground={{ color: panel }}
    >
      <Label
        value={`${props.title}${props.funds === undefined ? '' : `   $${props.funds}`}`}
        color={amber}
        fontSize={size}
        uiTransform={{
          positionType: 'absolute',
          position: { left: layout.left + layout.margin, top: layout.top },
          width: layout.width - 130 * layout.scale,
          height: layout.header,
          pointerFilter: 'none'
        }}
      />
      {props.onClose && (
        <UiEntity
          key="CLOSE"
          onMouseDown={() => {
            clearTouchPurchaseSelection()
            props.onClose?.()
          }}
          uiTransform={{
            positionType: 'absolute',
            position: { left: layout.left + layout.width - layout.margin - 48, top: layout.top + 4 },
            width: 48,
            height: Math.max(44, layout.header - 8),
            pointerFilter: 'block',
            borderWidth: 1,
            borderColor: amber,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <TouchIcon icon="close" size={28} color={amber} />
        </UiEntity>
      )}
      {props.notice && (
        <Label
          value={touchNoticeText(props.notice)}
          color={amber}
          fontSize={Math.max(12, size * 0.8)}
          textAlign="middle-left"
          uiTransform={{
            positionType: 'absolute',
            position: {
              left: layout.left + layout.margin,
              top: layout.top + layout.height - layout.margin - layout.footer
            },
            width: layout.width - layout.margin * 2,
            height: layout.footer,
            pointerFilter: 'none'
          }}
        />
      )}
      {hasPurchases && (
        <UiEntity
          uiTransform={{ positionType: 'absolute', width: props.width, height: props.height, pointerFilter: 'none' }}
        >
          <Label
            value={selected ? selected.label.replace(/^\d+ /, '') : 'SELECT AN ITEM'}
            color={amber}
            fontSize={size}
            textAlign="middle-left"
            uiTransform={{
              positionType: 'absolute',
              position: { left: layout.left + layout.margin, top: purchaseTop },
              width: layout.width - layout.margin * 2 - cartSize - 12,
              height: layout.purchaseHeight * 0.52,
              pointerFilter: 'none'
            }}
          />
          <Label
            value={purchaseDetail}
            color={selected?.enabled ? amber : disabled}
            fontSize={Math.max(12, size * 0.72)}
            textAlign="middle-left"
            uiTransform={{
              positionType: 'absolute',
              position: { left: layout.left + layout.margin, top: purchaseTop + layout.purchaseHeight * 0.52 },
              width: layout.width - layout.margin * 2 - cartSize - 12,
              height: layout.purchaseHeight * 0.48,
              pointerFilter: 'none'
            }}
          />
          <UiEntity
            key="PURCHASE"
            onMouseDown={() => {
              if (selected?.enabled) selected.action()
            }}
            uiTransform={{
              positionType: 'absolute',
              position: { left: layout.left + layout.width - layout.margin - cartSize, top: purchaseTop },
              width: cartSize,
              height: cartSize,
              pointerFilter: 'block',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: selected?.enabled ? amber : disabled
            }}
            uiBackground={{ color: Color4.create(0, 0, 0, 0.5) }}
          >
            <TouchIcon icon="buy" size={cartSize * 0.6} color={selected?.enabled ? amber : disabled} />
          </UiEntity>
        </UiEntity>
      )}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: layout.left + layout.margin, top: layout.top + layout.header + layout.margin },
          width: layout.width - layout.margin * 2,
          height: layout.viewportHeight,
          overflow: 'scroll',
          pointerFilter: 'block'
        }}
      >
        <UiEntity
          uiTransform={{
            width: layout.width - layout.margin * 2,
            height: layout.contentHeight,
            flexShrink: 0,
            pointerFilter: 'none'
          }}
        >
          {props.rows.map((row, index) => {
            const unavailable =
              row.price !== undefined && row.price > (props.funds ?? 0)
                ? 'NOT ENOUGH MONEY'
                : !row.enabled
                  ? 'OWNED / FULL / UNAVAILABLE'
                  : ''
            const price = row.price === undefined ? '' : `$${row.price}`
            const detail = row.detail ?? [price, unavailable].filter(Boolean).join('   ')
            return (
              <UiEntity
                key={row.label}
                onMouseDown={() => {
                  if (row.purchase) purchaseSelection = { menu: props.title, label: row.label }
                  else if (row.enabled) {
                    clearTouchPurchaseSelection()
                    row.action()
                  }
                }}
                uiTransform={{
                  positionType: 'absolute',
                  position: layout.row(index),
                  width: layout.buttonWidth,
                  height: layout.rowHeight,
                  pointerFilter: 'block',
                  borderWidth: 1,
                  borderColor: row === selected ? amber : border
                }}
                uiBackground={{ color: Color4.create(0, 0, 0, 0.5) }}
              >
                <Label
                  value={row.label.replace(/^\d+ /, '')}
                  fontSize={size}
                  color={row.enabled ? amber : disabled}
                  textAlign="middle-left"
                  uiTransform={{
                    positionType: 'absolute',
                    position: { left: 12 * layout.scale, top: 0 },
                    width: layout.buttonWidth - 24 * layout.scale,
                    height: detail ? layout.rowHeight * 0.58 : layout.rowHeight,
                    pointerFilter: 'none'
                  }}
                />
                {detail && (
                  <Label
                    value={detail}
                    fontSize={Math.max(12, size * 0.72)}
                    color={row.enabled ? amber : Color4.create(0.65, 0.5, 0.3, 1)}
                    textAlign="middle-left"
                    uiTransform={{
                      positionType: 'absolute',
                      position: { left: 12 * layout.scale, top: layout.rowHeight * 0.52 },
                      width: layout.buttonWidth - 24 * layout.scale,
                      height: layout.rowHeight * 0.48,
                      pointerFilter: 'none'
                    }}
                  />
                )}
              </UiEntity>
            )
          })}
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}
