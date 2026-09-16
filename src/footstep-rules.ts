export interface MovementPoint {
  x: number
  y: number
  z: number
}
export interface StepSound {
  impactSpeed?: number
  clip: string
  volume: number
  kind: 'step' | 'jump' | 'land'
}
export const AUDIBLE_STEP_SPEED = 150 * 0.025
const surfaces: Record<string, string> = {
  C: 'step',
  M: 'metal',
  D: 'dirt',
  V: 'duct',
  G: 'grate',
  T: 'tile',
  S: 'slosh',
  N: 'snow'
}

export function landingVolume(speed: number): number {
  const units = speed / 0.025
  if (units > 580) return 1
  if (units > 290) return 0.85
  return 0
}

export class FootstepRules {
  private left = false
  private nextStep = 0
  private grounded: boolean | undefined
  private previousSpeed = 0
  private fallSpeed = 0
  private material = 'C'

  constructor(private readonly random: () => number = Math.random) {}

  update(now: number, speed: number, vertical: number, grounded: boolean, material: string): StepSound | undefined {
    let result: StepSound | undefined
    if (grounded && this.grounded === false) {
      const volume = landingVolume(this.fallSpeed)
      if (volume) {
        this.nextStep = now + 0.3
        result = { ...this.sound(material, volume, 'land'), impactSpeed: this.fallSpeed }
      }
    } else if (!grounded && this.grounded && vertical > 1 && this.previousSpeed >= AUDIBLE_STEP_SPEED) {
      result = this.sound(this.material, 1, 'jump')
    }
    this.fallSpeed = grounded ? 0 : Math.max(this.fallSpeed, -vertical)
    this.grounded = grounded
    this.previousSpeed = speed
    if (grounded) this.material = material
    if (now < this.nextStep) return result
    if (speed <= AUDIBLE_STEP_SPEED) this.nextStep = now + 0.4
    else if (grounded) {
      this.nextStep = now + 0.3
      result = this.sound(material, material === 'D' ? 0.55 : material === 'V' ? 0.7 : 0.5, 'step')
    }
    return result
  }

  private sound(material: string, volume: number, kind: StepSound['kind']): StepSound {
    this.left = !this.left
    let variant = (this.random() < 0.5 ? 0 : 2) + (this.left ? 2 : 1)
    if (material === 'T' && this.random() < 0.2) variant = 5
    return { clip: `pl_${surfaces[material] ?? 'step'}${variant}.wav`, volume, kind }
  }
}

export class FootstepMotion {
  private position: MovementPoint | undefined
  private changedAt = 0
  horizontal = 0
  vertical = 0

  sample(position: MovementPoint, now: number): boolean {
    if (!this.position) return this.reset(position, now)
    const elapsed = now - this.changedAt
    const dx = position.x - this.position.x,
      dy = position.y - this.position.y,
      dz = position.z - this.position.z
    const distance = Math.hypot(dx, dy, dz)
    if (elapsed < 0 || elapsed > 0.75 || distance > 8) return this.reset(position, now)
    if (elapsed < 0.075) return false
    if (distance < 0.001) {
      if (elapsed > 0.2) this.horizontal = this.vertical = 0
      return false
    }
    if (Math.hypot(dx, dz) / elapsed > 10 || Math.abs(dy) / elapsed > 40) return this.reset(position, now)
    this.horizontal = Math.hypot(dx, dz) / elapsed
    this.vertical = dy / elapsed
    this.position = { ...position }
    this.changedAt = now
    return false
  }

  private reset(position: MovementPoint, now: number): boolean {
    this.position = { ...position }
    this.changedAt = now
    this.horizontal = this.vertical = 0
    return true
  }
}
