import type { HitGroup } from './ballistics'
export const PLAYER_SOUNDS = [
  'bhit_flesh-1',
  'bhit_flesh-2',
  'bhit_flesh-3',
  'bhit_helmet-1',
  'bhit_kevlar-1',
  'headshot1',
  'headshot2',
  'headshot3',
  'die1',
  'die2',
  'die3',
  'death6',
  'bodysplat',
  'kit-pickup'
] as const
export type PlayerSound = (typeof PLAYER_SOUNDS)[number]
export function playerVoice(
  group: HitGroup,
  armored: boolean,
  helmet: boolean,
  dead: boolean,
  random = Math.random
): PlayerSound {
  if (dead) return (['die1', 'die2', 'die3', 'death6'] as const)[Math.floor(random() * 4)]
  if (group === 'head') return helmet ? 'bhit_helmet-1' : (`headshot${1 + Math.floor(random() * 3)}` as PlayerSound)
  if (armored && group !== 'legs') return 'bhit_kevlar-1'
  return `bhit_flesh-${1 + Math.floor(random() * 3)}` as PlayerSound
}
