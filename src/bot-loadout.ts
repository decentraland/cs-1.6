import { createBotCombat } from './bot-combat'
import type { BotCombat } from './bot-combat'
import { storeBotAmmo } from './bot-economy'
import type { BotAccount } from './bot-economy'
import { weaponWeight } from './inventory-rules'
import { deathGun } from './pickup-rules'
import { gunProfile } from './weapon-profiles'

export function switchEmptyBotGun(account: BotAccount, combat: BotCombat, now: number): BotCombat {
  const weapon = combat.weapon
  if (
    weapon.ammoClip > 0 ||
    weapon.ammoReserve > 0 ||
    weapon.isReloading ||
    now < weapon.lastShotTime + weapon.fireRate ||
    now < (weapon.readyAt ?? 0)
  )
    return combat
  storeBotAmmo(account, combat.gun, weapon.ammoClip, weapon.ammoReserve)
  const next = account.inventory.items
    .filter((item) => item.id !== combat.gun && gunProfile(item.id) && item.clip + item.reserve > 0)
    .sort((a, b) => weaponWeight(b.id) - weaponWeight(a.id))[0]
  const gun = next && gunProfile(next.id)
  if (!gun) return combat
  account.inventory.active = gun.id
  const readyAt = now + gun.drawTime
  const selected = createBotCombat(Math.max(readyAt, combat.nextBurst), gun.id, next)
  selected.weapon.readyAt = readyAt
  selected.visible = combat.visible
  return selected
}

export function botDeathGun(account: BotAccount, combat: BotCombat) {
  storeBotAmmo(account, combat.gun, combat.weapon.ammoClip, combat.weapon.ammoReserve)
  return deathGun(account.inventory)
}
