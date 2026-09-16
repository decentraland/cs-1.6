import { Entity } from '@dcl/sdk/ecs'
import { Weapon } from './components'
import { getFpsAimDirection } from './fps-camera'
import { getPractice } from './practice'
import { room } from './index'
import { predictGrenadeAnimation } from './weapon-view'

let revision = -1
let held = false
let sent = 0
let sequence = 0
let pinAt = 0
let threw = false
let throwConfirmed = false

export function grenadeInput(player: Entity, pressed: boolean) {
  const weapon = Weapon.get(player),
    now = Date.now() / 1000,
    round = getPractice()
  if (weapon.revision !== revision) {
    revision = weapon.revision
    held = false
    pinAt = 0
    threw = false
    throwConfirmed = false
    sent = 0
  }
  const active = round?.phase === 'live' || round?.phase === 'end'
  pressed &&= active
  if (pressed !== held || (pressed && now - sent >= 0.1)) {
    held = pressed
    sent = now
    sequence = Math.max(sequence + 1, Date.now() * 1000)
    room.send('grenadeUse', { round: round?.round ?? 0, revision, sequence, held, direction: getFpsAimDirection() })
  }
  if (weapon.mode === 2) throwConfirmed = true
  if (weapon.mode === 0 && threw && throwConfirmed && now >= weapon.readyAt) {
    pinAt = 0
    threw = false
    throwConfirmed = false
  }
  if (pressed && !pinAt && !threw && weapon.mode === 0 && weapon.ammoReserve > 0 && now >= weapon.readyAt) {
    pinAt = now
    predictGrenadeAnimation(1)
  }
  if (!pressed && pinAt && !threw && now >= pinAt + 0.5) {
    threw = true
    predictGrenadeAnimation(2)
  }
}
