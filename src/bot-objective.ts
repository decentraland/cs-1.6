import type { BombState } from './bomb-rules'
import { navDistance } from './navigation'
import type { NavPoint } from './navigation'

export const SOLO_BOMB_SITES: readonly NavPoint[] = [
  { x: 104.5, y: 10.026, z: 40.5 },
  { x: 33, y: 12.5861, z: 46.5 }
]
const SOLO_BOMB_DEFENSES: readonly (readonly NavPoint[])[] = [
  [
    { x: 100.5, y: 10.2341, z: 38.5 },
    { x: 102.5, y: 10.026, z: 44.5 },
    { x: 107.5, y: 10.026, z: 43 }
  ],
  [
    { x: 29, y: 11.6431, z: 44.5 },
    { x: 31, y: 12.5861, z: 50 },
    { x: 37, y: 12.5861, z: 43.5 }
  ]
]

export const botAddress = (index: number) => `bot:${index}`
const cycle = (value: number, length: number) => ((value % length) + length) % length

export function soloBombSite(round: number): NavPoint {
  return SOLO_BOMB_SITES[cycle(round - 1, SOLO_BOMB_SITES.length)]
}

export function soloBombCarrier(indexes: readonly number[], round: number): string {
  if (indexes.length === 0) return ''
  return botAddress(indexes[cycle(round - 1, indexes.length)])
}

export function soloBombObjectives(
  bots: readonly { index: number; alive: boolean; position: NavPoint }[],
  bomb: BombState,
  round: number
): Map<string, NavPoint> {
  const result = new Map<string, NavPoint>()
  if (bomb.phase === 'carried' || bomb.phase === 'planting') {
    if (bomb.carrier.startsWith('bot:')) result.set(bomb.carrier, soloBombSite(round))
    return result
  }
  if (bomb.phase === 'planted') {
    const defenses = SOLO_BOMB_DEFENSES[cycle(round - 1, SOLO_BOMB_DEFENSES.length)]
    for (const bot of bots) if (bot.alive) result.set(botAddress(bot.index), defenses[cycle(bot.index, defenses.length)])
    return result
  }
  if (bomb.phase !== 'dropped') return result
  const retriever = bots.filter(bot => bot.alive)
    .sort((a, b) => navDistance(a.position, bomb.position) - navDistance(b.position, bomb.position) || a.index - b.index)[0]
  if (retriever) result.set(botAddress(retriever.index), bomb.position)
  return result
}
