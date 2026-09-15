import { engine, PointerLock, Transform } from '@dcl/sdk/ecs'
import { isPointerLocked, isTouchPlatform } from './platform'
import { myProfile } from '@dcl/sdk/network'
import { Dead, PlayerTeam } from './components'
import { getLocalPlayerEntity } from './client'
import { getPractice } from './practice'
import { inBuyZone } from './buy-zones'
import { buyRestriction } from './economy-rules'
import { room } from './index'
import { delay } from './delaySystem'

let sequence = 0
// Touch has no Esc: the HUD BUY button toggles this instead of the pointer lock.
let touchMenuOpen = false
export function canOpenBuyMenu() {
  const player = getLocalPlayerEntity(),
    match = getPractice(),
    position = Transform.getOrNull(engine.PlayerEntity)?.position
  if (player === null || !match || !position) return false
  const team = PlayerTeam.getOrNull(player)?.team ?? 0
  return !buyRestriction({
    alive: !Dead.has(player),
    eligible: !!match.roster.find(
      (seat) => seat.connected && seat.eligibleRound <= match.round && seat.address === myProfile.userId?.toLowerCase()
    ),
    team,
    phase: match.phase,
    elapsed: 120 - match.timeLeft,
    inZone: inBuyZone(position, team)
  })
}
export function isBuyMenuVisible() {
  if (!canOpenBuyMenu()) {
    touchMenuOpen = false
    return false
  }
  return isTouchPlatform() ? touchMenuOpen : !isPointerLocked()
}
export function openBuyMenu() {
  touchMenuOpen = true
}
export function buyEquipment(item: string) {
  const match = getPractice()
  if (!match) return
  sequence = Math.max(sequence + 1, Date.now() * 1000)
  room.send('buyEquipment', { item, round: match.round, sequence })
}
export function closeBuyMenu() {
  touchMenuOpen = false
  if (isTouchPlatform()) return
  const request = engine.addEntity()
  PointerLock.create(request, { isPointerLocked: true })
  delay(1000, () => engine.removeEntity(request))
}
