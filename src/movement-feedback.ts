interface Position { x: number; z: number }

export class HorizontalMotion {
  private previous: Position | undefined
  private sampledAt = 0
  speed = 0

  reset() { this.previous = undefined; this.sampledAt = 0; this.speed = 0 }

  sample(position: Position, now: number): number {
    if (!this.previous) {
      this.previous = { x: position.x, z: position.z }
      this.sampledAt = now
    } else if (now - this.sampledAt >= 0.1) {
      this.speed = Math.hypot(position.x - this.previous.x, position.z - this.previous.z) / (now - this.sampledAt)
      this.previous = { x: position.x, z: position.z }
      this.sampledAt = now
    }
    return this.speed
  }
}

export function updateMovementCrosshair(state: { spread: number; isMoving: boolean }, speed: number, walking: boolean, dt: number) {
  state.isMoving = !walking && speed > 3.5
  state.spread = Math.max(state.isMoving ? 0.8 : 0, state.spread - Math.max(0, dt) * 2)
}
