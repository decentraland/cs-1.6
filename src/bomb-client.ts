import { engine, inputSystem, InputAction, PointerEventType, PointerLock, Transform } from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { Dead, Weapon } from './components'
import { getLocalPlayerEntity } from './client'
import { getPractice } from './practice'
import { getBomb, isBombBusy } from './bomb'
import { canDefuseBomb } from './bomb-rules'
import { getFpsAimDirection } from './fps-camera'
import { bombSiteAt } from './bomb-sites'
import { room } from './index'

let selected = false
let previousRound = -1
let previousHeld = false
let lastSent = 0
let sequence = 0

export function hasBombSelected() { return selected }
export function isLocalBombBusy() {
  const address = myProfile.userId?.toLowerCase() ?? ''
  const bomb = getBomb(), position = Transform.get(engine.PlayerEntity).position
  const localDefuse = bomb?.phase === 'planted' && inputSystem.isPressed(InputAction.IA_PRIMARY) && canDefuseBomb(position, bomb.position, getFpsAimDirection())
  return isBombBusy(address) || localDefuse || selected && inputSystem.isPressed(InputAction.IA_POINTER) && !!bombSiteAt(position)
}

export function bombInputSystem() {
  const match = getPractice(), bomb = getBomb(), player = getLocalPlayerEntity()
  const address = myProfile.userId?.toLowerCase() ?? ''
  if (!match || !bomb || player === null) return
  if (match.round !== previousRound) { selected = false; previousRound = match.round; previousHeld = false }
  if (bomb.carrier !== address || Dead.has(player)) selected = false
  const locked = PointerLock.getOrNull(engine.CameraEntity)?.isPointerLocked ?? false
  if (locked) {
    if (match.mode === 'teams' && inputSystem.isTriggered(InputAction.IA_ACTION_6, PointerEventType.PET_DOWN) && bomb.carrier === address) {
      selected = true; room.send('bombSelect', { selected: true, round: match.round })
    }
    if (inputSystem.isTriggered(InputAction.IA_ACTION_4, PointerEventType.PET_DOWN)) {
      selected = false; room.send('bombSelect', { selected: false, round: match.round })
      const weapon=Weapon.getOrNull(player)
      if(weapon)room.send('weaponSelect',{slot:inputSystem.isPressed(InputAction.IA_MODIFIER)?'secondary':'primary',round:match.round,revision:weapon.revision})
    }
    if (inputSystem.isTriggered(InputAction.IA_ACTION_5, PointerEventType.PET_DOWN)) {
      if(inputSystem.isPressed(InputAction.IA_MODIFIER)) {
        selected=false;room.send('bombSelect',{selected:false,round:match.round})
        const weapon=Weapon.getOrNull(player)
        if(weapon)room.send('weaponSelect',{slot:'melee',round:match.round,revision:weapon.revision})
      } else if(match.mode==='teams'&&bomb.carrier===address) {
        selected = false; room.send('bombDrop', { round: match.round })
      }
    }
  }
  const held = locked && match.phase === 'live' && !Dead.has(player) && (selected ? inputSystem.isPressed(InputAction.IA_POINTER) : inputSystem.isPressed(InputAction.IA_PRIMARY))
  const now = Date.now()/1000
  if (held !== previousHeld || held && now-lastSent >= .1) {
    previousHeld = held; lastSent = now; sequence = Math.max(sequence+1,Date.now()*1000)
    room.send('bombUse', { held, sequence, round: match.round, direction: getFpsAimDirection() })
  }
}
