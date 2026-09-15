import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rankScores } from '../src/scoreboard.ts'

test('scoreboard ranks by kills, then fewer deaths, without mutating the synced roster', () => {
  const roster = [
    { name: 'Guerilla', kills: 0, deaths: 0 },
    { name: 'Phoenix', kills: 2, deaths: 3 },
    { name: 'Arctic', kills: 2, deaths: 1 }
  ]
  assert.deepEqual(
    rankScores(roster).map((p) => p.name),
    ['Arctic', 'Phoenix', 'Guerilla']
  )
  assert.equal(roster[0].name, 'Guerilla')
})
