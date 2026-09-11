export interface RoundState {
  phase: string
  ctScore: number
  tScore: number
  maxWins: number
  matchOver: boolean
  timeLeft: number
}

export function finishRound(state: RoundState, winner: 'ct' | 't' | 'draw'): boolean {
  if (state.phase !== 'live') return false
  if (winner === 'ct') state.ctScore++
  else if (winner === 't') state.tScore++
  state.phase = winner === 'draw' ? 'draw' : winner === 'ct' ? 'won' : 'lost'
  state.matchOver = Math.max(state.ctScore, state.tScore) >= state.maxWins
  state.timeLeft = 5
  return true
}
