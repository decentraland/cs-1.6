import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'

const load = compile('kill-feed')
const { KillFeedState, deathIconKey } = load('kill-feed')
const { GUNS } = load('weapon-profiles')
const { DEATH_ICONS } = load('death-icons')
const notice = (victim) => ({ killer: 'CT', victim, weapon: 'AK-47', killerTeam: 2, victimTeam: 1, headshot: false })

test('every firearm and the knife have an original death icon, including MP5 naming', () => {
  for (const gun of Object.values(GUNS)) {
    const key = deathIconKey(gun.name)
    assert.notEqual(key, 'skull', gun.name)
    assert.ok(DEATH_ICONS[key])
    assert.equal(deathIconKey(gun.id), key)
  }
  assert.equal(deathIconKey('MP5'), 'mp5navy')
  assert.equal(deathIconKey('Knife'), 'knife')
})
test('explosives use the grenade icon and unknown/world causes use a skull', () => {
  assert.equal(deathIconKey('HE Grenade'), 'grenade')
  assert.equal(deathIconKey('C4'), 'grenade')
  for (const name of ['worldspawn', 'fall', 'constructor', 'missing']) assert.equal(deathIconKey(name), 'skull')
})
test('the feed keeps four kills in oldest-to-newest order and evicts the oldest on overflow', () => {
  const feed = new KillFeedState()
  for (let i = 0; i < 5; i++) feed.add(notice(String(i)), i * 0.1)
  assert.deepEqual(
    feed.entries(0.5).map((entry) => entry.victim),
    ['1', '2', '3', '4']
  )
  assert.equal(new Set(feed.entries(0.5).map((entry) => entry.id)).size, 4)
})
test('notices expire independently after six seconds and new kills do not extend old ones', () => {
  const feed = new KillFeedState()
  feed.add(notice('first'), 0)
  feed.add(notice('second'), 2)
  assert.equal(feed.entries(5.999).length, 2)
  assert.deepEqual(
    feed.entries(6).map((entry) => entry.victim),
    ['second']
  )
  feed.add(notice('third'), 7)
  assert.deepEqual(
    feed.entries(8).map((entry) => entry.victim),
    ['third']
  )
  assert.equal(feed.entries(13).length, 0)
})
test('headshot, suicide and team metadata are preserved independently for each confirmed kill', () => {
  const feed = new KillFeedState()
  feed.add({ ...notice('enemy'), headshot: true }, 0)
  feed.add({ ...notice('CT'), victimTeam: 2, suicide: true }, 1)
  const [headshot, suicide] = feed.entries(1)
  assert.equal(headshot.headshot, true)
  assert.equal(headshot.killerTeam, 2)
  assert.equal(headshot.victimTeam, 1)
  assert.equal(suicide.headshot, false)
  assert.equal(suicide.suicide, true)
})
