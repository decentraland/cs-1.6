import { canFight } from './round-rules'
import { updateCsMovement } from './cs-movement'
import { isBuyMenuVisible } from './buy-client'
import { isTeamMenuOpen } from './menu-state'
import { isTouchPlatform } from './platform'
import { isTouchWalking } from './touch-movement'
import { isCombatInputPressed } from './combat-input'
import { engine, AvatarLocomotionSettings, InputModifier, InputAction } from '@dcl/sdk/ecs'
import { getPractice } from './practice'
import { getLocalPlayerEntity } from './client'
import { hasBombSelected, isLocalBombBusy } from './bomb-client'
import { profileByName, modeStats } from './weapon-profiles'
import { C4_SPEED } from './bomb-rules'
import { Dead, Weapon } from './components'

// Initial scale calibration: a 72-unit standing hull corresponds to 1.8 metres.
export const METRES_PER_CS_UNIT = 0.025
export const AK_RUN_SPEED = 221 * METRES_PER_CS_UNIT
export const CS_JUMP_HEIGHT = 45 * METRES_PER_CS_UNIT
let previous = ''

export function isWalking() {
  if (isTouchPlatform()) return isTouchWalking()
  return isCombatInputPressed(InputAction.IA_MODIFIER) || isCombatInputPressed(InputAction.IA_WALK)
}

export function locomotionSystem() {
  const player = getLocalPlayerEntity()
  const match = getPractice()
  const frozen =
    !canFight(match) ||
    player === null ||
    Dead.has(player) ||
    isLocalBombBusy() ||
    (isTouchPlatform() && (isBuyMenuVisible() || isTeamMenuOpen()))
  const walking = isWalking()
  const weapon = player === null ? undefined : Weapon.getOrNull(player)
  const profile = profileByName(weapon?.name ?? 'AK-47')
  const gunSpeed = hasBombSelected()
    ? C4_SPEED
    : profile.kind === 'gun'
      ? modeStats(profile, weapon?.mode, weapon?.zoom).speed
      : profile.speed
  const speed = frozen ? 0 : gunSpeed * (walking ? 0.52 : 1)
  updateCsMovement(speed, frozen, gunSpeed)
  const key = `${frozen}:${walking}:${gunSpeed}`
  if (key === previous) return
  previous = key
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
