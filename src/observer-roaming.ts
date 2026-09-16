import type { Point } from './ballistics'
import { CS_FRICTION, CS_GROUND_ACCELERATION, CS_STOP_SPEED } from './cs-movement-rules'

export type ObserverMode = 'chase' | 'roaming'
export const OBSERVER_MODE_DELAY = 0.2
export const OBSERVER_MAX_SPEED = 500 * 0.025
const COMMAND_SPEED = 400 * 0.025

export class ObserverModes {
  private preferred: ObserverMode = 'chase'

  update(roamingAllowed: boolean, hasTarget: boolean, toggle = false): ObserverMode {
    if (!roamingAllowed) {
      this.preferred = 'chase'
      return 'chase'
    }
    if (toggle && hasTarget) this.preferred = this.preferred === 'chase' ? 'roaming' : 'chase'
    return hasTarget ? this.preferred : 'roaming'
  }

  reset() {
    this.preferred = 'chase'
  }
}

export class ObserverRoaming {
  position: Point = { x: 0, y: 0, z: 0 }
  velocity: Point = { x: 0, y: 0, z: 0 }

  reset(position = this.position) {
    this.position = { ...position }
    this.velocity = { x: 0, y: 0, z: 0 }
  }

  advance(direction: Point, forward: number, side: number, walking: boolean, dt: number, enabled = true): Point {
    if (!enabled || dt <= 0 || dt > 0.1 || !Number.isFinite(dt)) {
      this.reset()
      return this.position
    }
    const speed = Math.hypot(this.velocity.x, this.velocity.y, this.velocity.z)
    const scale =
      speed < 0.025 ? 0 : Math.max(0, speed - CS_FRICTION * 1.5 * Math.max(CS_STOP_SPEED, speed) * dt) / speed
    this.velocity.x *= scale
    this.velocity.y *= scale
    this.velocity.z *= scale
    const yaw = Math.atan2(direction.x, direction.z)
    const command = COMMAND_SPEED * (walking ? 0.52 : 1)
    const wish = {
      x: (direction.x * forward + Math.cos(yaw) * side) * command,
      y: direction.y * forward * command,
      z: (direction.z * forward - Math.sin(yaw) * side) * command
    }
    const length = Math.hypot(wish.x, wish.y, wish.z)
    if (length === 0) return this.position
    const normal = { x: wish.x / length, y: wish.y / length, z: wish.z / length }
    const desired = Math.min(OBSERVER_MAX_SPEED, length)
    const current = this.velocity.x * normal.x + this.velocity.y * normal.y + this.velocity.z * normal.z
    const add = desired - current
    if (add <= 0) return this.position
    const acceleration = Math.min(add, CS_GROUND_ACCELERATION * dt * desired)
    this.velocity.x += acceleration * normal.x
    this.velocity.y += acceleration * normal.y
    this.velocity.z += acceleration * normal.z
    this.position = {
      x: this.position.x + this.velocity.x * dt,
      y: this.position.y + this.velocity.y * dt,
      z: this.position.z + this.velocity.z * dt
    }
    return this.position
  }
}
