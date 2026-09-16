import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { Client, pause } from './team-client.mjs'
const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16'),
  pid = process.argv[3]
assert.ok(/^[1-9][0-9]*$/.test(pid) && Number(pid) > 1, 'Pass the PID of an owned test authority')
const state = (s) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith('review-c4-') ? [JSON.parse(v.TextShape.text.slice(10))] : []
  )[0]
let stopped = false
try {
  await c.connect()
  await c.key('keyDown', '1', 'Digit1', 49)
  await c.key('keyUp', '1', 'Digit1', 49)
  await c.until((s) => state(s)?.weapon.name === 'AWP', 'AWP')
  await pause(1200)
  const before = state(await c.snapshot())
  execFileSync('kill', ['-STOP', pid])
  stopped = true
  await c.until((s) => state(s)?.input.stale, 'stale connection', 12000)
  await c.shoot(90)
  await pause(600)
  const stale = state(await c.snapshot())
  assert.ok(stale.input.down > before.input.down)
  assert.equal(stale.weapon.ammoClip, before.weapon.ammoClip)
  assert.equal(stale.weapon.lastShotId, before.weapon.lastShotId)
  execFileSync('kill', ['-CONT', pid])
  stopped = false
  await c.until((s) => !state(s)?.input.stale, 'connection recovered', 6000)
  const recovered = state(await c.snapshot())
  writeFileSync(
    process.argv[4] ?? 'validate/game/combat-recovery/reconnect.json',
    JSON.stringify({ passed: true, before, stale, recovered }, null, 2) + '\n'
  )
  console.log('PASS: stale connection blocks fire; resumes after authority returns')
} finally {
  if (stopped) execFileSync('kill', ['-CONT', pid])
  c.socket?.close()
}
