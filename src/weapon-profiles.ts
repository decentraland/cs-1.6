import { GRENADES, GrenadeId, GrenadeProfile, grenadeProfile } from './grenade-profiles'
export type GunId =
  | 'glock18'
  | 'usp'
  | 'p228'
  | 'deagle'
  | 'elite'
  | 'fiveseven'
  | 'm3'
  | 'xm1014'
  | 'mac10'
  | 'tmp'
  | 'mp5'
  | 'ump45'
  | 'p90'
  | 'galil'
  | 'famas'
  | 'ak47'
  | 'm4a1'
  | 'aug'
  | 'sg552'
  | 'scout'
  | 'awp'
  | 'g3sg1'
  | 'sg550'
  | 'm249'
export type WeaponId = GunId | GrenadeId | 'knife'
export type WeaponSlot = 'primary' | 'secondary' | 'melee' | 'grenade'
export type GunCategory = 'pistols' | 'shotguns' | 'smgs' | 'rifles' | 'machineguns'
export type AmmoType =
  '9mm' | '45acp' | '357sig' | '50ae' | '57mm' | 'buckshot' | '556nato' | '556natobox' | '762nato' | '338magnum'
interface BaseWeaponProfile {
  id: WeaponId
  name: string
  slot: WeaponSlot
  speed: number
  kind: 'gun' | 'knife'
}
export interface GunProfile extends BaseWeaponProfile {
  id: GunId
  slot: 'primary' | 'secondary'
  kind: 'gun'
  category: GunCategory
  team: number
  price: number
  clip: number
  ammoType: AmmoType
  reserve: number
  ammoPrice: number
  ammoPack: number
  damage: number
  rangeModifier: number
  armorRatio: number
  fireRate: number
  reloadTime: number
  speed: number
  automatic: boolean
  accuracy: number
  drawTime: number
  range: number
  pellets: number
  zoomLevels?: readonly number[]
  zoomSpeed?: number
  alternate?: 'silencer' | 'burst' | 'scope'
  shellReload?: boolean
}
// Compatibility values: ReGameDLL_CS b0889847, without REGAMEDLL_FIXES.
export const GUNS: Record<GunId, GunProfile> = {
  glock18: {
    id: 'glock18',
    name: 'Glock-18',
    slot: 'secondary',
    kind: 'gun',
    category: 'pistols',
    team: 0,
    price: 400,
    clip: 20,
    ammoType: '9mm',
    reserve: 120,
    ammoPrice: 20,
    ammoPack: 30,
    damage: 25.0,
    rangeModifier: 0.75,
    armorRatio: 0.525,
    fireRate: 0.15,
    reloadTime: 2.2,
    speed: 6.25,
    automatic: false,
    accuracy: 0.9,
    drawTime: 0.75,
    range: 204.8,
    pellets: 1,
    alternate: 'burst'
  },
  usp: {
    id: 'usp',
    name: 'USP',
    slot: 'secondary',
    kind: 'gun',
    category: 'pistols',
    team: 0,
    price: 500,
    clip: 12,
    ammoType: '45acp',
    reserve: 100,
    ammoPrice: 25,
    ammoPack: 12,
    damage: 34.0,
    rangeModifier: 0.79,
    armorRatio: 0.5,
    fireRate: 0.15,
    reloadTime: 2.7,
    speed: 6.25,
    automatic: false,
    accuracy: 0.92,
    drawTime: 0.75,
    range: 102.4,
    pellets: 1,
    alternate: 'silencer'
  },
  p228: {
    id: 'p228',
    name: 'P228',
    slot: 'secondary',
    kind: 'gun',
    category: 'pistols',
    team: 0,
    price: 600,
    clip: 13,
    ammoType: '357sig',
    reserve: 52,
    ammoPrice: 50,
    ammoPack: 13,
    damage: 32.0,
    rangeModifier: 0.8,
    armorRatio: 0.625,
    fireRate: 0.15,
    reloadTime: 2.7,
    speed: 6.25,
    automatic: false,
    accuracy: 0.9,
    drawTime: 0.75,
    range: 102.4,
    pellets: 1
  },
  deagle: {
    id: 'deagle',
    name: 'Desert Eagle',
    slot: 'secondary',
    kind: 'gun',
    category: 'pistols',
    team: 0,
    price: 650,
    clip: 7,
    ammoType: '50ae',
    reserve: 35,
    ammoPrice: 40,
    ammoPack: 7,
    damage: 54.0,
    rangeModifier: 0.81,
    armorRatio: 0.75,
    fireRate: 0.225,
    reloadTime: 2.2,
    speed: 6.25,
    automatic: false,
    accuracy: 0.9,
    drawTime: 0.75,
    range: 102.4,
    pellets: 1
  },
  elite: {
    id: 'elite',
    name: 'Dual Elites',
    slot: 'secondary',
    kind: 'gun',
    category: 'pistols',
    team: 1,
    price: 800,
    clip: 30,
    ammoType: '9mm',
    reserve: 120,
    ammoPrice: 20,
    ammoPack: 30,
    damage: 36.0,
    rangeModifier: 0.75,
    armorRatio: 0.525,
    fireRate: 0.075,
    reloadTime: 4.5,
    speed: 6.25,
    automatic: false,
    accuracy: 0.88,
    drawTime: 0.75,
    range: 204.8,
    pellets: 1
  },
  fiveseven: {
    id: 'fiveseven',
    name: 'Five-Seven',
    slot: 'secondary',
    kind: 'gun',
    category: 'pistols',
    team: 2,
    price: 750,
    clip: 20,
    ammoType: '57mm',
    reserve: 100,
    ammoPrice: 50,
    ammoPack: 50,
    damage: 20.0,
    rangeModifier: 0.885,
    armorRatio: 0.75,
    fireRate: 0.15,
    reloadTime: 2.7,
    speed: 6.25,
    automatic: false,
    accuracy: 0.92,
    drawTime: 0.75,
    range: 102.4,
    pellets: 1
  },
  m3: {
    id: 'm3',
    name: 'M3',
    slot: 'primary',
    kind: 'gun',
    category: 'shotguns',
    team: 0,
    price: 1700,
    clip: 8,
    ammoType: 'buckshot',
    reserve: 32,
    ammoPrice: 65,
    ammoPack: 8,
    damage: 20.0,
    rangeModifier: 1,
    armorRatio: 0.5,
    fireRate: 0.875,
    reloadTime: 0.45,
    speed: 5.75,
    automatic: true,
    accuracy: 0,
    drawTime: 0.75,
    range: 75.0,
    pellets: 9,
    shellReload: true
  },
  xm1014: {
    id: 'xm1014',
    name: 'XM1014',
    slot: 'primary',
    kind: 'gun',
    category: 'shotguns',
    team: 0,
    price: 3000,
    clip: 7,
    ammoType: 'buckshot',
    reserve: 32,
    ammoPrice: 65,
    ammoPack: 8,
    damage: 20.0,
    rangeModifier: 1,
    armorRatio: 0.5,
    fireRate: 0.25,
    reloadTime: 0.3,
    speed: 6.0,
    automatic: true,
    accuracy: 0,
    drawTime: 0.75,
    range: 76.2,
    pellets: 6,
    shellReload: true
  },
  mac10: {
    id: 'mac10',
    name: 'MAC-10',
    slot: 'primary',
    kind: 'gun',
    category: 'smgs',
    team: 1,
    price: 1400,
    clip: 30,
    ammoType: '45acp',
    reserve: 100,
    ammoPrice: 25,
    ammoPack: 12,
    damage: 29.0,
    rangeModifier: 0.82,
    armorRatio: 0.475,
    fireRate: 0.07,
    reloadTime: 3.15,
    speed: 6.25,
    automatic: true,
    accuracy: 0.15,
    drawTime: 0.75,
    range: 204.8,
    pellets: 1
  },
  tmp: {
    id: 'tmp',
    name: 'TMP',
    slot: 'primary',
    kind: 'gun',
    category: 'smgs',
    team: 2,
    price: 1250,
    clip: 30,
    ammoType: '9mm',
    reserve: 120,
    ammoPrice: 20,
    ammoPack: 30,
    damage: 20.0,
    rangeModifier: 0.85,
    armorRatio: 0.5,
    fireRate: 0.07,
    reloadTime: 2.12,
    speed: 6.25,
    automatic: true,
    accuracy: 0.2,
    drawTime: 0.75,
    range: 204.8,
    pellets: 1
  },
  mp5: {
    id: 'mp5',
    name: 'MP5 Navy',
    slot: 'primary',
    kind: 'gun',
    category: 'smgs',
    team: 0,
    price: 1500,
    clip: 30,
    ammoType: '9mm',
    reserve: 120,
    ammoPrice: 20,
    ammoPack: 30,
    damage: 26.0,
    rangeModifier: 0.84,
    armorRatio: 0.5,
    fireRate: 0.075,
    reloadTime: 2.63,
    speed: 6.25,
    automatic: true,
    accuracy: 0,
    drawTime: 0.75,
    range: 204.8,
    pellets: 1
  },
  ump45: {
    id: 'ump45',
    name: 'UMP45',
    slot: 'primary',
    kind: 'gun',
    category: 'smgs',
    team: 0,
    price: 1700,
    clip: 25,
    ammoType: '45acp',
    reserve: 100,
    ammoPrice: 25,
    ammoPack: 12,
    damage: 30.0,
    rangeModifier: 0.82,
    armorRatio: 0.5,
    fireRate: 0.1,
    reloadTime: 3.5,
    speed: 6.25,
    automatic: true,
    accuracy: 0,
    drawTime: 0.75,
    range: 204.8,
    pellets: 1
  },
  p90: {
    id: 'p90',
    name: 'P90',
    slot: 'primary',
    kind: 'gun',
    category: 'smgs',
    team: 0,
    price: 2350,
    clip: 50,
    ammoType: '57mm',
    reserve: 100,
    ammoPrice: 50,
    ammoPack: 50,
    damage: 21.0,
    rangeModifier: 0.885,
    armorRatio: 0.75,
    fireRate: 0.066,
    reloadTime: 3.4,
    speed: 6.125,
    automatic: true,
    accuracy: 0.2,
    drawTime: 0.75,
    range: 204.8,
    pellets: 1
  },
  galil: {
    id: 'galil',
    name: 'Galil',
    slot: 'primary',
    kind: 'gun',
    category: 'rifles',
    team: 1,
    price: 2000,
    clip: 35,
    ammoType: '556nato',
    reserve: 90,
    ammoPrice: 60,
    ammoPack: 30,
    damage: 30.0,
    rangeModifier: 0.98,
    armorRatio: 0.775,
    fireRate: 0.0875,
    reloadTime: 2.45,
    speed: 6.0,
    automatic: true,
    accuracy: 0.2,
    drawTime: 0.75,
    range: 204.8,
    pellets: 1
  },
  famas: {
    id: 'famas',
    name: 'FAMAS',
    slot: 'primary',
    kind: 'gun',
    category: 'rifles',
    team: 2,
    price: 2250,
    clip: 25,
    ammoType: '556nato',
    reserve: 90,
    ammoPrice: 60,
    ammoPack: 30,
    damage: 30.0,
    rangeModifier: 0.96,
    armorRatio: 0.7,
    fireRate: 0.0825,
    reloadTime: 3.3,
    speed: 6.0,
    automatic: true,
    accuracy: 0.2,
    drawTime: 0.75,
    range: 204.8,
    pellets: 1,
    alternate: 'burst'
  },
  ak47: {
    id: 'ak47',
    name: 'AK-47',
    slot: 'primary',
    kind: 'gun',
    category: 'rifles',
    team: 1,
    price: 2500,
    clip: 30,
    ammoType: '762nato',
    reserve: 90,
    ammoPrice: 80,
    ammoPack: 30,
    damage: 36.0,
    rangeModifier: 0.98,
    armorRatio: 0.775,
    fireRate: 0.0955,
    reloadTime: 2.45,
    speed: 5.525,
    automatic: true,
    accuracy: 0.2,
    drawTime: 0.75,
    range: 204.8,
    pellets: 1
  },
  m4a1: {
    id: 'm4a1',
    name: 'M4A1',
    slot: 'primary',
    kind: 'gun',
    category: 'rifles',
    team: 2,
    price: 3100,
    clip: 30,
    ammoType: '556nato',
    reserve: 90,
    ammoPrice: 60,
    ammoPack: 30,
    damage: 32.0,
    rangeModifier: 0.97,
    armorRatio: 0.7,
    fireRate: 0.0875,
    reloadTime: 3.05,
    speed: 5.75,
    automatic: true,
    accuracy: 0.2,
    drawTime: 0.75,
    range: 204.8,
    pellets: 1,
    alternate: 'silencer'
  },
  aug: {
    id: 'aug',
    name: 'AUG',
    slot: 'primary',
    kind: 'gun',
    category: 'rifles',
    team: 2,
    price: 3500,
    clip: 30,
    ammoType: '556nato',
    reserve: 90,
    ammoPrice: 60,
    ammoPack: 30,
    damage: 32.0,
    rangeModifier: 0.96,
    armorRatio: 0.7,
    fireRate: 0.0825,
    reloadTime: 3.3,
    speed: 6.0,
    automatic: true,
    accuracy: 0.2,
    drawTime: 0.75,
    range: 204.8,
    pellets: 1,
    zoomLevels: [55],
    zoomSpeed: 6.0,
    alternate: 'scope'
  },
  sg552: {
    id: 'sg552',
    name: 'SG552',
    slot: 'primary',
    kind: 'gun',
    category: 'rifles',
    team: 1,
    price: 3500,
    clip: 30,
    ammoType: '556nato',
    reserve: 90,
    ammoPrice: 60,
    ammoPack: 30,
    damage: 33.0,
    rangeModifier: 0.955,
    armorRatio: 0.7,
    fireRate: 0.0825,
    reloadTime: 3.0,
    speed: 5.875,
    automatic: true,
    accuracy: 0.2,
    drawTime: 0.75,
    range: 204.8,
    pellets: 1,
    zoomLevels: [55],
    zoomSpeed: 5.0,
    alternate: 'scope'
  },
  scout: {
    id: 'scout',
    name: 'Scout',
    slot: 'primary',
    kind: 'gun',
    category: 'rifles',
    team: 0,
    price: 2750,
    clip: 10,
    ammoType: '762nato',
    reserve: 90,
    ammoPrice: 80,
    ammoPack: 30,
    damage: 75.0,
    rangeModifier: 0.98,
    armorRatio: 0.85,
    fireRate: 1.25,
    reloadTime: 2.0,
    speed: 6.5,
    automatic: true,
    accuracy: 0,
    drawTime: 0.75,
    range: 204.8,
    pellets: 1,
    zoomLevels: [40, 15],
    zoomSpeed: 5.5,
    alternate: 'scope'
  },
  awp: {
    id: 'awp',
    name: 'AWP',
    slot: 'primary',
    kind: 'gun',
    category: 'rifles',
    team: 0,
    price: 4750,
    clip: 10,
    ammoType: '338magnum',
    reserve: 30,
    ammoPrice: 125,
    ammoPack: 10,
    damage: 115.0,
    rangeModifier: 0.99,
    armorRatio: 0.975,
    fireRate: 1.45,
    reloadTime: 2.5,
    speed: 5.25,
    automatic: true,
    accuracy: 0,
    drawTime: 1.45,
    range: 204.8,
    pellets: 1,
    zoomLevels: [40, 10],
    zoomSpeed: 3.75,
    alternate: 'scope'
  },
  g3sg1: {
    id: 'g3sg1',
    name: 'G3SG1',
    slot: 'primary',
    kind: 'gun',
    category: 'rifles',
    team: 1,
    price: 5000,
    clip: 20,
    ammoType: '762nato',
    reserve: 90,
    ammoPrice: 80,
    ammoPack: 30,
    damage: 80.0,
    rangeModifier: 0.98,
    armorRatio: 0.825,
    fireRate: 0.25,
    reloadTime: 3.5,
    speed: 5.25,
    automatic: true,
    accuracy: 0.2,
    drawTime: 0.75,
    range: 204.8,
    pellets: 1,
    zoomLevels: [40, 15],
    zoomSpeed: 3.75,
    alternate: 'scope'
  },
  sg550: {
    id: 'sg550',
    name: 'SG550',
    slot: 'primary',
    kind: 'gun',
    category: 'rifles',
    team: 2,
    price: 4200,
    clip: 30,
    ammoType: '556nato',
    reserve: 90,
    ammoPrice: 60,
    ammoPack: 30,
    damage: 70.0,
    rangeModifier: 0.98,
    armorRatio: 0.725,
    fireRate: 0.25,
    reloadTime: 3.35,
    speed: 5.25,
    automatic: true,
    accuracy: 0.9,
    drawTime: 0.75,
    range: 204.8,
    pellets: 1,
    zoomLevels: [40, 15],
    zoomSpeed: 3.75,
    alternate: 'scope'
  },
  m249: {
    id: 'm249',
    name: 'M249',
    slot: 'primary',
    kind: 'gun',
    category: 'machineguns',
    team: 0,
    price: 5750,
    clip: 100,
    ammoType: '556natobox',
    reserve: 200,
    ammoPrice: 60,
    ammoPack: 30,
    damage: 32.0,
    rangeModifier: 0.97,
    armorRatio: 0.75,
    fireRate: 0.1,
    reloadTime: 4.7,
    speed: 5.5,
    automatic: true,
    accuracy: 0.2,
    drawTime: 0.75,
    range: 204.8,
    pellets: 1
  }
}
export interface KnifeProfile extends BaseWeaponProfile {
  id: 'knife'
  slot: 'melee'
  kind: 'knife'
}
export const KNIFE: KnifeProfile = { id: 'knife', name: 'Knife', slot: 'melee', kind: 'knife', speed: 250 * 0.025 }
export type WeaponProfile = GunProfile | KnifeProfile | GrenadeProfile
export function gunProfile(id: string): GunProfile | undefined {
  return Object.prototype.hasOwnProperty.call(GUNS, id) ? GUNS[id as GunId] : undefined
}
export function weaponProfile(id: string): WeaponProfile | undefined {
  return id === KNIFE.id ? KNIFE : (gunProfile(id) ?? grenadeProfile(id))
}
export function profileByName(name: string): WeaponProfile {
  return name === KNIFE.name
    ? KNIFE
    : (Object.values(GUNS).find((gun) => gun.name === name) ??
        Object.values(GRENADES).find((grenade) => grenade.name === name) ??
        GUNS.ak47)
}

