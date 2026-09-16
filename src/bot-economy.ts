import { armorDamage, creditedMoney, equipmentPrice, purchaseEquipment, START_MONEY } from './economy-rules'
import type { BuyContext } from './economy-rules'
import { bestGun, buyGun, buyGunAmmo, startingInventory, syncAmmoPool } from './inventory-rules'
import type { GunInventory, StoredGun } from './inventory-rules'
import { GUNS, gunProfile } from './weapon-profiles'
import type { GunId } from './weapon-profiles'
import { armorCovers } from './hit-regions'
import type { HitGroup } from './ballistics'

export interface BotAccount {
  team: number
  money: number
  armor: number
  helmet: boolean
  defuseKit: boolean
  inventory: GunInventory
  boughtRound: number
}

export const botAccounts = new Map<string, BotAccount>()

export function botAccount(address: string, team: number): BotAccount {
  let account = botAccounts.get(address)
  if (!account) {
    account = {
      team,
      money: START_MONEY,
      armor: 0,
      helmet: false,
      defuseKit: false,
      inventory: startingInventory(team),
      boughtRound: 0
    }
    botAccounts.set(address, account)
  }
  return account
}

export function creditBot(address: string, amount: number) {
  const account = botAccounts.get(address)
  if (account) account.money = creditedMoney(account.money, amount)
}

export function storeBotAmmo(account: BotAccount, gun: GunId, clip: number, reserve: number) {
  const stored = account.inventory.items.find((item) => item.id === gun)
  if (!stored) return
  stored.clip = clip
  syncAmmoPool(account.inventory, gun, reserve)
}

export function buyBotRound(account: BotAccount, round: number, survived: boolean, context: BuyContext): StoredGun[] {
  if (account.boughtRound === round) return []
  if (!survived || account.team !== context.team) {
    account.inventory = startingInventory(context.team)
    account.armor = 0
    account.helmet = false
    account.defuseKit = false
  }
  account.team = context.team
  account.boughtRound = round
  if (!context.inZone || !context.alive || !context.eligible || context.phase !== 'freeze') return []

  const inventory = account.inventory,
    dropped: StoredGun[] = []
  const preferred: GunId[] = account.team === 2 ? ['m4a1', 'famas', 'mp5'] : ['ak47', 'galil', 'mp5']
  const current = inventory.items.find((item) => gunProfile(item.id)?.slot === 'primary')
  for (const id of preferred) {
    if (current?.id === id) break
    const gun = GUNS[id]
    if (current && (gunProfile(current.id)?.price ?? 0) >= gun.price) break
    if (account.money < gun.price + gun.ammoPrice) continue
    const result = buyGun(inventory, id, account.team, account.money)
    if (result.error) continue
    account.money = result.money
    if (result.dropped) dropped.push(result.dropped)
    break
  }
  const buyAmmo = (slot: string) => {
    const result = buyGunAmmo(inventory, slot, account.money)
    if (result.error) return false
    account.money = result.money
    return true
  }
  const primary = inventory.items.find((item) => gunProfile(item.id)?.slot === 'primary')
  if (primary && primary.reserve < (gunProfile(primary.id)?.clip ?? 0)) buyAmmo('primary')
  for (const item of ['assaultsuit', 'kevlar', 'defusekit']) {
    const equipment = { ...account, reserve: 0 }
    const price = equipmentPrice(equipment, item, account.team)
    if (price === undefined || account.money < price) continue
    if (purchaseEquipment(equipment, item, context)) continue
    account.money = equipment.money
    account.armor = equipment.armor
    account.helmet = equipment.helmet
    account.defuseKit = equipment.defuseKit
  }
  for (const slot of ['primary', 'secondary']) while (buyAmmo(slot)) continue
  inventory.active = bestGun(inventory)
  return dropped
}

export function botArmorHit(account: BotAccount, damage: number, group: HitGroup, ratio: number, blast: boolean) {
  const protectedByArmor = blast ? account.armor > 0 : armorCovers(group, account.armor, account.helmet)
  const result = armorDamage(damage, account.armor, account.helmet, group, blast, ratio)
  account.armor = result.armor
  if (account.armor === 0) account.helmet = false
  return { damage: Math.floor(result.damage), protectedByArmor }
}
