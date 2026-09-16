import type { Point, HitGroup } from './ballistics'
import type { GunId } from './weapon-profiles'

export const CS_GRAVITY = 800 * 0.025
export const CS_STOP_SPEED = 75 * 0.025
export const CS_GROUND_ACCELERATION = 5
export const CS_AIR_ACCELERATION = 10
export const CS_FRICTION = 4
export const CS_JUMP_SPEED = Math.sqrt(2 * 800 * 45) * 0.025
export const CS_AIR_WISH_CAP = 30 * 0.025
const LARGE_FLINCH: readonly string[] = [
  'scout',
  'aug',
  'sg550',
  'galil',
  'famas',
  'awp',
  'm3',
  'm4a1',
  'g3sg1',
  'deagle',
  'sg552',
  'ak47'
]
export function largeFlinch(gun: GunId | 'knife', group: HitGroup, ducking = false) {
  return !ducking && group !== 'legs' && LARGE_FLINCH.includes(gun)
}
export interface MovementInput {
  forward: number
  side: number
  yaw: number
  speed: number
  maxSpeed?: number
  jump: boolean
  grounded: boolean
  edge?: boolean
}
export class CsMovement {
  velocity: Point = { x: 0, y: 0, z: 0 }
  modifier = 1
  stamina = 0
  private jumpHeld = false

  reset(velocity: Point = { x: 0, y: 0, z: 0 }) {
    this.velocity = { ...velocity }
    this.modifier = 1
    this.stamina = 0
    this.jumpHeld = false
  }
  hit(large: boolean, source: Point, feet: Point) {
    if (large) {
      if (Math.hypot(this.velocity.x, this.velocity.y, this.velocity.z) >= 7.5) return false
      const dx = feet.x - source.x,
        dy = feet.y - source.y,
        dz = feet.z - source.z,
        length = Math.hypot(dx, dy, dz)
      if (length > 0) {
        this.velocity.x += (dx / length) * 4.25
        this.velocity.y += (dy / length) * 4.25
        this.velocity.z += (dz / length) * 4.25
      }
    }
    this.modifier = large ? 0.65 : 0.5
    return true
  }
  step(input: MovementInput, elapsed: number): Point {
    const dt = Math.max(0, Math.min(0.1, elapsed)),
      v = this.velocity
    this.stamina = Math.max(0, this.stamina - dt * 1000)
    let grounded = input.grounded
    if (grounded && this.modifier < 1) {
      this.modifier = Math.min(1, this.modifier + 0.01)
      v.x *= this.modifier
      v.y *= this.modifier
      v.z *= this.modifier
    }
    if (grounded && input.jump && !this.jumpHeld) {
      const speed = Math.hypot(v.x, v.y, v.z),
        cap = (input.maxSpeed ?? input.speed) * 1.2
      if (cap > 0 && speed > cap) {
        const ratio = (cap / speed) * 0.8
        v.x *= ratio
        v.z *= ratio
      }
      v.y = CS_JUMP_SPEED * (1 - this.stamina * 0.00019)
      this.stamina = 1315.789429
      grounded = false
    }
    this.jumpHeld = input.jump
    if (grounded) {
      v.y = 0
      const speed = Math.hypot(v.x, v.z)
      if (speed >= 0.0025) {
        const next = Math.max(0, speed - Math.max(speed, CS_STOP_SPEED) * CS_FRICTION * (input.edge ? 2 : 1) * dt)
        v.x *= next / speed
        v.z *= next / speed
      }
      const penalty = 1 - this.stamina * 0.00019
      v.x *= penalty
      v.z *= penalty
    } else v.y -= (CS_GRAVITY * dt) / 2
    const length = Math.hypot(input.forward, input.side),
      wishSpeed = input.speed * Math.min(1, length)
    if (length > 0 && wishSpeed > 0) {
      const x = (Math.sin(input.yaw) * input.forward + Math.cos(input.yaw) * input.side) / length
      const z = (Math.cos(input.yaw) * input.forward - Math.sin(input.yaw) * input.side) / length
      const add = (grounded ? wishSpeed : Math.min(CS_AIR_WISH_CAP, wishSpeed)) - (v.x * x + v.z * z)
      if (add > 0) {
        const acceleration = Math.min(add, (grounded ? CS_GROUND_ACCELERATION : CS_AIR_ACCELERATION) * wishSpeed * dt)
        v.x += acceleration * x
        v.z += acceleration * z
      }
    }
    if (grounded && Math.hypot(v.x, v.z) < 0.025) v.x = v.z = 0
    const requested = { ...v }
    if (!grounded) v.y -= (CS_GRAVITY * dt) / 2
    return requested
  }
}
