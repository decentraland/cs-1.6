import ReactEcs, { UiEntity, Label } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { myProfile } from '@dcl/sdk/network'
import { getBomb } from './bomb'
import { getPractice } from './practice'
import { hasBombSelected } from './bomb-client'
import { engine, Transform } from '@dcl/sdk/ecs'
import { PlayerTeam } from './components'
import { getLocalPlayerEntity } from './client'
import { inBuyZone } from './buy-zones'

export function BombHud({ width }: { width: number }) {
  const bomb = getBomb()
  if (!getPractice() || !bomb) return null
  const address = myProfile.userId?.toLowerCase()
  const carrying = bomb.carrier === address
  // Key hints only while still in the buy zone; out in the map they just clutter the view.
  const player = getLocalPlayerEntity()
  const feet = Transform.getOrNull(engine.PlayerEntity)?.position
  const hinting = carrying && player !== null && !!feet && inBuyZone(feet, PlayerTeam.getOrNull(player)?.team ?? 0)
  const planting = bomb.phase === 'planting' && carrying
  const defusing = bomb.phase === 'planted' && bomb.defuser === address
  const text = planting
    ? 'Planting the bomb'
    : defusing
      ? 'Defusing the bomb'
      : bomb.phase === 'planted'
        ? 'The bomb has been planted!'
        : bomb.phase === 'defused'
          ? 'The bomb has been defused!'
          : bomb.phase === 'exploded'
            ? 'Target successfully bombed!'
            : hinting
              ? hasBombSelected()
                ? 'C4 — hold fire to plant | 1 Primary | Shift+4 Drop'
                : 'C4   4 Select | Shift+4 Drop'
              : ''
  const amber = Color4.create(1, 160 / 255, 0, 0.85)
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { left: 0, top: '65%' },
        width,
        flexDirection: 'column',
        alignItems: 'center',
        pointerFilter: 'none'
      }}
    >
      {text && <Label value={text} color={amber} fontSize={18} uiTransform={{ width: '100%', height: 32 }} />}
      {(planting || defusing) && (
        <UiEntity uiTransform={{ width: 240, height: 10 }} uiBackground={{ color: Color4.create(0, 0, 0, 0.7) }}>
          <UiEntity
            uiTransform={{ width: Math.round(240 * bomb.progress), height: 10 }}
            uiBackground={{ color: amber }}
          />
        </UiEntity>
      )}
    </UiEntity>
  )
}
