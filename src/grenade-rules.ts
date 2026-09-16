import { GRENADES, GrenadeId, grenadeProfile } from './grenade-profiles'
import { GunInventory, weaponWeight } from './inventory-rules'
import type { Point } from './ballistics'
import type { TossTrace } from './pickup-rules'

export function grenadeCount(
  inventory: { readonly items: readonly { readonly id: string; readonly reserve: number }[] },
  id: string
) {
  return inventory.items.find((item) => item.id === id)?.reserve ?? 0
}
export function buyGrenade(
  inventory: GunInventory,
  id: string,
  money: number,
  active = inventory.active
): { money: number; error?: string } {
  const grenade = grenadeProfile(id)
  if (!grenade) return { money, error: 'That grenade is unavailable.' }
  const count = grenadeCount(inventory, id)
  if (count >= grenade.capacity) return { money, error: 'You cannot carry any more of this grenade.' }
  if (money < grenade.price) return { money, error: 'You have insufficient funds!' }
  const item = inventory.items.find((item) => item.id === id)
  if (item) item.reserve++
  else {
    inventory.items.push({ id, clip: -1, reserve: 1 })
    if (grenade.weight > weaponWeight(active)) inventory.active = id
  }
  return { money: money - grenade.price }
}
export interface GrenadeAction {
  held: boolean
  mode: number
  readyAt: number
}
export function advanceGrenadeAction(action: GrenadeAction, count: number, now: number, id: GrenadeId = 'hegrenade') {
  if (now < action.readyAt) return
  if (action.mode === 2) {
    action.mode = 0
    return count > 0 && id !== 'flashbang' ? 'redraw' : 'retire'
  }
  if (action.mode === 1 && !action.held) {
    action.mode = 2
    action.readyAt = now + (count > 1 ? 0.75 : 0.5)
    return 'throw'
  }
  if (action.mode === 0 && action.held && count > 0) {
    action.mode = 1
    action.readyAt = now + 0.5
    return 'pin'
  }
}
export function grenadeLaunch(eye: Point, direction: Point, velocity: Point) {
  const length = Math.hypot(direction.x, direction.y, direction.z)
  if (!Number.isFinite(length) || length < 0.001) return undefined
  const pitch = (-Math.asin(Math.max(-1, Math.min(1, direction.y / length))) * 180) / Math.PI
  const angle = ((-10 + pitch * (pitch < 0 ? 80 / 90 : 100 / 90)) * Math.PI) / 180
  const yaw = Math.atan2(direction.x, direction.z)
  const forward = { x: Math.sin(yaw) * Math.cos(angle), y: -Math.sin(angle), z: Math.cos(yaw) * Math.cos(angle) }
  const speed = Math.min(750, (90 - (angle * 180) / Math.PI) * 6) * 0.025
  return {
    position: { x: eye.x + forward.x * 0.4, y: eye.y + forward.y * 0.4, z: eye.z + forward.z * 0.4 },
    velocity: {
      x: forward.x * speed + velocity.x,
      y: forward.y * speed + velocity.y,
      z: forward.z * speed + velocity.z
    }
  }
}
export interface GrenadeMotion {
  position: Point
  velocity: Point
  grounded: boolean
  bounces: number
  accumulator: number
}
export function bounceGrenade(state: GrenadeMotion, id: GrenadeId, dt: number, trace: TossTrace) {
  const profile = GRENADES[id]
  state.accumulator += Math.max(0, Math.min(dt, 0.25))
  while (state.accumulator >= 0.01) {
    state.accumulator -= 0.01
    if (state.velocity.y > 0) state.grounded = false
    if (state.grounded && Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z) === 0) continue
    state.velocity.y -= profile.gravity * 0.01
    const speed = Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z)
    if (!speed) continue
    const direction = { x: state.velocity.x / speed, y: state.velocity.y / speed, z: state.velocity.z / speed }
    const hit = trace(state.position, direction, speed * 0.01)
    if (hit.allSolid) {
      state.velocity = { x: 0, y: 0, z: 0 }
      continue
    }
    state.position = { ...hit.position }
    if (!hit.solid) continue
    const normal = hit.normal ?? { x: 0, y: 1, z: 0 }
    state.position.x += normal.x * 0.001
    state.position.y += normal.y * 0.001
    state.position.z += normal.z * 0.001
    if (state.grounded) {
      state.velocity.x *= 0.8
      state.velocity.y *= 0.8
      state.velocity.z *= 0.8
    } else if (state.bounces++ >= 10) {
      state.grounded = true
      state.velocity = { x: 0, y: 0, z: 0 }
    }
    const dot =
      (state.velocity.x * normal.x + state.velocity.y * normal.y + state.velocity.z * normal.z) * (2 - profile.friction)
    state.velocity.x -= normal.x * dot
    state.velocity.y -= normal.y * dot
    state.velocity.z -= normal.z * dot
    for (const axis of ['x', 'y', 'z'] as const) if (Math.abs(state.velocity[axis]) < 0.0025) state.velocity[axis] = 0
    if (normal.y > 0.7) {
      const magnitude = Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z)
      if (state.velocity.y < 0.2) {
        state.grounded = true
        state.velocity.y = 0
      }
      if (magnitude < 0.75) {
        state.grounded = true
        state.velocity = { x: 0, y: 0, z: 0 }
      } else {
        const remaining = Math.max(0, 1 - hit.distance / (speed * 0.01)) * 0.01 * 0.9
        const nextSpeed = Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z)
        if (nextSpeed > 0) {
          const second = trace(
            state.position,
            { x: state.velocity.x / nextSpeed, y: state.velocity.y / nextSpeed, z: state.velocity.z / nextSpeed },
            nextSpeed * remaining
          )
          state.position = { ...second.position }
          if (second.allSolid) state.velocity = { x: 0, y: 0, z: 0 }
        }
      }
    }
  }
}
export function heDamage(distance: number) {
  return Math.max(0, 100 * (1 - distance / 8.75))
}
export interface FlashState {
  start: number
  hold: number
  fade: number
  alpha: number
}
export function flashEffect(distance: number, facing: boolean, now: number, previous?: FlashState): FlashState {
  const strength = Math.max(0, 4 * (1 - distance / 37.5))
  let alpha = facing ? 255 : 200
  let fade = strength * (facing ? 3 : 1.75)
  let hold = strength / (facing ? 1.5 : 3.5)
  if (previous) {
    if (facing) hold += Math.max(0, previous.start + previous.hold - now)
    if (previous.start + previous.hold + previous.fade > now) {
      fade = Math.max(fade, previous.fade)
      alpha = Math.max(alpha, previous.alpha)
    }
  }
  return { start: now, hold, fade, alpha }
}
export function flashOpacity(state: FlashState, now: number) {
  return (
    (state.alpha / 255) *
    Math.max(0, Math.min(1, 1 - Math.max(0, now - state.start - state.hold) / Math.max(0.001, state.fade)))
  )
}
export const SMOKE_CANISTER_SECONDS = 21.1
export const SMOKE_SIGHT_SECONDS = SMOKE_CANISTER_SECONDS + 4
export const SMOKE_VISUAL_SECONDS = 30
export function smokeOpacity(age: number) {
  return age < 0 || age >= SMOKE_VISUAL_SECONDS ? 0 : Math.max(0, 1 - (Math.max(0, age - 15) * 18) / 255)
}
export function smokeLength(from: Point, to: Point, center: Point, radius = 2.875) {
  const delta = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }
  const length = Math.hypot(delta.x, delta.y, delta.z)
  if (!length) return 0
  const direction = { x: delta.x / length, y: delta.y / length, z: delta.z / length }
  const offset = { x: center.x - from.x, y: center.y - from.y, z: center.z - from.z }
  const along = offset.x * direction.x + offset.y * direction.y + offset.z * direction.z
  const clamped = Math.max(0, Math.min(length, along))
  const close = {
    x: from.x + direction.x * clamped,
    y: from.y + direction.y * clamped,
    z: from.z + direction.z * clamped
  }
  const square = (close.x - center.x) ** 2 + (close.y - center.y) ** 2 + (close.z - center.z) ** 2
  if (square >= radius ** 2) return 0
  const fromInside = Math.hypot(offset.x, offset.y, offset.z) < radius
  const toInside = Math.hypot(to.x - center.x, to.y - center.y, to.z - center.z) < radius
  if (fromInside && toInside) return length
  const half = Math.sqrt(radius ** 2 - square)
  if (fromInside) return half + (along > 0 ? clamped : -clamped)
  if (toInside) {
    const passedCenter =
      (to.x - center.x) * direction.x + (to.y - center.y) * direction.y + (to.z - center.z) * direction.z > 0
    return half + (passedCenter ? length - clamped : clamped - length)
  }
  return half * 2
}
