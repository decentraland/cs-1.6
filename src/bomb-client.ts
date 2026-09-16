import { engine, inputSystem, InputAction, PointerEventType, Transform } from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { Dead, Weapon, PlayerEquipment, PlayerInventory, PlayerTeam } from './components'
import { getLocalPlayerEntity, isFireInputReady } from './client'
import { selectWeapon } from './inventory-rules'
import { getPractice } from './practice'
import { getBomb, isBombBusy } from './bomb'
import { canDefuseBomb } from './bomb-rules'
import { getFpsAimDirection } from './fps-camera'
import { bombSiteAt } from './bomb-sites'
import { room } from './index'
import { hasAimControl } from './platform'
import { isTeamMenuOpen } from './menu-state'
import { newC4Animation, advanceC4Animation } from './c4-animation-rules'

const animation = newC4Animation()
export const getC4Animation = () => animation
let selected = false
let weaponRevision = -1
let previousRound = -1
let previousHeld = false
let lastSent = 0
let sequence = 0

export function hasBombSelected() {
  return selected
}
export function isLocalBombBusy() {
  const address = myProfile.userId?.toLowerCase() ?? ''
  const player = getLocalPlayerEntity()
  const bomb = getBomb(),
    position = Transform.get(engine.PlayerEntity).position
  const localDefuse =
    bomb?.phase === 'planted' &&
    inputSystem.isPressed(InputAction.IA_PRIMARY) &&
    canDefuseBomb(
      position,
      bomb.position,
      getFpsAimDirection(),
      player === null ? 0 : (PlayerTeam.getOrNull(player)?.team ?? 0)
    )
  return isBombBusy(address) || localDefuse || (selected && animation.plantAt >= 0)
}

export function bombInputSystem() {
  const match = getPractice(),
    bomb = getBomb(),
    player = getLocalPlayerEntity()
  const revision = player === null ? -1 : (Weapon.getOrNull(player)?.revision ?? -1)
  if (revision !== weaponRevision) {
    selected = player !== null && (PlayerEquipment.getOrNull(player)?.bombSelected ?? false)
    weaponRevision = revision
  }
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
      const inventory = PlayerInventory.getOrNull(player)
      if (!inventory || !selectWeapon({ active: inventory.active, items: [...inventory.items] }, slot)) return
      selected = false
      const weapon = Weapon.getOrNull(player)
      if (weapon) room.send('weaponSelect', { slot, round: match.round, revision: weapon.revision })
    }
    // Shift+1 holds the scoreboard (no Tab in the explorer), so it must not switch weapons.
    if (slotKey(InputAction.IA_ACTION_3) && !shift) selectSlot('primary')
    if (slotKey(InputAction.IA_ACTION_4)) {
      if (!shift) selectSlot('secondary')
      else if (selected) {
        selected = false
        room.send('bombDrop', { round: match.round, direction: getFpsAimDirection() })
      } else {
        const weapon = Weapon.getOrNull(player)
        if (weapon)
          room.send('weaponDrop', { round: match.round, revision: weapon.revision, direction: getFpsAimDirection() })
      }
    }
    if (slotKey(InputAction.IA_ACTION_5)) selectSlot(shift ? 'grenade' : 'melee')
    if (slotKey(InputAction.IA_ACTION_6) && bomb.carrier === address) {
      if (shift) {
        selected = false
        room.send('bombDrop', { round: match.round, direction: getFpsAimDirection() })
      } else {
        selected = true
        room.send('bombSelect', { selected: true, round: match.round })
      }
    }
  }
  const held =
    locked &&
    isFireInputReady() &&
    !isTeamMenuOpen() &&
    match.phase === 'live' &&
    !Dead.has(player) &&
    (selected ? inputSystem.isPressed(InputAction.IA_POINTER) : inputSystem.isPressed(InputAction.IA_PRIMARY))
  const now = Date.now() / 1000
  advanceC4Animation(animation, {
    selected,
    held,
    site: !!bombSiteAt(Transform.get(engine.PlayerEntity).position),
    readyAt: bomb.readyAt,
    planting: bomb.phase === 'planting',
    now
  })
  if (held !== previousHeld || (held && now - lastSent >= 0.1)) {
    previousHeld = held
    lastSent = now
    sequence = Math.max(sequence + 1, Date.now() * 1000)
    room.send('bombUse', { held, sequence, round: match.round, direction: getFpsAimDirection() })
  }
}
