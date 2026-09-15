import { GunId, GUNS, WeaponId, gunProfile } from './weapon-profiles'
export interface StoredGun {
  id: string
  clip: number
  reserve: number
}
export interface GunInventory {
  active: string
  items: StoredGun[]
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
): { money: number; error?: string } {
  const gun = gunProfile(id)
  if (!gun || (gun.team && gun.team !== team)) return { money, error: 'That weapon is unavailable to your team.' }
  if (inventory.items.some((item) => item.id === id)) return { money, error: 'You already own this weapon.' }
  if (money < gun.price) return { money, error: 'You have insufficient funds!' }
  inventory.items = inventory.items.filter((item) => gunProfile(item.id)?.slot !== gun.slot)
  inventory.items.push({ id, clip: gun.clip, reserve: 0 })
  inventory.active = id
  return { money: money - gun.price }
}
export function buyGunAmmo(inventory: GunInventory, slot: string, money: number): { money: number; error?: string } {
  const item = inventory.items.find((item) => gunProfile(item.id)?.slot === slot),
    gun = item && gunProfile(item.id)
  if (!item || !gun) return { money, error: 'You do not own a weapon in that slot.' }
  if (item.reserve >= gun.reserve) return { money, error: 'You cannot carry any more ammunition.' }
  if (money < gun.ammoPrice) return { money, error: 'You have insufficient funds!' }
  item.reserve = Math.min(gun.reserve, item.reserve + gun.ammoPack)
  return { money: money - gun.ammoPrice }
}
export function selectWeapon(inventory: GunInventory, slot: string): WeaponId | undefined {
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
