import { engine, Transform } from '@dcl/sdk/ecs'
import { isPointerLocked, isTouchPlatform } from './platform'
import { myProfile } from '@dcl/sdk/network'
import { Dead, PlayerTeam } from './components'
import { getLocalPlayerEntity, requestPointerLock } from './client'
import { getPractice } from './practice'
import { inBuyZone } from './buy-zones'
import { BUY_SECONDS, buyRestriction } from './economy-rules'
import { room } from './index'

let sequence = 0
// Explicit toggle on every platform: the HUD BUY button (or 0 CANCEL) opens and closes it, Esc only frees the cursor.
let menuOpen = false
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
    matchOver: match.matchOver,
    elapsed: BUY_SECONDS - match.buyTimeLeft,
    inZone: inBuyZone(position, team)
  })
}
export function isBuyMenuVisible() {
  if (!canOpenBuyMenu()) {
    menuOpen = false
    return false
  }
  return menuOpen
}
export function openBuyMenu() {
  if (menuOpen || !canOpenBuyMenu()) return
  menuOpen = true
  if (!isTouchPlatform()) requestPointerLock(false)
}
export function buyEquipment(item: string) {
  const match = getPractice()
  if (!match) return
  sequence = Math.max(sequence + 1, Date.now() * 1000)
  room.send('buyEquipment', { item, round: match.round, sequence })
}
export function closeBuyMenu() {
  if (!menuOpen) return
  menuOpen = false
  if (!isTouchPlatform()) requestPointerLock(true)
}
