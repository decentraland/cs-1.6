import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Client, pause } from './team-client.mjs'
import { readKillFeed } from './read-kill-feed.mjs'
const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16')
const dir = resolve(process.argv[3] ?? 'validate/game/kill-feed')
const state = (s) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith('review-hit-state-{')
      ? [JSON.parse(v.TextShape.text.slice('review-hit-state-'.length))]
      : []
  )[0]
const tap = async () => {
  await c.key('keyDown', 'e', 'KeyE', 69)
  await pause(65)
  await c.key('keyUp', 'e', 'KeyE', 69)
}
async function screenshot(name) {
  const shot = await c.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(resolve(dir, name + '.png'), Buffer.from(shot.data, 'base64'))
}
try {
  await mkdir(dir, { recursive: true })
  await c.connect()
  await c.until((s) => !!state(s), 'scene ready', 60000)
  await c.join(2)
  await c.until((s) => state(s)?.match.phase === 'live', 'live round')
  await c.capture()
  await tap()
  const killed = await c.until(
    (s) => state(s)?.health.current === 0 && readKillFeed(s).length === 1,
    'server-confirmed headshot notice'
  )
  const first = readKillFeed(killed)[0]
  assert.equal(first.icon, 'ak47')
  assert.equal(first.headshot, true)
  assert.equal(first.killer, 'Review bot')
  await screenshot('headshot')
  await tap()
  const display = await c.until((s) => readKillFeed(s).length === 4, 'four visible notices')
  const rows = readKillFeed(display)
  assert.deepEqual(
    rows.map((row) => row.icon),
    ['ak47', 'galil', 'fiveseven', 'skull']
  )
  assert.deepEqual(
    rows.map((row) => row.headshot),
    [true, false, true, false]
  )
  assert.equal(rows[3].killer, '')
  assert.equal(rows[3].victim, 'Fallen Player')
  assert.ok(rows.every((row, index) => index === 0 || row.top > rows[index - 1].top))
  await screenshot('feed')
  await c.until((s) => readKillFeed(s).length === 0, 'feed clears after six seconds', 8000)
  await writeFile(
    resolve(dir, 'browser.json'),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        muted: true,
        firstProductionKill: first,
        displayFixtureRows: rows,
        checks: [
          'production human death sends headshot flag',
          'all three original icon sheets render',
          'four chronological notices',
          'headshot/body/world variants',
          'notices expire'
        ]
      },
      null,
      2
    ) + '\n'
  )
  console.log('PASS: confirmed headshot → original icon sheets and four rows → expiration')
} finally {
  c.socket.close()
}
