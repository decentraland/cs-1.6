import type { EquipmentAccount } from './economy-rules'
import { grenadeCount } from './grenade-rules'
import type { StoredGun } from './inventory-rules'
import { gunProfile } from './weapon-profiles'

export interface RebuyLoadout {
  primary?: { id: string; reserve: number }
  secondary?: { id: string; reserve: number }
  armor: number
  defuseKit: boolean
  nightVision: boolean
  hegrenade: number
  flashbang: number
  smokegrenade: number
}

export function captureRebuy(
  inventory: { readonly items: readonly Readonly<StoredGun>[] },
  account: Pick<EquipmentAccount, 'armor' | 'helmet' | 'defuseKit' | 'nightVision'>
): RebuyLoadout {
  const slot = (name: 'primary' | 'secondary') => {
    const item = inventory.items.find((item) => gunProfile(item.id)?.slot === name)
    return item ? { id: item.id, reserve: item.reserve } : undefined
  }
  return {
    primary: slot('primary'),
    secondary: slot('secondary'),
    armor: account.armor > 0 ? (account.helmet ? 2 : 1) : 0,
    defuseKit: account.defuseKit,
    nightVision: !!account.nightVision,
    hegrenade: grenadeCount(inventory, 'hegrenade'),
    flashbang: grenadeCount(inventory, 'flashbang'),
    smokegrenade: grenadeCount(inventory, 'smokegrenade')
  }
}

// rebuy.txt order; read again after each purchase because money, slots and shared ammo may change.
export function* rebuyItems(saved: RebuyLoadout, read: () => RebuyLoadout): Generator<string> {
  if (saved.primary && !read().primary) yield 'weapon:' + saved.primary.id
  const primary = read().primary
  if (primary && (saved.primary?.reserve ?? 0) > primary.reserve) yield 'ammo'
  if (saved.defuseKit && !read().defuseKit) yield 'defusekit'
  if (saved.armor > read().armor) yield saved.armor === 2 ? 'assaultsuit' : 'kevlar'
  for (const id of ['hegrenade', 'flashbang', 'smokegrenade'] as const) {
    const missing = saved[id] - read()[id]
    for (let i = 0; i < missing; i++) yield 'grenade:' + id
  }
  if (saved.secondary && read().secondary?.id !== saved.secondary.id) yield 'weapon:' + saved.secondary.id
  const secondary = read().secondary
  if (secondary && (saved.secondary?.reserve ?? 0) > secondary.reserve) yield 'secondaryammo'
  if (saved.nightVision && !read().nightVision) yield 'nightvision'
}
