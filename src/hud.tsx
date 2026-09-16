import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

const amber = Color4.create(1, 160 / 255, 0, 0.8)
const digitX = [0, 23, 47, 70, 95, 119, 144, 169, 192, 216]
type Rect = readonly [number, number, number, number]

function Sprite(props: { key?: string; rect: Rect; left: number; top: number; scale: number; color?: Color4 }) {
  const [x, y, width, height] = props.rect
  const u = x / 256,
    right = (x + width) / 256
  const top = 1 - y / 256,
    bottom = 1 - (y + height) / 256
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
        texture: { src: 'assets/ui/hud.png', filterMode: 'point' },
        textureMode: 'stretch',
        uvs: [u, bottom, u, top, right, top, right, bottom],
        color: props.color ?? amber
      }}
    />
  )
}

function NumberSprites(props: {
  value: number
  places: number
  left: number
  top: number
  scale: number
  padZero?: boolean
  color?: Color4
}) {
  const digits = String(Math.max(0, Math.floor(props.value)))
    .slice(-props.places)
    .padStart(props.places, props.padZero ? '0' : ' ')
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: props.left, top: props.top },
        width: props.places * 20 * props.scale,
        height: 25 * props.scale,
        pointerFilter: 'none'
      }}
    >
      {digits
        .split('')
        .map((digit, index) =>
          digit === ' ' ? null : (
            <Sprite
              key={String(index)}
              rect={[digitX[Number(digit)], 0, 20, 25]}
              left={index * 20 * props.scale}
              top={0}
              scale={props.scale}
              color={props.color}
            />
          )
        )}
    </UiEntity>
  )
}

export function Hud(props: {
  width: number
  height: number
  health: number
  armor: number
  clip: number
  reserve: number
  money: number
  seconds: number
  defuseKit?: boolean
  hideTime?: boolean
  hideAmmo?: boolean
  hideClip?: boolean
  hidePlayerStats?: boolean
  ammoIcon?: Rect
}) {
  const scale = Math.min(1, props.width / 640)
  const y = props.height - 37 * scale
  const armorX = props.width / 5
  const ammoX = props.width - 184 * scale
  const timerX = (props.width - 114 * scale) / 2
  const timerY = props.height - 38 * scale
  const moneyX = props.width - 126 * scale
  const moneyY = props.height - 75 * scale
  const healthColor = props.health <= 25 ? Color4.create(1, 0.1, 0, 1) : amber
  const timerColor = props.seconds < 15 && Math.floor(Date.now() / 300) % 2 === 0 ? Color4.create(1, 0.1, 0, 1) : amber
  const fill = Math.round((Math.min(100, Math.max(0, props.armor)) / 100) * 24)
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
      {props.defuseKit && (
        <Sprite
          rect={[32, 148, 32, 32]}
          left={5 * scale}
          top={props.height / 2 - 37 * scale}
          scale={scale}
          color={Color4.create(0, 160 / 255, 0, 1)}
        />
      )}
      {!props.hidePlayerStats && (
        <UiEntity
          uiTransform={{ positionType: 'absolute', width: props.width, height: props.height, pointerFilter: 'none' }}
        >
          <Sprite rect={[48, 25, 24, 24]} left={12 * scale} top={y} scale={scale} color={healthColor} />
          <NumberSprites value={props.health} places={3} left={34 * scale} top={y} scale={scale} color={healthColor} />
          <Sprite rect={[0, 25, 24, 24]} left={armorX} top={y} scale={scale} />
          {fill > 0 && (
            <Sprite rect={[24, 49 - fill, 24, fill]} left={armorX} top={y + (24 - fill) * scale} scale={scale} />
          )}
          <NumberSprites value={props.armor} places={3} left={armorX + 24 * scale} top={y} scale={scale} />
        </UiEntity>
      )}
      {!props.hideTime && (
        <UiEntity
          uiTransform={{ positionType: 'absolute', width: props.width, height: props.height, pointerFilter: 'none' }}
        >
          <Sprite rect={[144, 72, 24, 24]} left={timerX} top={timerY} scale={scale} color={timerColor} />
          <NumberSprites
            value={Math.floor(props.seconds / 60)}
            places={2}
            left={timerX + 24 * scale}
            top={timerY}
            scale={scale}
            color={timerColor}
          />
          {[6, 18].map((offset) => (
            <UiEntity
              key={String(offset)}
              uiTransform={{
                positionType: 'absolute',
                position: { left: timerX + 69 * scale, top: timerY + offset * scale },
                width: 2 * scale,
                height: 2 * scale,
                pointerFilter: 'none'
              }}
              uiBackground={{ color: timerColor }}
            />
          ))}
          <NumberSprites
            value={props.seconds % 60}
            places={2}
            padZero
            left={timerX + 74 * scale}
            top={timerY}
            scale={scale}
            color={timerColor}
          />
        </UiEntity>
      )}
      {!props.hideAmmo && (
        <UiEntity
          uiTransform={{ positionType: 'absolute', width: props.width, height: props.height, pointerFilter: 'none' }}
        >
          {!props.hideClip && <NumberSprites value={props.clip} places={3} left={ammoX} top={y} scale={scale} />}
          {!props.hideClip && (
            <UiEntity
              uiTransform={{
                positionType: 'absolute',
                position: { left: ammoX + 70 * scale, top: y },
                width: 2 * scale,
                height: 25 * scale,
                pointerFilter: 'none'
              }}
              uiBackground={{ color: amber }}
            />
          )}
          <NumberSprites value={props.reserve} places={3} left={ammoX + 82 * scale} top={y} scale={scale} />
          <Sprite
            rect={props.ammoIcon ?? [72, 72, 24, 24]}
            left={ammoX + 142 * scale}
            top={y - 3 * scale}
            scale={scale}
          />
        </UiEntity>
      )}
      {!props.hidePlayerStats && <Sprite rect={[192, 25, 18, 25]} left={moneyX} top={moneyY} scale={scale} />}
      {!props.hidePlayerStats && (
        <NumberSprites value={props.money} places={5} left={moneyX + 18 * scale} top={moneyY} scale={scale} />
      )}
    </UiEntity>
  )
}
