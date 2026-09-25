import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

export const TOUCH_ICONS = [
  'fire',
  'reload',
  'jump',
  'walk',
  'run',
  'zoom',
  'burst',
  'single',
  'auto',
  'silencer',
  'rifle',
  'pistol',
  'knife',
  'grenade',
  'bomb',
  'drop',
  'buy',
  'scores',
  'team',
  'defuse',
  'next',
  'previous',
  'close',
  'circle'
] as const
export type TouchIconName = (typeof TOUCH_ICONS)[number] | 'nightvision'

export function touchIconBackground(icon: TouchIconName, color = Color4.White()) {
  if (icon === 'nightvision')
    return { texture: { src: 'assets/ui/nightvision.png' }, textureMode: 'stretch' as const, color }
  const index = TOUCH_ICONS.indexOf(icon),
    x = index % 8,
    y = Math.floor(index / 8)
  const left = x / 8,
    right = (x + 1) / 8,
    top = 1 - y / 3,
    bottom = 1 - (y + 1) / 3
  return {
    texture: { src: 'assets/ui/touch-controls.png' },
    textureMode: 'stretch' as const,
    uvs: [left, bottom, left, top, right, top, right, bottom],
    color
  }
}

export function TouchIcon(props: { icon: TouchIconName; size: number; color: Color4 }) {
  return (
    <UiEntity
      uiTransform={{ width: props.size, height: props.size, pointerFilter: 'none' }}
      uiBackground={touchIconBackground(props.icon, props.color)}
    />
  )
}
