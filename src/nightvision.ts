import { engine } from '@dcl/sdk/ecs'
import { Dead, PlayerEquipment, PlayerHealth } from './components'
import { playerEntities } from './server'
import { canPlayRound, getPractice, playerPosition } from './practice'
import { room } from './index'
import { canUseNightVision, NIGHTVISION_COOLDOWN } from './nightvision-rules'

const requests = new Map<string, { sequence: number; nextAt: number }>()

export function initializeNightVision() {
  room.onMessage('nightVisionToggle', (data, context) => {
    if (!context) return
    const address = context.from.toLowerCase(),
      player = playerEntities.get(address),
      match = getPractice()
    if (player === undefined || !match || data.round !== match.round) return
    const equipment = PlayerEquipment.getOrNull(player),
      previous = requests.get(address)
    if (!equipment || !Number.isSafeInteger(data.sequence) || data.sequence <= (previous?.sequence ?? 0)) return
    const request = { sequence: data.sequence, nextAt: previous?.nextAt ?? 0 }
    requests.set(address, request)
    const now = Date.now() / 1000
    if (
      !canUseNightVision(
        equipment.nightVision,
        !Dead.has(player) && (PlayerHealth.getOrNull(player)?.current ?? 0) > 0,
        canPlayRound(address),
        match.phase,
        match.matchOver
      ) ||
      now < request.nextAt ||
      data.enabled === equipment.nightVisionOn
    )
      return
    PlayerEquipment.getMutable(player).nightVisionOn = data.enabled
    request.nextAt = now + NIGHTVISION_COOLDOWN
    const position = playerPosition(address)
    if (position) room.send('playerVoice', { address, position, clip: data.enabled ? 'nvg_on' : 'nvg_off' })
  })
  engine.addSystem(() => {
    const match = getPractice()
    for (const address of requests.keys()) if (!playerEntities.has(address)) requests.delete(address)
    for (const [address, player] of playerEntities) {
      const equipment = PlayerEquipment.getOrNull(player)
      if (!equipment?.nightVisionOn) continue
      if (
        !match ||
        !canUseNightVision(
          equipment.nightVision,
          !Dead.has(player) && (PlayerHealth.getOrNull(player)?.current ?? 0) > 0,
          canPlayRound(address),
          match.phase,
          match.matchOver
        )
      )
        PlayerEquipment.getMutable(player).nightVisionOn = false
    }
  })
}
