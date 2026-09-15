import { engine, AvatarLocomotionSettings, InputModifier, inputSystem, InputAction } from '@dcl/sdk/ecs'
import { getPractice } from './practice'
import { getLocalPlayerEntity } from './client'
import { isLocalBombBusy } from './bomb-client'
import { profileByName } from './weapon-profiles'
import { Dead, Weapon } from './components'

// Initial scale calibration: a 72-unit standing hull corresponds to 1.8 metres.
export const METRES_PER_CS_UNIT = 0.025
export const AK_RUN_SPEED = 221 * METRES_PER_CS_UNIT
export const CS_JUMP_HEIGHT = 45 * METRES_PER_CS_UNIT
let previous = ''

export function isWalking() {
  return inputSystem.isPressed(InputAction.IA_MODIFIER) || inputSystem.isPressed(InputAction.IA_WALK)
}

export function locomotionSystem() {
  const player = getLocalPlayerEntity()
  const phase = getPractice()?.phase
  const frozen = phase !== 'live' || player === null || Dead.has(player) || isLocalBombBusy()
  const walking = isWalking()
  const gunSpeed = profileByName(player === null ? 'AK-47' : (Weapon.getOrNull(player)?.name ?? 'AK-47')).speed
  const key = `${frozen}:${walking}:${gunSpeed}`
  if (key === previous) return
  previous = key
  const speed = frozen ? 0 : gunSpeed * (walking ? 0.52 : 1)
  AvatarLocomotionSettings.createOrReplace(engine.PlayerEntity, {
    walkSpeed: speed,
    jogSpeed: speed,
    runSpeed: speed,
    jumpHeight: CS_JUMP_HEIGHT,
    runJumpHeight: CS_JUMP_HEIGHT,
    hardLandingCooldown: 0
  })
  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: {
      $case: 'standard',
      standard: {
        disableWalk: frozen,
        disableJog: frozen,
        disableRun: frozen,
        disableJump: frozen,
        disableDoubleJump: true,
        disableGliding: true,
        disableEmote: true
      }
    }
  })
}
