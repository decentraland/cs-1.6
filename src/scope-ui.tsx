import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

export function ScopeHud({ width, height }: { width: number; height: number }) {
  const size = Math.min(width, height),
    left = (width - size) / 2,
    top = (height - size) / 2
  const black = Color4.Black()
  return (
    <UiEntity
      uiTransform={{ width, height, positionType: 'absolute', position: { left: 0, top: 0 }, pointerFilter: 'none' }}
    >
      {[
        { left: 0, top: 0, width: left, height },
        { left: left + size, top: 0, width: left, height },
        { left, top: 0, width: size, height: top },
        { left, top: top + size, width: size, height: top }
      ].map((rect, index) => (
        <UiEntity
          key={String(index)}
          uiTransform={{
            positionType: 'absolute',
            position: { left: rect.left, top: rect.top },
            width: rect.width,
            height: rect.height,
            pointerFilter: 'none'
          }}
          uiBackground={{ color: black }}
        />
      ))}
      {['scope_arc_nw', 'scope_arc_ne', 'scope_arc_sw', 'scope_arc'].map((name, index) => (
        <UiEntity
          key={name}
          uiTransform={{
            width: size / 2,
            height: size / 2,
            positionType: 'absolute',
            position: { left: left + ((index % 2) * size) / 2, top: top + (Math.floor(index / 2) * size) / 2 },
            pointerFilter: 'none'
          }}
          uiBackground={{ texture: { src: `assets/ui/${name}.png` }, textureMode: 'stretch' }}
        />
      ))}
      <UiEntity
        uiTransform={{
          width: size,
          height: size,
          positionType: 'absolute',
          position: { left, top },
          pointerFilter: 'none'
        }}
        uiBackground={{ texture: { src: 'assets/ui/sniper-scope.png', filterMode: 'point' }, textureMode: 'stretch' }}
      />
    </UiEntity>
  )
}
