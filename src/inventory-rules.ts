import { GrenadeId, grenadeProfile, GRENADE_SLOT_ORDER } from './grenade-profiles'
import { GunId, GUNS, WeaponId, gunProfile } from './weapon-profiles'
export interface StoredGun {
  id: string
  mode?: number
  clip: number
  reserve: number
}
export interface GunInventory {
  active: string
  ammo?: { type: string; amount: number }[]
  items: StoredGun[]
}
const WEIGHTS: Record<GunId, number> = {
  glock18: 5,
  usp: 5,
  p228: 5,
  deagle: 7,
  elite: 5,
  fiveseven: 5,
  m3: 20,
  xm1014: 20,
  mac10: 25,
  tmp: 25,
  mp5: 25,
  ump45: 25,
  p90: 26,
  galil: 25,
  famas: 75,
  ak47: 25,
  m4a1: 25,
  aug: 25,
  sg552: 25,
  scout: 30,
  awp: 30,
  g3sg1: 20,
  sg550: 20,
  m249: 25
}
export function weaponWeight(id: string) {
  const gun = gunProfile(id)
  return id === 'c4' ? 3 : gun ? WEIGHTS[gun.id] : (grenadeProfile(id)?.weight ?? 0)
}
export function bestGun(inventory: GunInventory): string {
  return (
    inventory.items
      .filter((item) => gunProfile(item.id) || (grenadeProfile(item.id) && item.reserve > 0))
      .sort((a, b) => weaponWeight(b.id) - weaponWeight(a.id))[0]?.id ?? 'knife'
  )
}
export function startingInventory(team: number, primary?: GunId): GunInventory {
  const gun = team === 1 ? GUNS.glock18 : GUNS.usp
  const inventory: GunInventory = { active: gun.id, items: [{ id: gun.id, clip: gun.clip, reserve: gun.clip * 2 }] }
  if (primary) {
    const rifle = GUNS[primary]
    inventory.items.push({ id: rifle.id, clip: rifle.clip, reserve: rifle.reserve })
    inventory.active = rifle.id
  }
  return inventory
}
export function buyGun(
  inventory: GunInventory,
  id: string,
  team: number,
  money: number
): { money: number; error?: string; dropped?: StoredGun } {
  const gun = gunProfile(id)
  if (!gun || (gun.team && gun.team !== team)) return { money, error: 'That weapon is unavailable to your team.' }
  if (inventory.items.some((item) => item.id === id)) return { money, error: 'You already own this weapon.' }
  if (money < gun.price) return { money, error: 'You have insufficient funds!' }
  for (const item of inventory.items) syncAmmoPool(inventory, item.id, item.reserve)
  const reserve = inventory.ammo?.find((pool) => pool.type === gun.ammoType)?.amount ?? 0
  const replaced = inventory.items.find((item) => gunProfile(item.id)?.slot === gun.slot)
  inventory.items = inventory.items.filter((item) => gunProfile(item.id)?.slot !== gun.slot)
  if (replaced) inventory.active = bestGun(inventory)
  inventory.items.push({ id, clip: gun.clip, reserve })
  if (weaponWeight(id) > weaponWeight(inventory.active)) inventory.active = id
  return { money: money - gun.price, ...(replaced ? { dropped: { ...replaced, reserve: 0 } } : {}) }
}
export function buyGunAmmo(inventory: GunInventory, slot: string, money: number): { money: number; error?: string } {
  const item = inventory.items.find((item) => gunProfile(item.id)?.slot === slot),
    gun = item && gunProfile(item.id)
  if (!item || !gun) return { money, error: 'You do not own a weapon in that slot.' }
  if (item.reserve >= gun.reserve) return { money, error: 'You cannot carry any more ammunition.' }
  if (money < gun.ammoPrice) return { money, error: 'You have insufficient funds!' }
  syncAmmoPool(inventory, item.id, Math.min(gun.reserve, item.reserve + gun.ammoPack))
  return { money: money - gun.ammoPrice }
}
export function selectWeapon(inventory: GunInventory, slot: string): WeaponId | undefined {
  if (slot === 'grenade') {
    const start = GRENADE_SLOT_ORDER.indexOf(inventory.active as GrenadeId)
    for (let n = 1; n <= GRENADE_SLOT_ORDER.length; n++) {
      const id = GRENADE_SLOT_ORDER[(start + n) % GRENADE_SLOT_ORDER.length]
      if (inventory.items.some((item) => item.id === id && item.reserve > 0)) {
        inventory.active = id
        return id
      }
    }
    return undefined
  }
  if (slot === 'melee') {
    inventory.active = 'knife'
    return 'knife'
  }
  const gun = inventory.items.find((item) => gunProfile(item.id)?.slot === slot)
  if (!gun) return undefined
  inventory.active = gun.id
  return gunProfile(gun.id)?.id
}
export class SemiAutoTrigger {
  private press = 0
  private spent = 0
  private held = false
  update(held: boolean) {
    if (held && !this.held) this.press++
    this.held = held
  }
  claim() {
    if (this.press <= this.spent) return false
    this.spent = this.press
    return true
  }
  reset() {
    this.press = 0
    this.spent = 0
    this.held = false
  }
}

export function syncAmmoPool(inventory: GunInventory, id: string, amount: number) {
  const gun = gunProfile(id)
  if (!gun) return
  inventory.ammo ??= []
  const pool = inventory.ammo.find((pool) => pool.type === gun.ammoType)
  if (pool) pool.amount = amount
  else inventory.ammo.push({ type: gun.ammoType, amount })
  for (const item of inventory.items) if (gunProfile(item.id)?.ammoType === gun.ammoType) item.reserve = amount
}
