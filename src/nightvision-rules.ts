export const NIGHTVISION_COOLDOWN = 0.3
export const NIGHTVISION_ALPHA_MIN = 30
export const NIGHTVISION_ALPHA_MAX = 220
export const NIGHTVISION_ALPHA_STEP = 20
export const NIGHTVISION_TINT = { r: 50 / 255, g: 225 / 255, b: 50 / 255, a: 110 / 255 }
export const NIGHTVISION_LIGHT_COLOR = { r: 50 / 255, g: 1, b: 50 / 255 }

export function canUseNightVision(
  owned: boolean,
  alive: boolean,
  eligible: boolean,
  phase: string,
  matchOver: boolean
) {
  return owned && alive && eligible && !matchOver && ['freeze', 'live', 'won', 'lost', 'draw'].includes(phase)
}
