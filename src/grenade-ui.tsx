import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { engine } from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { Color4 } from '@dcl/sdk/math'
import { GrenadeFlash } from './components'
import { flashOpacity } from './grenade-rules'

export function GrenadeFade({ width, height }: { width: number; height: number }) {
  const address = myProfile.userId?.toLowerCase(),
    now = Date.now() / 1000
  let opacity = 0
  for (const [, flash] of engine.getEntitiesWith(GrenadeFlash)) {
    if (flash.target === address) opacity = Math.max(opacity, flashOpacity(flash, now))
  }
  return opacity > 0 ? (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { left: 0, top: 0 }, width, height, pointerFilter: 'none' }}
      uiBackground={{ color: Color4.create(1, 1, 1, opacity) }}
    />
  ) : null
}
