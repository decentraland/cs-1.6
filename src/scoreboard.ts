export interface ScoreEntry {
  name: string
  kills: number
  deaths: number
}

export function rankScores<T extends ScoreEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name))
}
