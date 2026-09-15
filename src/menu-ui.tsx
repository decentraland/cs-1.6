import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { BitmapText, scoreFontSize } from './bitmap-text'
import { MenuCursor, pointInRect } from './menu-state'

// Shared ClientScheme.res styling for the 640x480 letterboxed VGUI menus (team menu, buy menu).
export const amber = Color4.create(1, 176 / 255, 0, 1)
export const border = Color4.create(188 / 255, 112 / 255, 0, 0.5)
export const disabled = Color4.create(80 / 255, 48 / 255, 0, 1)
export const panel = Color4.create(0, 0, 0, 200 / 255)
const button = Color4.create(0, 0, 0, 64 / 255)
const selected = Color4.create(1, 176 / 255, 0, 100 / 255)

export interface MenuLayout {
  scale: number
  x: (value: number) => number
  y: (value: number) => number
  size: (value: number) => number
  font: number
  titleFont: number
}

export function menuLayout(width: number, height: number): MenuLayout {
  const scale = Math.min(width / 640, height / 480)
  const originX = (width - 640 * scale) / 2
  const originY = (height - 480 * scale) / 2
  return {
    scale,
    x: (value) => originX + value * scale,
    y: (value) => originY + value * scale,
    size: (value) => value * scale,
    font: height < 480 ? 10 : scoreFontSize(height),
    titleFont: height < 600 ? 14 : 18
  }
}

export interface MenuButtonProps {
  key?: string
  label: string
  detail?: string
  left: number
  top: number
  width: number
  height: number
  size: number
  enabled: boolean
  cursor?: MenuCursor
  action?: () => void
}

export function isMenuButtonHovered(props: MenuButtonProps) {
  return props.enabled && !!props.cursor && pointInRect(props.cursor.x, props.cursor.y, props)
}

// Hover is derived from the pointer position each render: onMouseEnter/Leave arrive too late in the explorer.
export function MenuButton(props: MenuButtonProps) {
  const active = isMenuButtonHovered(props)
  const color = props.enabled ? amber : disabled
  return (
    <UiEntity
      onMouseDown={props.enabled ? props.action : undefined}
      uiTransform={{
        positionType: 'absolute',
        position: { left: props.left, top: props.top },
        width: props.width,
        height: props.height,
        borderWidth: 1,
        borderColor: active ? amber : border
      }}
      uiBackground={{ color: active ? selected : button }}
    >
      <BitmapText
        value={props.label}
        left={6}
        width={props.width - 12}
        height={props.height}
        size={props.size}
        color={color}
      />
      {props.detail !== undefined && (
        <BitmapText
          value={props.detail}
          left={6}
          width={props.width - 12}
          height={props.height}
          size={props.size}
          color={color}
          align="right"
        />
      )}
    </UiEntity>
  )
}

export function MenuFrame(props: {
  width: number
  height: number
  title: string
  layout: MenuLayout
  // Click anywhere that is not a button (backdrop or panel); the buy menu uses it to close.
  onBackdropClick?: () => void
  children?: ReactEcs.JSX.Element | ReactEcs.JSX.Element[]
}) {
  const { x, y, size, titleFont } = props.layout
  return (
    <UiEntity
      onMouseDown={props.onBackdropClick}
      uiTransform={{
        positionType: 'absolute',
        position: { left: 0, top: 0 },
        width: props.width,
        height: props.height,
        pointerFilter: 'block'
      }}
    >
      <UiEntity
        onMouseDown={props.onBackdropClick}
        uiTransform={{
          positionType: 'absolute',
          position: { left: x(20), top: y(20) },
          width: size(600),
          height: size(440),
          borderRadius: size(8),
          pointerFilter: 'block'
        }}
        uiBackground={{ color: panel }}
      />
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: x(26), top: y(20) },
          width: size(32),
          height: size(32),
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
        left={x(76)}
        top={y(22)}
        width={size(500)}
        height={size(48)}
        size={titleFont}
        color={amber}
      />
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: x(20), top: y(72) },
          width: size(600),
          height: 1,
          pointerFilter: 'none'
        }}
        uiBackground={{ color: border }}
      />
      {props.children}
    </UiEntity>
  )
}

// The right-hand panel used for the map briefing and the buy menu item info.
export function MenuInfoPanel(props: { layout: MenuLayout; lines: readonly string[] }) {
  const { x, y, size, font } = props.layout
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: x(244), top: y(116) },
        width: size(316),
        height: size(286),
        borderWidth: 1,
        borderColor: border,
        pointerFilter: 'none'
      }}
      uiBackground={{ color: panel }}
    >
      {props.lines.map((line, index) => (
        <BitmapText
          key={String(index)}
          value={line}
          left={size(4)}
          top={size(3 + index * 14)}
          width={size(306)}
          height={size(14)}
          size={font}
          color={amber}
        />
      ))}
    </UiEntity>
  )
}
