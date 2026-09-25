import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { adjustNightVision, nightVisionStatus, nightVisionTint, toggleNightVision } from './nightvision-client'
import { NIGHTVISION_ALPHA_MIN, NIGHTVISION_ALPHA_MAX } from './nightvision-rules'
import { isTouchPlatform } from './platform'
import { isBuyMenuVisible } from './buy-client'
import { isTeamMenuOpen } from './menu-state'
import { TouchIcon, touchIconBackground } from './touch-icons'
import { amber } from './menu-ui'

export function NightVisionOverlay({ width, height }: { width: number; height: number }) {
  if (!nightVisionStatus().on) return null
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { left: 0, top: 0 }, width, height, pointerFilter: 'none' }}
      uiBackground={{ color: nightVisionTint() }}
    />
  )
}

export function NightVisionAdjustButton(props: { direction: -1 | 1; left: number; top: number; size: number }) {
  if (!nightVisionStatus().on || isBuyMenuVisible() || isTeamMenuOpen()) return null
  const alpha = Math.round(nightVisionTint().a * 255)
  const enabled = props.direction > 0 ? alpha < NIGHTVISION_ALPHA_MAX : alpha > NIGHTVISION_ALPHA_MIN
  const color = enabled ? amber : Color4.create(1, 1, 1, 0.25)
  return (
    <UiEntity
      key={props.direction > 0 ? 'NIGHTVISION UP' : 'NIGHTVISION DOWN'}
      onMouseDown={() => {
        if (enabled) adjustNightVision(props.direction)
      }}
      uiTransform={{
        positionType: 'absolute',
        position: { left: props.left, top: props.top },
        width: props.size,
        height: props.size,
        pointerFilter: 'block'
      }}
      uiBackground={touchIconBackground('circle', color)}
    >
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: props.size * 0.3, top: props.size * 0.47 },
          width: props.size * 0.4,
          height: props.size * 0.06,
          pointerFilter: 'none'
        }}
        uiBackground={{ color }}
      />
      {props.direction > 0 && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { left: props.size * 0.47, top: props.size * 0.3 },
            width: props.size * 0.06,
            height: props.size * 0.4,
            pointerFilter: 'none'
          }}
          uiBackground={{ color }}
        />
      )}
    </UiEntity>
  )
}

export function NightVisionButton({ width }: { width: number }) {
  const status = nightVisionStatus()
  if (isTouchPlatform() || !status.available || isBuyMenuVisible() || isTeamMenuOpen()) return null
  const color = status.on ? amber : Color4.White()
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', width: '100%', height: '100%', pointerFilter: 'none' }}>
      <NightVisionAdjustButton direction={-1} left={width - 304} top={98} size={48} />
      <NightVisionAdjustButton direction={1} left={width - 248} top={98} size={48} />
      <UiEntity
        onMouseDown={toggleNightVision}
        uiTransform={{
          positionType: 'absolute',
          position: { left: width - 192, top: 98 },
          width: 48,
          height: 48,
          pointerFilter: 'block',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        uiBackground={touchIconBackground('circle', color)}
      >
        <TouchIcon icon="nightvision" size={32} color={color} />
      </UiEntity>
    </UiEntity>
  )
}
