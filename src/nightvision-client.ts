import { engine, Entity, LightSource, Transform } from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { Dead, PlayerEquipment, PlayerHealth } from './components'
import { getLocalPlayerEntity, isSyncStale } from './client'
import { getPractice } from './practice'
import { room } from './index'
import { isBuyMenuVisible } from './buy-client'
import { isTeamMenuOpen } from './menu-state'
import {
  canUseNightVision,
  NIGHTVISION_COOLDOWN,
  NIGHTVISION_LIGHT_COLOR,
  NIGHTVISION_TINT,
  NIGHTVISION_ALPHA_MIN,
  NIGHTVISION_ALPHA_MAX,
  NIGHTVISION_ALPHA_STEP
} from './nightvision-rules'

let sequence = 0,
  nextRequest = 0
let brightness = 110

export function nightVisionTint() {
  return { ...NIGHTVISION_TINT, a: brightness / 255 }
}

export function adjustNightVision(direction: -1 | 1) {
  if (!nightVisionStatus().on || isBuyMenuVisible() || isTeamMenuOpen()) return
  brightness = Math.max(
    NIGHTVISION_ALPHA_MIN,
    Math.min(NIGHTVISION_ALPHA_MAX, brightness + direction * NIGHTVISION_ALPHA_STEP)
  )
}

export function nightVisionStatus() {
  const player = getLocalPlayerEntity(),
    match = getPractice()
  if (player === null || !match || isSyncStale()) return { available: false, on: false }
  const equipment = PlayerEquipment.getOrNull(player)
  const seat = match.roster.find((seat) => seat.address === myProfile.userId?.toLowerCase())
  const available = canUseNightVision(
    !!equipment?.nightVision,
    !Dead.has(player) && (PlayerHealth.getOrNull(player)?.current ?? 0) > 0,
    !!seat?.connected && (seat.team === 1 || seat.team === 2) && seat.eligibleRound <= match.round,
    match.phase,
    match.matchOver
  )
  return { available, on: available && !!equipment?.nightVisionOn }
}

export function toggleNightVision() {
  const status = nightVisionStatus(),
    now = Date.now() / 1000,
    match = getPractice()
  if (!status.available || !match || isBuyMenuVisible() || isTeamMenuOpen() || now < nextRequest) return
  nextRequest = now + NIGHTVISION_COOLDOWN
  sequence = Math.max(sequence + 1, Date.now() * 1000)
  room.send('nightVisionToggle', { enabled: !status.on, round: match.round, sequence })
}

export function initializeNightVisionView() {
  let light: Entity | undefined
  engine.addSystem(() => {
    const position = Transform.getOrNull(engine.PlayerEntity)?.position
    if (!nightVisionStatus().on || !position) {
      if (light !== undefined) engine.removeEntity(light)
      light = undefined
      return
    }
    if (light === undefined) {
      light = engine.addEntity()
      LightSource.create(light, {
        active: true,
        color: NIGHTVISION_LIGHT_COLOR,
        intensity: 5000,
        range: 19.375,
        shadow: false,
        type: { $case: 'point', point: {} }
      })
      Transform.create(light, { position: { ...position } })
    } else Transform.getMutable(light).position = { ...position }
    LightSource.getMutable(light).range = (750 + Math.floor(Math.random() * 51)) * 0.025
  })
}
