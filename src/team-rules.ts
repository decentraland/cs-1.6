export type PlayingTeam = 1 | 2
export interface TeamSeat {
  address: string
  team: number
  eligibleRound: number
  connected: boolean
}
export interface TeamRoundState {
  phase: string
  round: number
  matchOver: boolean
  roster: TeamSeat[]
}
type TeamRoundView = Omit<TeamRoundState, 'roster'> & { roster: readonly TeamSeat[] }
export const TEAM_CAPACITY = 5
export const PLAYER_TIMEOUT = 20

export function admitSpectator(state: TeamRoundState, address: string): boolean {
  const seat = state.roster.find(player => player.address === address)
  if (seat?.team === 0 && seat.connected) return false
  const eligibleRound = state.round + 1
  if (seat) Object.assign(seat, { team: 0, connected: true, eligibleRound })
  else state.roster.push({ address, team: 0, connected: true, eligibleRound })
  return true
}

export function admitToTeam(state: TeamRoundState, address: string, team: number): string | undefined {
  if (team !== 1 && team !== 2) return 'Choose Terrorists or Counter-Terrorists.'
  const seat = state.roster.find(player => player.address === address)
  const active = state.phase === 'freeze' || state.phase === 'live'
  if (seat?.team === team && seat.connected) return undefined
  if (active && seat && seat.team !== 0 && seat.team !== team) return 'You can change teams between rounds.'
  if (state.roster.filter(player => player.address !== address && player.connected && player.team === team).length >= TEAM_CAPACITY) return 'That team is full.'
  const eligibleRound = state.round + 1
  if (seat) Object.assign(seat, { team, connected: true, eligibleRound })
  else state.roster.push({ address, team, connected: true, eligibleRound })
  return undefined
}

export function hasBothTeams(state: TeamRoundView): boolean {
  return [1, 2].every(team => state.roster.some(seat => seat.connected && seat.team === team))
}

export function inTeamRound(state: TeamRoundView, address: string): boolean {
  return state.roster.some(seat => seat.address === address && seat.connected && (seat.team === 1 || seat.team === 2) && seat.eligibleRound <= state.round)
}

export function teamRoundWinner(state: TeamRoundView, alive: (address: string) => boolean, timeLeft: number, bombPhase = 'none'): 'ct' | 't' | 'draw' | undefined {
  if (state.phase !== 'live') return undefined
  const survivors = state.roster.filter(seat => seat.connected && (seat.team === 1 || seat.team === 2) && seat.eligibleRound <= state.round && alive(seat.address))
  const t = survivors.some(seat => seat.team === 1)
  const ct = survivors.some(seat => seat.team === 2)
  if (bombPhase === 'defused') return 'ct'
  if (bombPhase === 'exploded') return 't'
  if (bombPhase === 'planted') return ct ? undefined : 't'
  if (!t && !ct) return 'draw'
  if (!t) return 'ct'
  if (!ct) return 't'
  if (timeLeft <= 0) return 'ct'
  return undefined
}
