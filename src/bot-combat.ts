import { AccuracyState, setTrigger } from './accuracy'
import { freshGunAccuracy } from './gun-accuracy'
import { fireGunShot, Point, ShotTarget } from './ballistics'
import { WeaponState, finishReload, startReload, fireShot, shotDeadline } from './combat-rules'
import { GUNS, GunId } from './weapon-profiles'
import { aimError, BOT_DIFFICULTY_PROFILES, BotDifficulty, DEFAULT_BOT_DIFFICULTY, offsetAim } from './bot-difficulty'

export interface BotCombat {
  gun: GunId
  weapon: WeaponState
  accuracy: AccuracyState
  burst: number
  nextBurst: number
  visible: boolean
}
export const BOT_EYE_HEIGHT = 1.4

export function createBotCombat(
  readyAt: number,
  gun: GunId = 'ak47',
  ammo?: { clip: number; reserve: number }
): BotCombat {
  const profile = GUNS[gun]
  return {
    gun,
    weapon: {
      name: profile.name,
      ammoClip: ammo?.clip ?? profile.clip,
      maxAmmoClip: profile.clip,
      ammoReserve: ammo?.reserve ?? profile.reserve,
      fireRate: profile.fireRate,
      lastShotTime: -Infinity,
      lastShotId: 0,
      isReloading: false,
      reloadTime: profile.reloadTime,
      reloadStartTime: 0
    },
    accuracy: freshGunAccuracy(gun),
    burst: 0,
    nextBurst: readyAt,
    visible: false
  }
}

export function botShot<T>(
  state: BotCombat,
  options: {
    feet: Point
    target?: Point
    targets: readonly ShotTarget<T>[]
    speed: number
    now: number
    alive: boolean
    random?: () => number
    difficulty?: BotDifficulty
  }
) {
  const { feet, target, targets, speed, now, alive } = options
  const profile = BOT_DIFFICULTY_PROFILES[options.difficulty ?? DEFAULT_BOT_DIFFICULTY]
  if (!alive) {
    setTrigger(state.accuracy, false, now)
    state.burst = 0
    state.visible = false
    return
  }
  finishReload(state.weapon, now)
  if (
    state.weapon.ammoClip === 0 &&
    now >= state.weapon.lastShotTime + state.weapon.fireRate &&
    startReload(state.weapon, now, true)
  ) {
    state.accuracy = freshGunAccuracy(state.gun)
    state.burst = 0
  }
  if (!target) {
    setTrigger(state.accuracy, false, now)
    state.burst = 0
    state.visible = false
    return
  }
  // Noticing takes the reaction time; low skill levels then hesitate for the attack delay.
  if (!state.visible) state.nextBurst = Math.max(state.nextBurst, now + profile.reactionTime + profile.attackDelay)
  state.visible = true
  if (
    state.weapon.isReloading ||
    state.weapon.ammoClip === 0 ||
    now < state.nextBurst ||
    now + 1e-6 < state.weapon.lastShotTime + state.weapon.fireRate
  )
    return
  const dx = target.x - feet.x,
    dy = target.y - feet.y - BOT_EYE_HEIGHT,
    dz = target.z - feet.z
  const distance = Math.hypot(dx, dy, dz)
  if (!Number.isFinite(distance) || distance < 0.001) return
  if (state.burst === 0) state.burst = distance < 10 ? 5 : distance < 20 ? 3 : 2
  const scheduled = shotDeadline(state.weapon.lastShotTime, state.weapon.fireRate, now) ?? now
  if (fireShot(state.weapon, now, true, scheduled)) return
  const error = aimError(profile, options.random ?? Math.random)
  const shot = fireGunShot({
    gun: state.gun,
    feet,
    eyeHeight: BOT_EYE_HEIGHT,
    aim: offsetAim({ x: dx / distance, y: dy / distance, z: dz / distance }, error.yaw, error.pitch),
    accuracy: state.accuracy,
    triggerHeld: true,
    speed,
    now,
    damage: GUNS[state.gun].damage,
    targets,
    random: options.random
  })
  state.burst--
  if (!GUNS[state.gun].automatic) setTrigger(state.accuracy, false, now)
  if (state.burst === 0) {
    setTrigger(state.accuracy, false, now)
    state.nextBurst = now + (distance < 10 ? 0.5 : 0.8)
  }
  return shot
}
