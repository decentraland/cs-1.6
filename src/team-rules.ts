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
export const BOT_FILL = 3
export const BOT_NAMES: readonly string[] = ['Guerilla', 'Phoenix', 'Arctic']

export const botAddress = (index: number) => `bot:${index}`
export const isBotAddress = (address: string) => address.startsWith('bot:')
export const botIndex = (address: string) => Number(address.slice(4))

export function hasHumans(state: TeamRoundView, team: number): boolean {
  return state.roster.some((seat) => seat.connected && seat.team === team && !isBotAddress(seat.address))
}

// Bots fill a playing side only while it has no human and the other side has one.
export function botFillTeam(state: TeamRoundView): number | undefined {
  return [1, 2].find((team) => !hasHumans(state, team) && hasHumans(state, 3 - team))
}

export function botTeam(state: TeamRoundView): number | undefined {
  return state.roster.find((seat) => isBotAddress(seat.address))?.team
}

export const isLobbyPhase = (phase: string) => phase === 'ready' || phase === 'waiting'

// Seats are frozen from freeze through the result phase so a human joining the bot side waits for the
// next round instead of ending this one or hiding bots that are still on the field.
export function fillBots(state: TeamRoundState, round: number) {
  if (isLobbyPhase(state.phase)) refillBots(state, round)
}

export function refillBots(state: TeamRoundState, round: number) {
  state.roster = state.roster.filter((seat) => !isBotAddress(seat.address))
  const team = botFillTeam(state)
  if (team === undefined) return
  for (let index = 0; index < BOT_FILL; index++)
    state.roster.push({ address: botAddress(index), team, eligibleRound: round, connected: true })
}

export function admitSpectator(state: TeamRoundState, address: string): boolean {
  const seat = state.roster.find((player) => player.address === address)
  if (seat?.team === 0 && seat.connected) return false
  const eligibleRound = state.round + 1
  if (seat) Object.assign(seat, { team: 0, connected: true, eligibleRound })
  else state.roster.push({ address, team: 0, connected: true, eligibleRound })
  return true
}

export function admitToTeam(state: TeamRoundState, address: string, team: number): string | undefined {
  if (team !== 1 && team !== 2) return 'Choose Terrorists or Counter-Terrorists.'
  const seat = state.roster.find((player) => player.address === address)
  const active = state.phase === 'freeze' || state.phase === 'live'
  if (seat?.team === team && seat.connected) return undefined
  if (active && seat && seat.team !== 0 && seat.team !== team) return 'You can change teams between rounds.'
  if (
    state.roster.filter(
      (player) =>
        player.address !== address && player.connected && player.team === team && !isBotAddress(player.address)
    ).length >= TEAM_CAPACITY
  )
    return 'That team is full.'
  const eligibleRound = state.round + 1
  if (seat) Object.assign(seat, { team, connected: true, eligibleRound })
  else state.roster.push({ address, team, connected: true, eligibleRound })
  return undefined
}

// A side counts only if someone connected on it can play the given round (the next one by default).
export function hasBothTeams(state: TeamRoundView, round = state.round + 1): boolean {
  return [1, 2].every((team) =>
    state.roster.some((seat) => seat.connected && seat.team === team && seat.eligibleRound <= round)
  )
}

export function inTeamRound(state: TeamRoundView, address: string): boolean {
  return state.roster.some(
    (seat) =>
      seat.address === address &&
      seat.connected &&
      (seat.team === 1 || seat.team === 2) &&
      seat.eligibleRound <= state.round
  )
}

export function teamRoundWinner(
  state: TeamRoundView,
  alive: (address: string) => boolean,
  timeLeft: number,
  bombPhase = 'none'
): 'ct' | 't' | 'draw' | undefined {
  if (state.phase !== 'live') return undefined
  const survivors = state.roster.filter(
    (seat) =>
      seat.connected && (seat.team === 1 || seat.team === 2) && seat.eligibleRound <= state.round && alive(seat.address)
  )
  const t = survivors.some((seat) => seat.team === 1)
  const ct = survivors.some((seat) => seat.team === 2)
  if (bombPhase === 'defused') return 'ct'
  if (bombPhase === 'exploded') return 't'
  if (bombPhase === 'planted') return ct ? undefined : 't'
  if (!t && !ct) return 'draw'
  if (!t) return 'ct'
  if (!ct) return 't'
  if (timeLeft <= 0) return 'ct'
  return undefined
}
