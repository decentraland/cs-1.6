import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Client, labels, pause } from './team-client.mjs'
const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16'),
  dir = resolve(process.argv[3] ?? 'validate/game/falling'),
  session = process.argv[4] ?? 'cs16-falling-review'
const noReports = process.argv[5] === 'no-reports'
const run = promisify(execFile),
  evidence = { date: new Date().toISOString(), muted: true, noReports, drops: [] }
const read = (s, prefix) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith(prefix) ? [JSON.parse(v.TextShape.text.slice(prefix.length))] : []
  )
const state = (s) => read(s, 'review-move-state-')[0]
const falls = (s) => read(s, 'review-fall-')
const motion = (s) => read(s, 'review-movement-').find((v) => v.address === state(s)?.address)
mkdirSync(dir, { recursive: true })
async function row(index) {
  const [w, h] = await c.evaluate('[innerWidth,innerHeight]'),
    k = Math.min(w / 640, h / 480)
  await c.click((w - 640 * k) / 2 + 150 * k, (h - 480 * k) / 2 + (126 + index * 28) * k)
  await pause(180)
}
async function capture(name) {
  await run('agent-browser', ['--session', session, 'screenshot', `${dir}/${name}.png`])
}
async function drop(height) {
  await c.command(`/move_player_to 21 ${height + 0.2} 51`)
  await pause(1000)
  await c.aimAt({ x: 21, y: height + 1.7, z: 90 })
  await pause(150)
  let s = await c.snapshot()
  const entry = { height, before: state(s), start: s['1'].Transform.position, fallCount: falls(s).length, samples: [] }
  assert.ok(Math.abs(entry.start.y - (height + 0.1)) < 0.2, 'standing on takeoff platform')
  await c.key('keyDown', 'w', 'KeyW', 87)
  const end = Date.now() + 8000
  try {
    while (Date.now() < end) {
      s = await c.snapshot()
      entry.samples.push({
        at: Date.now() / 1000,
        position: s['1'].Transform.position,
        state: state(s),
        motion: motion(s),
        velocity: s['1'].AvatarMovementInfo.actualVelocity
      })
      if (s['1'].Transform.position.y < 11 && motion(s)?.grounded) break
      await pause(80)
    }
  } finally {
    await c.key('keyUp', 'w', 'KeyW', 87)
  }
  assert.ok(s['1'].Transform.position.y < 11, 'walked off platform and landed on Dust2')
  await pause(600)
  s = await c.snapshot()
  entry.after = state(s)
  entry.falls = falls(s).slice(entry.fallCount)
  entry.audio = Object.values(s).filter((v) => v.AudioSource?.audioClipUrl.startsWith('assets/sounds/player/original/'))
  evidence.drops.push(entry)
  return entry
}
try {
  await c.connect()
  await c.until((s) => labels(s).includes('Select a team') && state(s)?.health, 'lobby', 60000)
  await c.join(2)
  await c.until((s) => state(s)?.health.current === 100, 'spawn', 15000)
  await c.evaluate('document.exitPointerLock()')
  await row(7)
  await c.until((s) => labels(s).includes('2 KEVLAR+HELMET'), 'equipment')
  await row(1)
  await c.until((s) => state(s)?.equipment.helmet, 'helmet purchase')
  await row(8)
  await row(8)
  await c.until((s) => s['2'].PointerLock?.isPointerLocked && state(s).match.phase === 'live', 'live capture', 15000)
  await c.key('keyDown', '3', 'Digit3', 51)
  await pause(70)
  await c.key('keyUp', '3', 'Digit3', 51)
  await pause(900)
  let s = await c.snapshot()
  assert.equal(state(s).health.current, 100, 'forged grounded landing cannot cause damage')
  evidence.initial = state(s)
  const safe = await drop(14)
  assert.equal(safe.after.health.current, 100, 'safe fall does not damage health')
  assert.equal(safe.after.health.armor, 100)
  const hurt = await drop(24)
  assert.ok(hurt.after.health.current < 100 && hurt.after.health.current > 0, 'higher fall hurts')
  assert.equal(hurt.after.health.armor, 100, 'armor bypassed without consumption')
  assert.equal(hurt.after.equipment.helmet, true)
  assert.deepEqual(hurt.after.stats, hurt.before.stats)
  assert.equal(hurt.after.money.amount, hurt.before.money.amount)
  assert.equal(hurt.falls.length, 1, 'one authoritative fall event')
  const result = hurt.falls[0]
  assert.equal(result.result.damage, Math.floor((result.speed / 0.025 - 500) * (100 / 600) * 1.25))
  assert.equal(hurt.after.health.current, 100 - result.result.damage)
  const native = hurt.samples
    .flatMap((v) => v.motion?.events ?? [])
    .filter((e) => e.kind === 'land' && e.at > hurt.samples[0].at)
    .at(-1)
  if (!noReports)
    assert.ok(native && Math.abs(native.impactSpeed - result.speed) < 0.001, 'validated native impact velocity is used')
  assert.ok(
    hurt.samples.some((v) => Math.abs(v.state.punch.roll) > 1),
    'responsive landing camera roll'
  )
  await capture('fall-hurt')
  await pause(800)
  assert.equal(state(await c.snapshot()).health.current, hurt.after.health.current, 'standing does not repeat damage')
  let lethal = await drop(24)
  for (let i = 0; i < 4 && lethal.after.health.current > 0; i++) lethal = await drop(24)
  assert.equal(lethal.after.health.current, 0, 'fatal fall kills')
  assert.equal(lethal.after.stats.deaths, lethal.before.stats.deaths + 1)
  assert.equal(lethal.after.stats.kills, lethal.before.stats.kills, 'world fall does not deduct a suicide frag')
  assert.equal(lethal.after.money.amount, lethal.before.money.amount, 'fall awards no kill money')
  assert.ok(
    lethal.audio.some((v) => v.AudioSource.audioClipUrl.endsWith('/bodysplat.wav')),
    'original splat for fatal excess damage'
  )
  await capture('fall-death')
  s = await c.until(
    (s) => state(s)?.health.current === 100 && state(s).match.round > lethal.after.match.round,
    'next round spawn',
    20000
  )
  evidence.respawn = state(s)
  await pause(1000)
  assert.equal(state(await c.snapshot()).health.current, 100, 'respawn teleport does not trigger fall damage')
  writeFileSync(`${dir}/${noReports ? 'no-reports' : 'browser'}.json`, JSON.stringify(evidence, null, 2) + '\n')
  console.log('PASS: false claim rejected; safe/damaging/fatal falls, armor, landing roll, scores, splat and respawn')
} catch (error) {
  evidence.failure = String(error)
  evidence.snapshot = await c.snapshot().catch(() => null)
  writeFileSync(`${dir}/failure.json`, JSON.stringify(evidence, null, 2) + '\n')
  throw error
} finally {
  await c.key('keyUp', 'w', 'KeyW', 87).catch(() => {})
  c.socket.close()
}
