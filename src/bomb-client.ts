import { engine, inputSystem, InputAction, PointerEventType, Transform } from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { Dead, Weapon } from './components'
import { getLocalPlayerEntity } from './client'
import { getPractice } from './practice'
import { getBomb, isBombBusy } from './bomb'
import { canDefuseBomb } from './bomb-rules'
import { getFpsAimDirection } from './fps-camera'
import { bombSiteAt } from './bomb-sites'
import { room } from './index'
import { hasAimControl } from './platform'
import { isTeamMenuOpen } from './menu-state'

let selected = false
let previousRound = -1
let previousHeld = false
let lastSent = 0
let sequence = 0

export function hasBombSelected() {
  return selected
}
export function isLocalBombBusy() {
  const address = myProfile.userId?.toLowerCase() ?? ''
  const bomb = getBomb(),
    position = Transform.get(engine.PlayerEntity).position
  const localDefuse =
    bomb?.phase === 'planted' &&
    inputSystem.isPressed(InputAction.IA_PRIMARY) &&
    canDefuseBomb(position, bomb.position, getFpsAimDirection())
  return (
    isBombBusy(address) ||
    localDefuse ||
    (selected && inputSystem.isPressed(InputAction.IA_POINTER) && !!bombSiteAt(position))
  )
}

export function bombInputSystem() {
  const match = getPractice(),
    bomb = getBomb(),
    player = getLocalPlayerEntity()
  const address = myProfile.userId?.toLowerCase() ?? ''
  if (!match || !bomb || player === null) return
  if (match.round !== previousRound) {
    selected = false
    previousRound = match.round
    previousHeld = false
  }
  if (bomb.carrier !== address || Dead.has(player)) selected = false
  const locked = hasAimControl()
  if (locked && !isTeamMenuOpen()) {
    const shift = inputSystem.isPressed(InputAction.IA_MODIFIER)
    const slotKey = (action: InputAction) => inputSystem.isTriggered(action, PointerEventType.PET_DOWN)
    const selectSlot = (slot: string) => {
      selected = false
      room.send('bombSelect', { selected: false, round: match.round })
      const weapon = Weapon.getOrNull(player)
      if (weapon) room.send('weaponSelect', { slot, round: match.round, revision: weapon.revision })
    }
    // Shift+1 holds the scoreboard (no Tab in the explorer), so it must not switch weapons.
    if (slotKey(InputAction.IA_ACTION_3) && !shift) selectSlot('primary')
    if (slotKey(InputAction.IA_ACTION_4)) selectSlot('secondary')
    if (slotKey(InputAction.IA_ACTION_5)) selectSlot('melee')
    if (slotKey(InputAction.IA_ACTION_6) && bomb.carrier === address) {
      if (shift) {
        selected = false
        room.send('bombDrop', { round: match.round })
      } else {
        selected = true
        room.send('bombSelect', { selected: true, round: match.round })
      }
    }
  }
  const held =
    locked &&
    match.phase === 'live' &&
    !Dead.has(player) &&
    (selected ? inputSystem.isPressed(InputAction.IA_POINTER) : inputSystem.isPressed(InputAction.IA_PRIMARY))
  const now = Date.now() / 1000
  if (held !== previousHeld || (held && now - lastSent >= 0.1)) {
    previousHeld = held
    lastSent = now
    sequence = Math.max(sequence + 1, Date.now() * 1000)
    room.send('bombUse', { held, sequence, round: match.round, direction: getFpsAimDirection() })
  }
}
