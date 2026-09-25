import { broadcastReloadSound, broadcastShellReloadSound } from './reload-audio'
import { engine, Entity } from '@dcl/sdk/ecs'
import { Weapon, Dead, PlayerAddress, PlayerInventory } from './components'
import { isServer } from '@dcl/sdk/network'
import { canAutoReload, finishReload, startReload, primaryDeadline } from './combat-rules'
import { isPlayerTriggerHeld, resetPlayerAccuracy, playerGunAccuracy } from './server'

import { syncAmmoPool } from './inventory-rules'
import { leaveScope, resumeScope, deployedGunMode, deployAttackTimers, rememberAttackTimers } from './weapon-modes'
import { GunId, GUNS, modeStats } from './weapon-profiles'
import type { AttackTimers } from './weapon-modes'
import { GrenadeId, GRENADES } from './grenade-profiles'

export function equipGun(
  player: Entity,
  id: GunId,
  clip: number,
  reserve: number,
  mode = 0,
  stored?: Readonly<AttackTimers>
) {
  const previous = Weapon.getOrNull(player),
    gun = GUNS[id],
    now = Date.now() / 1000,
    timing = deployAttackTimers(gun, now, stored)
  mode = deployedGunMode(id, clip, mode)
  Weapon.createOrReplace(player, {
    name: gun.name,
    revision: (previous?.revision ?? 0) + 1,
    mode,
    zoom: 90,
    resumeZoom: 90,
    alternateAt: timing.secondary,
    nextPrimaryAt: timing.primary,
    deployedTimers: timing,
    readyAt: now + gun.drawTime,
    damage: modeStats(gun, mode).damage,
    ammoClip: clip,
    maxAmmoClip: gun.clip,
    ammoReserve: reserve,
    maxAmmoReserve: gun.reserve,
    fireRate: modeStats(gun, mode).fireRate,
    lastShotTime: 0,
    lastShotId: previous?.lastShotId ?? 0,
    lastFiredShotId: previous?.lastFiredShotId ?? 0,
    isReloading: false,
    reloadTime: gun.reloadTime,
    reloadStartTime: 0,
    reloadStage: 0,
    reloadStepAt: 0,
    reloadStep: 0
  })
  resetPlayerAccuracy(PlayerAddress.getOrNull(player)?.address ?? '')
}
export function equipKnife(player: Entity, restoreTimers = true) {
  const previous = Weapon.getOrNull(player),
    timing = (restoreTimers && PlayerInventory.getOrNull(player)?.knifeTiming) || { primary: 0, secondary: 0 }
  Weapon.createOrReplace(player, {
    name: 'Knife',
    revision: (previous?.revision ?? 0) + 1,
    mode: 0,
    zoom: 90,
    resumeZoom: 90,
    alternateAt: timing.secondary,
    nextPrimaryAt: timing.primary,
    deployedTimers: { ...timing },
    readyAt: Date.now() / 1000 + 0.75,
    damage: 0,
    ammoClip: 0,
    maxAmmoClip: 0,
    ammoReserve: 0,
    maxAmmoReserve: 0,
    fireRate: 0.35,
    lastShotTime: 0,
    lastShotId: previous?.lastShotId ?? 0,
    lastFiredShotId: previous?.lastFiredShotId ?? 0,
    isReloading: false,
    reloadTime: 0,
    reloadStartTime: 0,
    reloadStage: 0,
    reloadStepAt: 0,
    reloadStep: 0
  })
  resetPlayerAccuracy(PlayerAddress.getOrNull(player)?.address ?? '')
}
export function storeActiveGun(player: Entity) {
  const weapon = Weapon.getOrNull(player),
    inventory = PlayerInventory.getMutableOrNull(player)
  if (!weapon || !inventory) return
  if (weapon.name === 'Knife') {
    inventory.knifeTiming = rememberAttackTimers(weapon)
    return
  }
  const gun = Object.values(GUNS).find((profile) => profile.name === weapon.name)
  const item = gun && inventory.items.find((candidate) => candidate.id === gun.id)
  if (item) {
    item.clip = weapon.ammoClip
    syncAmmoPool(inventory, item.id, weapon.ammoReserve)
    item.mode = weapon.mode
    item.accuracy = playerGunAccuracy(PlayerAddress.getOrNull(player)?.address ?? '')
    item.timing = rememberAttackTimers(weapon)
  }
}
export function equipGrenade(player: Entity, id: GrenadeId, count: number) {
  equipKnife(player, false)
  Object.assign(Weapon.getMutable(player), {
    name: GRENADES[id].name,
    ammoClip: -1,
    maxAmmoClip: -1,
    ammoReserve: count,
    maxAmmoReserve: GRENADES[id].capacity
  })
}
export function giveWeapon(player: Entity, _weaponType: 'AK47') {
  if (!isServer()) return
  PlayerInventory.createOrReplace(player, { active: 'ak47', items: [{ id: 'ak47', clip: 30, reserve: 90 }] })
  equipGun(player, 'ak47', 30, 90)
}

export function weaponSystem() {
  if (!isServer()) return
  const now = Date.now() / 1000
  for (const [entity, weapon] of engine.getEntitiesWith(Weapon)) {
    if (Dead.has(entity)) continue
    const mutable = Weapon.getMutable(entity)
    resumeScope(mutable, now)
    const address = PlayerAddress.getOrNull(entity)?.address ?? ''
    if (
      canAutoReload(weapon, true, isPlayerTriggerHeld(address)) &&
      now >= weapon.readyAt &&
      now >= primaryDeadline(weapon)
    ) {
      if (startReload(mutable, now, true)) {
        const gun = Object.values(GUNS).find((profile) => profile.name === weapon.name)
        if (gun) leaveScope(mutable, gun)
        resetPlayerAccuracy(address, false, true)
        broadcastReloadSound(address, mutable)
      }
    }
    if (finishReload(mutable, now, () => broadcastShellReloadSound(address, mutable))) storeActiveGun(entity)
  }
}
