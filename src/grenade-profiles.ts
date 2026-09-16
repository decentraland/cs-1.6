export type GrenadeId = 'hegrenade' | 'flashbang' | 'smokegrenade'
export interface GrenadeProfile {
  id: GrenadeId
  name: string
  kind: 'grenade'
  slot: 'grenade'
  speed: number
  price: number
  capacity: number
  weight: number
  gravity: number
  friction: number
}
export const GRENADES: Record<GrenadeId, GrenadeProfile> = {
  hegrenade: {
    id: 'hegrenade',
    name: 'HE Grenade',
    kind: 'grenade',
    slot: 'grenade',
    speed: 6.25,
    price: 300,
    capacity: 1,
    weight: 2,
    gravity: 11,
    friction: 0.7
  },
  flashbang: {
    id: 'flashbang',
    name: 'Flashbang',
    kind: 'grenade',
    slot: 'grenade',
    speed: 6.25,
    price: 200,
    capacity: 2,
    weight: 1,
    gravity: 10,
    friction: 0.8
  },
  smokegrenade: {
    id: 'smokegrenade',
    name: 'Smoke Grenade',
    kind: 'grenade',
    slot: 'grenade',
    speed: 6.25,
    price: 300,
    capacity: 1,
    weight: 1,
    gravity: 10,
    friction: 0.8
  }
}
export function grenadeProfile(id: string): GrenadeProfile | undefined {
  return Object.prototype.hasOwnProperty.call(GRENADES, id) ? GRENADES[id as GrenadeId] : undefined
}
export const GRENADE_SLOT_ORDER: readonly GrenadeId[] = ['flashbang', 'hegrenade', 'smokegrenade']