export function modeStats(gun: GunProfile, mode = 0, zoom = 90) {
  return {
    automatic: gun.automatic || (gun.alternate === 'burst' && mode === 1),
    damage:
      mode && gun.id === 'm4a1' ? 33 : mode && gun.id === 'usp' ? 30 : mode && gun.id === 'famas' ? 34 : gun.damage,
    rangeModifier: mode && gun.id === 'm4a1' ? 0.95 : gun.rangeModifier,
    fireRate:
      mode && gun.id === 'glock18'
        ? 0.5
        : mode && gun.id === 'famas'
          ? 0.55
          : zoom !== 90 && ['aug', 'sg552'].includes(gun.id)
            ? 0.135
            : gun.fireRate,
    speed: zoom !== 90 ? (gun.zoomSpeed ?? gun.speed) : gun.speed
  }
}

export function buyMenuGuns(team: number, category: GunCategory): GunProfile[] {
  const ids: Record<GunCategory, GunId[]> = {
    pistols: ['glock18', 'usp', 'p228', 'deagle', team === 2 ? 'fiveseven' : 'elite'],
    shotguns: ['m3', 'xm1014'],
    smgs: [team === 2 ? 'tmp' : 'mac10', 'mp5', 'ump45', 'p90'],
    rifles:
      team === 2
        ? ['famas', 'scout', 'm4a1', 'aug', 'sg550', 'awp']
        : ['galil', 'ak47', 'scout', 'sg552', 'awp', 'g3sg1'],
    machineguns: ['m249']
  }
  return ids[category].map((id) => GUNS[id])
}
