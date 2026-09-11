import assert from 'node:assert/strict'
import { test } from 'node:test'
import { admitSpectator, admitToTeam, hasBothTeams, inTeamRound, teamRoundWinner, TEAM_CAPACITY } from '../src/team-rules.ts'
import { finishRound } from '../src/round-rules.ts'

function lobby() { return { roster: [], phase: 'waiting', round: 0, matchOver: false } }
function live() {
  const state = lobby()
  admitToTeam(state, 'ct', 2); admitToTeam(state, 't', 1)
  state.round = 1; state.phase = 'live'
  return state
}

test('a shared match needs both opposing teams and explicit admission', () => {
  const state = lobby()
  assert.equal(admitToTeam(state, 'visitor', 0), 'Choose Terrorists or Counter-Terrorists.')
  assert.equal(state.roster.length, 0)
  admitToTeam(state, 'ct', 2)
  assert.equal(hasBothTeams(state), false)
  admitToTeam(state, 't', 1)
  assert.equal(hasBothTeams(state), true)
  assert.equal(inTeamRound(state, 'ct'), false)
  state.round = 1
  assert.equal(inTeamRound(state, 'ct'), true)
  assert.equal(inTeamRound(state, 'visitor'), false)
})

test('spectators stay connected without occupying a team or entering combat', () => {
  const state = live()
  assert.equal(admitSpectator(state, 'viewer'), true)
  assert.deepEqual(state.roster.find(seat => seat.address === 'viewer'), { address: 'viewer', team: 0, connected: true, eligibleRound: 2 })
  assert.equal(admitSpectator(state, 'viewer'), false)
  assert.equal(hasBothTeams(state), true)
  assert.equal(inTeamRound(state, 'viewer'), false)
  assert.equal(teamRoundWinner(state, address => address !== 't', 80), 'ct')
  assert.equal(admitToTeam(state, 'viewer', 1), undefined)
  assert.equal(inTeamRound(state, 'viewer'), false)
  state.round++
  assert.equal(inTeamRound(state, 'viewer'), true)
})

test('late joins during freeze or live cannot shoot or keep an eliminated team alive', () => {
  for (const phase of ['freeze', 'live']) {
    const state = live(); state.phase = phase
    admitToTeam(state, 'late-t', 1)
    assert.equal(inTeamRound(state, 'late-t'), false)
    state.phase = 'live'
    assert.equal(teamRoundWinner(state, address => address !== 't', 80), 'ct')
    state.round++
    assert.equal(inTeamRound(state, 'late-t'), true)
  }
})

test('duplicate admission cannot reset eligibility or grant a second life', () => {
  const state = live()
  const before = structuredClone(state)
  assert.equal(admitToTeam(state, 't', 1), undefined)
  assert.deepEqual(state, before)
  assert.equal(teamRoundWinner(state, address => address !== 't', 100), 'ct')
})

test('leaving and rejoining cannot restore participation in the same round', () => {
  const state = live()
  state.roster[1].connected = false
  assert.equal(teamRoundWinner(state, () => true, 100), 'ct')
  assert.equal(admitToTeam(state, 't', 2), 'You can change teams between rounds.')
  admitToTeam(state, 't', 1)
  assert.equal(inTeamRound(state, 't'), false)
  assert.equal(teamRoundWinner(state, () => true, 100), 'ct')
})

test('capacity counts connected seats and repeated messages cannot overfill a team', () => {
  const state = lobby()
  for (let i = 0; i < TEAM_CAPACITY; i++) assert.equal(admitToTeam(state, `t${i}`, 1), undefined)
  assert.equal(admitToTeam(state, 'extra', 1), 'That team is full.')
  assert.equal(admitToTeam(state, 't0', 1), undefined)
  state.roster[0].connected = false
  assert.equal(admitToTeam(state, 'extra', 1), undefined)
  assert.equal(admitToTeam(state, 't0', 1), 'That team is full.')
})

test('elimination, unplanted timeout, and both teams absent have distinct outcomes', () => {
  const state = live()
  assert.equal(teamRoundWinner(state, () => true, 120), undefined)
  assert.equal(teamRoundWinner(state, () => true, 0), 'ct')
  assert.equal(teamRoundWinner(state, address => address === 't', 80), 't')
  assert.equal(teamRoundWinner(state, address => address === 'ct', 80), 'ct')
  assert.equal(teamRoundWinner(state, () => false, 80), 'draw')
  state.phase = 'freeze'
  assert.equal(teamRoundWinner(state, () => false, 0), undefined)
})

test('a drawn round awards no point and cannot be processed twice', () => {
  const state = { phase: 'live', ctScore: 4, tScore: 7, maxWins: 16, matchOver: false, timeLeft: 20 }
  assert.equal(finishRound(state, 'draw'), true)
  assert.equal(state.phase, 'draw')
  assert.equal(state.ctScore, 4); assert.equal(state.tScore, 7)
  assert.equal(state.timeLeft, 5)
  assert.equal(finishRound(state, 'ct'), false)
})
