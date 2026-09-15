import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import type { PainDirections } from './damage-feedback'

type Rect = readonly [number, number, number, number]
const frames: Record<keyof PainDirections, { rect: Rect; x: number; y: number }> = {
  front: { rect: [0, 0, 128, 48], x: -64, y: -144 },
  right: { rect: [128, 0, 48, 128], x: 96, y: -64 },
  rear: { rect: [176, 0, 128, 48], x: -64, y: 96 },
  left: { rect: [304, 0, 48, 128], x: -144, y: -64 }
}

function PainSprite(props: { rect: Rect; left: number; top: number; scale: number; color: Color4 }) {
  const [x, y, width, height] = props.rect
  const u = x / 352,
    right = (x + width) / 352
  const top = 1 - y / 128,
    bottom = 1 - (y + height) / 128
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: props.left, top: props.top },
        width: width * props.scale,
        height: height * props.scale,
        pointerFilter: 'none'
      }}
      uiBackground={{
        texture: { src: 'assets/ui/pain.png', filterMode: 'point' },
        textureMode: 'stretch',
        uvs: [u, bottom, u, top, right, top, right, bottom],
        color: props.color
      }}
    />
  )
}

export function PainCompass(props: {
  width: number
  height: number
  health: number
  directions?: PainDirections | null
}) {
  const directions = props.directions
  if (!directions) return null
  const scale = Math.min(1, props.width / 640)
  const color = props.health > 25 ? { r: 1, g: 160 / 255, b: 0 } : { r: 250 / 255, g: 0, b: 0 }
  return (
    <UiEntity
      uiTransform={{
        width: props.width,
        height: props.height,
        positionType: 'absolute',
        position: { left: 0, top: 0 },
        pointerFilter: 'none'
      }}
    >
      {(Object.keys(frames) as (keyof PainDirections)[]).map((direction) => {
        const strength = directions[direction]
        const frame = frames[direction]
        return strength > 0.4 ? (
          <PainSprite
            rect={frame.rect}
            left={props.width / 2 + frame.x * scale}
            top={props.height / 2 + frame.y * scale}
            scale={scale}
            color={Color4.create(color.r, color.g, color.b, Math.max(strength, 0.5))}
          />
        ) : null
      })}
    </UiEntity>
  )
}
