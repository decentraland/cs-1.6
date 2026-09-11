export type GunId = 'ak47' | 'm4a1' | 'usp' | 'glock18'
export type WeaponId = GunId | 'knife'
export type WeaponSlot = 'primary' | 'secondary' | 'melee'
interface BaseWeaponProfile {
  id: WeaponId; name: string; slot: WeaponSlot; speed: number; kind: 'gun' | 'knife'
}
export interface GunProfile extends BaseWeaponProfile {
  id: GunId; slot: 'primary' | 'secondary'; kind: 'gun'; team: number; price: number
  clip: number; reserve: number; ammoPrice: number; ammoPack: number
  damage: number; rangeModifier: number; armorRatio: number; fireRate: number; reloadTime: number; automatic: boolean; accuracy: number
}
export const GUNS: Record<GunId,GunProfile> = {
  ak47: {id:'ak47',name:'AK-47',slot:'primary',kind:'gun',team:1,price:2500,clip:30,reserve:90,ammoPrice:80,ammoPack:30,damage:36,rangeModifier:.98,armorRatio:.775,fireRate:.0955,reloadTime:2.45,speed:221*.025,automatic:true,accuracy:.2},
  m4a1: {id:'m4a1',name:'M4A1',slot:'primary',kind:'gun',team:2,price:3100,clip:30,reserve:90,ammoPrice:60,ammoPack:30,damage:32,rangeModifier:.97,armorRatio:.7,fireRate:.0875,reloadTime:3.05,speed:230*.025,automatic:true,accuracy:.2},
  usp: {id:'usp',name:'USP',slot:'secondary',kind:'gun',team:0,price:500,clip:12,reserve:100,ammoPrice:25,ammoPack:12,damage:34,rangeModifier:.79,armorRatio:.5,fireRate:.15,reloadTime:2.7,speed:250*.025,automatic:false,accuracy:.92},
  glock18: {id:'glock18',name:'Glock-18',slot:'secondary',kind:'gun',team:0,price:400,clip:20,reserve:120,ammoPrice:20,ammoPack:30,damage:25,rangeModifier:.75,armorRatio:.525,fireRate:.15,reloadTime:2.2,speed:250*.025,automatic:false,accuracy:.9}
}
export interface KnifeProfile extends BaseWeaponProfile { id: 'knife'; slot: 'melee'; kind: 'knife' }
export const KNIFE: KnifeProfile = { id:'knife',name:'Knife',slot:'melee',kind:'knife',speed:250*.025 }
export type WeaponProfile = GunProfile | KnifeProfile
export function gunProfile(id: string): GunProfile | undefined { return Object.prototype.hasOwnProperty.call(GUNS,id) ? GUNS[id as GunId] : undefined }
export function weaponProfile(id: string): WeaponProfile | undefined { return id === KNIFE.id ? KNIFE : gunProfile(id) }
export function profileByName(name: string): WeaponProfile { return name === KNIFE.name ? KNIFE : Object.values(GUNS).find(gun=>gun.name===name) ?? GUNS.ak47 }
