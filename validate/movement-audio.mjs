import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Client, labels, pause } from './team-client.mjs'
const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16')
const dir = resolve(process.argv[3] ?? 'validate/game/movement'),
  session = process.argv[4] ?? 'cs16-movement-review'
const run = promisify(execFile),
  evidence = { date: new Date().toISOString(), muted: true }
mkdirSync(dir, { recursive: true })
const read = (s, prefix) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith(prefix) ? [JSON.parse(v.TextShape.text.slice(prefix.length))] : []
  )
const match = (s) => read(s, 'review-move-state-')[0]
const mine = (s) => read(s, 'review-movement-').find((v) => v.address === match(s)?.address)
const key = (type, value, code, number, modifiers = 0) => c.key(type, value, code, number, modifiers)
async function stage(height = 10.6) {
  await c.command(`/move_player_to 21 ${height} 51`)
  await pause(850)
  await c.aimAt({ x: 21, y: 12.1, z: 75 })
  await pause(300)
}
async function collect(ms) {
  const samples = [],
    end = Date.now() + ms
  while (Date.now() < end) {
    const s = await c.snapshot()
    samples.push({
      at: Date.now() / 1000,
      ...mine(s),
      locomotion: s['1'].AvatarLocomotionSettings,
      movementInfo: s['1'].AvatarMovementInfo
    })
    await pause(70)
  }
  return samples
}
try {
  await c.connect()
  await c.until((s) => labels(s).includes('Select a team') && match(s)?.health, 'lobby', 60000)
  await c.join(1)
  await c.until((s) => match(s)?.match.phase === 'live', 'live', 20000)
  const [w, h] = await c.evaluate('[innerWidth,innerHeight]'),
    k = Math.min(w / 640, h / 480)
  await c.click((w - 640 * k) / 2 + 150 * k, (h - 480 * k) / 2 + (126 + 8 * 28) * k)
  await c.until((s) => s['2'].PointerLock?.isPointerLocked, 'pointer capture')
  await key('keyDown', '3', 'Digit3', 51)
  await pause(80)
  await key('keyUp', '3', 'Digit3', 51)
  await c.until((s) => match(s)?.weapon.name === 'Knife', 'knife')
  await stage()
  evidence.start = { player: (await c.snapshot())['1'], movement: mine(await c.snapshot()) }
  await key('keyDown', 'Shift', 'ShiftLeft', 16)
  await key('keyDown', 'w', 'KeyW', 87, 8)
  evidence.walk = await collect(1200)
  await key('keyDown', 'd', 'KeyD', 68, 8)
  evidence.diagonalWalk = await collect(1000)
  await key('keyUp', 'd', 'KeyD', 68, 8)
  await key('keyUp', 'w', 'KeyW', 87, 8)
  await key('keyUp', 'Shift', 'ShiftLeft', 16)
  const walked = mine(await c.snapshot())
  assert.equal(walked.total, evidence.start.movement.total, 'Shift walk and W+D produce no CS footsteps')
  assert.ok(Math.hypot(walked.position.x - 21, walked.position.z - 51) > 3, 'real walking displacement')
  await stage()
  const baseline = mine(await c.snapshot()).total
  await key('keyDown', 'w', 'KeyW', 87)
  evidence.run = await collect(1700)
  await key('keyUp', 'w', 'KeyW', 87)
  await pause(350)
  let s = await c.snapshot(),
    trace = mine(s)
  assert.ok(trace.total >= baseline + 3, 'running emits footsteps')
  evidence.runAudio = Object.values(s).filter((v) => v.AudioSource?.audioClipUrl.startsWith('assets/sounds/movement/'))
  evidence.preload = Object.values(s).filter((v) => v.AssetLoad?.assets?.some((p) => p.includes('/movement/')))
  assert.ok(evidence.runAudio.length, 'original audio is scheduled')
  const stopped = trace.total
  await pause(700)
  assert.equal(mine(await c.snapshot()).total, stopped, 'stopped player is silent')
  await run('agent-browser', ['--session', session, 'screenshot', `${dir}/movement.png`])
  await stage()
  await key('keyDown', ' ', 'Space', 32)
  await pause(80)
  await key('keyUp', ' ', 'Space', 32)
  evidence.stationaryJump = await collect(1100)
  assert.ok(
    evidence.stationaryJump.some((v) => !v.grounded),
    'jump leaves floor'
  )
  assert.ok(
    evidence.stationaryJump.every(
      (v) => !v.events.some((e) => e.kind === 'jump' && e.at > evidence.stationaryJump[0].at - 0.2)
    ),
    'stationary takeoff silent'
  )
  await stage()
  await key('keyDown', 'w', 'KeyW', 87)
  await pause(650)
  const jumpAt = Date.now() / 1000
  await key('keyDown', ' ', 'Space', 32)
  await pause(80)
  await key('keyUp', ' ', 'Space', 32)
  evidence.runningJump = await collect(1100)
  await key('keyUp', 'w', 'KeyW', 87)
  assert.ok(
    evidence.runningJump.some((v) => v.events.some((e) => e.kind === 'jump' && e.at >= jumpAt)),
    'running takeoff sound'
  )
  await c.command('/move_player_to 21 17 51')
  evidence.fall = await collect(1800)
  const events = mine(await c.snapshot()).events
  evidence.fallEvents = events
  assert.ok(
    events.some((e) => e.kind === 'land'),
    'high landing sound'
  )
  evidence.final = mine(await c.snapshot())
  writeFileSync(`${dir}/browser.json`, JSON.stringify(evidence, null, 2) + '\n')
  console.log('PASS: silent Shift/W+D, running footsteps, audio scheduling, stopping, jump takeoff and high landing')
} catch (error) {
  evidence.failure = String(error)
  evidence.snapshot = await c.snapshot().catch(() => null)
  writeFileSync(`${dir}/failure.json`, JSON.stringify(evidence, null, 2) + '\n')
  throw error
} finally {
  for (const [v, code, n] of [
    ['w', 'KeyW', 87],
    ['d', 'KeyD', 68],
    ['Shift', 'ShiftLeft', 16],
    [' ', 'Space', 32]
  ])
    await key('keyUp', v, code, n).catch(() => {})
  c.socket.close()
}
