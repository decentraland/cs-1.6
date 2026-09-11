import { AccuracyState, setTrigger } from './accuracy'
import { freshGunAccuracy } from './gun-accuracy'
import { fireGunShot, Point, ShotTarget } from './ballistics'
import { WeaponState, finishReload, startReload, fireShot, shotDeadline } from './combat-rules'
import { GUNS, GunId } from './weapon-profiles'

export interface BotCombat {
  gun: GunId
  weapon: WeaponState
  accuracy: AccuracyState
  burst: number
  nextBurst: number
  visible: boolean
}
export const BOT_EYE_HEIGHT = 1.4

export function createBotCombat(readyAt: number, gun: GunId = 'ak47'): BotCombat {
  const profile = GUNS[gun]
  return { gun, weapon: { ammoClip: profile.clip, maxAmmoClip: profile.clip, ammoReserve: profile.reserve, fireRate: profile.fireRate, lastShotTime: -Infinity, lastShotId: 0, isReloading: false, reloadTime: profile.reloadTime, reloadStartTime: 0 },
    accuracy: freshGunAccuracy(gun), burst: 0, nextBurst: readyAt, visible: false }
}

export function botShot<T>(state: BotCombat, options: { feet: Point; target?: Point; targets: readonly ShotTarget<T>[]; speed: number; now: number; alive: boolean; random?: () => number }) {
  const { feet, target, targets, speed, now, alive } = options
  if (!alive) { setTrigger(state.accuracy, false, now); state.burst = 0; state.visible = false; return }
  finishReload(state.weapon, now)
  if (state.weapon.ammoClip === 0 && now >= state.weapon.lastShotTime + state.weapon.fireRate && startReload(state.weapon, now, true)) {
    state.accuracy = freshGunAccuracy(state.gun); state.burst = 0
  }
  if (!target) { setTrigger(state.accuracy, false, now); state.burst = 0; state.visible = false; return }
  if (!state.visible) state.nextBurst = Math.max(state.nextBurst, now + .35)
  state.visible = true
  if (state.weapon.isReloading || state.weapon.ammoClip === 0 || now < state.nextBurst || now + 1e-6 < state.weapon.lastShotTime + state.weapon.fireRate) return
  const dx = target.x - feet.x, dy = target.y - feet.y - BOT_EYE_HEIGHT, dz = target.z - feet.z
  const distance = Math.hypot(dx, dy, dz)
  if (!Number.isFinite(distance) || distance < .001) return
  if (state.burst === 0) state.burst = distance < 10 ? 5 : distance < 20 ? 3 : 2
  const scheduled = shotDeadline(state.weapon.lastShotTime, state.weapon.fireRate, now) ?? now
  if (fireShot(state.weapon, now, true, scheduled)) return
  const shot = fireGunShot({ gun: state.gun, feet, eyeHeight: BOT_EYE_HEIGHT, aim: { x: dx / distance, y: dy / distance, z: dz / distance }, accuracy: state.accuracy, triggerHeld: true, speed, now, damage: GUNS[state.gun].damage, targets, random: options.random })
  state.burst--
  if (state.burst === 0) {
    setTrigger(state.accuracy, false, now)
    state.nextBurst = now + (distance < 10 ? .5 : .8)
  }
  return shot
}
