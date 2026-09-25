import type { KnifeAttack } from './knife-rules'

const KNIFE_SOUNDS = [
  'knife_swing',
  'knife_slash2',
  'knife_hit',
  'knife_hit2',
  'knife_hit3',
  'knife_hit4',
  'knife_stab',
  'knife_hitwall1',
  'knife_deploy1'
] as const
export type KnifeSound = (typeof KNIFE_SOUNDS)[number]
export function isKnifeSound(value: string): value is KnifeSound {
  return KNIFE_SOUNDS.some((sound) => sound === value)
}
export function knifeFeedback(
  attack: KnifeAttack,
  contact: boolean,
  target: boolean,
  random = Math.random
): { sound: KnifeSound; pitch: number } {
  if (!contact) return { sound: random() < 0.5 ? 'knife_slash2' : 'knife_swing', pitch: 0.94 }
  if (!target) return { sound: 'knife_hitwall1', pitch: (98 + Math.floor(random() * 4)) / 100 }
  if (attack === 'stab') return { sound: 'knife_stab', pitch: 1 }
  return {
    sound: (['knife_hit', 'knife_hit2', 'knife_hit3', 'knife_hit4'] as const)[Math.floor(random() * 4)],
    pitch: 1
  }
}
