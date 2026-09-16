import { gunProfile } from './weapon-profiles'
import { GunInventory, StoredGun, bestGun, syncAmmoPool, weaponWeight } from './inventory-rules'

function preserveAmmo(inventory: GunInventory) {
  for (const item of inventory.items) syncAmmoPool(inventory, item.id, item.reserve)
}
export function dropGun(inventory: GunInventory, id = inventory.active): StoredGun | undefined {
  const item = inventory.items.find((item) => item.id === id)
  if (!item || !gunProfile(id)) return undefined
  preserveAmmo(inventory)
  inventory.items = inventory.items.filter((item) => item.id !== id)
  inventory.active = bestGun(inventory)
  return { ...item, reserve: 0 }
}
export function deathGun(inventory: GunInventory): StoredGun | undefined {
  const item = inventory.items
    .filter((item) => gunProfile(item.id))
    .sort((a, b) => weaponWeight(b.id) - weaponWeight(a.id))[0]
  const result = item && gunProfile(item.id) ? { ...item } : undefined
  inventory.items = []
  inventory.ammo = []
  inventory.active = 'knife'
  return result
}
export function pickupGun(
  inventory: GunInventory,
  item: StoredGun,
  canSwitch = true,
  active = inventory.active
): boolean {
  const gun = gunProfile(item.id)
  if (!gun || inventory.items.some((owned) => gunProfile(owned.id)?.slot === gun.slot)) return false
  preserveAmmo(inventory)
  const existing = inventory.ammo?.find((pool) => pool.type === gun.ammoType)?.amount ?? 0
  const deploy = canSwitch && weaponWeight(item.id) > weaponWeight(active)
  inventory.items.push({ ...item, reserve: existing })
  syncAmmoPool(inventory, item.id, Math.min(gun.reserve, existing + item.reserve))
  if (deploy) inventory.active = item.id
  return true
}
export { dropDirection, touchesWeaponBox as touchesGun, tossWeaponBox as tossGun } from './weapon-box-rules'
export type { TossState, TossTrace } from './weapon-box-rules'
