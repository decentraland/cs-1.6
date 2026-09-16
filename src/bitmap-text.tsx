import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import fontData from './score-font.json'

type Glyph = number[]
interface BitmapFont {
  height: number
  glyphs: Record<string, Glyph>
}
const atlas: { width: number; height: number; fonts: Record<string, BitmapFont> } = fontData

export function bitmapTextWidth(value: string, size: number) {
  const font = atlas.fonts[String(size)]
  return Array.from(value).reduce((width, character) => width + (font?.glyphs[character]?.[4] ?? size * 0.6), 0)
}

export function scoreFontSize(height: number) {
  return height < 600 ? 12 : height < 768 ? 13 : height < 1024 ? 14 : height < 1200 ? 20 : 24
}

export function BitmapText(props: {
  key?: string
  value: string
  left: number
  top?: number
  width: number
  height: number
  size: number
  color: Color4
  align?: 'left' | 'right'
}) {
  const font = atlas.fonts[String(props.size)]
  const characters = Array.from(props.value)
  if (characters.some((character) => !font.glyphs[character]))
    return (
      <Label
        value={props.value}
        color={props.color}
        fontSize={props.size}
        textWrap="nowrap"
        textAlign={props.align === 'right' ? 'middle-right' : 'middle-left'}
        uiTransform={{
          positionType: 'absolute',
          position: { left: props.left, top: props.top ?? 0 },
          width: props.width,
          height: props.height,
          overflow: 'hidden',
          pointerFilter: 'none'
        }}
      />
    )
  let textWidth = characters.reduce((width, character) => width + font.glyphs[character][4], 0)
  if (textWidth > props.width) {
    const ellipsis = font.glyphs['…'][4]
    while (characters.length && textWidth + ellipsis > props.width) textWidth -= font.glyphs[characters.pop()!][4]
    if (ellipsis <= props.width) {
      characters.push('…')
      textWidth += ellipsis
    }
  }
  let cursor = props.align === 'right' ? Math.max(0, props.width - textWidth) : 0
  const top = Math.floor((props.height - font.height) / 2)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: props.left, top: props.top ?? 0 },
        width: props.width,
        height: props.height,
        pointerFilter: 'none'
      }}
    >
      {characters.map((character, index) => {
        const [x, y, width, height, advance, bearingX, bearingY] = font.glyphs[character]
        const left = Math.round(cursor + bearingX)
        cursor += advance
        const u = x / atlas.width,
          right = (x + width) / atlas.width,
          upper = 1 - y / atlas.height,
          bottom = 1 - (y + height) / atlas.height
        return (
          <UiEntity
            key={String(index)}
            uiTransform={{
              positionType: 'absolute',
              position: { left, top: top + bearingY },
              width,
              height,
              pointerFilter: 'none'
            }}
            uiBackground={{
              texture: { src: 'assets/ui/score-font.png', filterMode: 'point' },
              textureMode: 'stretch',
              uvs: [u, bottom, u, upper, right, upper, right, bottom],
              color: props.color
            }}
          />
        )
      })}
    </UiEntity>
  )
}
