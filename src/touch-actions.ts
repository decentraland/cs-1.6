import { InputAction } from '@dcl/sdk/ecs'
import { profileByName } from './weapon-profiles'

const buttons = [
  InputAction.IA_POINTER,
  InputAction.IA_PRIMARY,
  InputAction.IA_SECONDARY,
  InputAction.IA_JUMP,
  InputAction.IA_ACTION_3,
  InputAction.IA_ACTION_4,
  InputAction.IA_ACTION_5,
  InputAction.IA_ACTION_6
]

export function nativeTouchControls(
  enabled: boolean,
  weapon: { name: string; mode: number } | null | undefined,
  bomb: boolean,
  walking: boolean
) {
  const icons = new Map<InputAction, string>()
  if (enabled && weapon) {
    const profile = profileByName(weapon.name)
    icons.set(InputAction.IA_ACTION_6, bomb ? 'bomb' : profile.kind === 'gun' ? 'fire' : profile.kind)
    icons.set(InputAction.IA_JUMP, 'jump')
    icons.set(InputAction.IA_ACTION_3, walking ? 'walk' : 'run')
    if (!bomb && profile.kind !== 'grenade') {
      icons.set(InputAction.IA_SECONDARY, profile.kind === 'knife' ? 'knife' : 'reload')
      if (profile.kind === 'gun' && profile.alternate) {
        icons.set(
          InputAction.IA_ACTION_4,
          profile.alternate === 'scope'
            ? 'zoom'
            : profile.alternate === 'silencer'
              ? 'silencer'
              : weapon.mode
                ? profile.automatic
                  ? 'auto'
                  : 'single'
                : 'burst'
        )
      }
    }
  }
  return {
    mainAction: InputAction.IA_ACTION_6,
    hideJoystick: false,
    hideCrosshair: true,
    touchInputs: buttons.map((inputAction) => {
      const icon = icons.get(inputAction)
      return {
        inputAction,
        hide: !icon,
        icon: icon ? { tex: { $case: 'texture' as const, texture: { src: `assets/ui/touch/${icon}.png` } } } : undefined
      }
    })
  }
}
