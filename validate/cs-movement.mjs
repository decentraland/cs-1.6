import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client, labels, pause } from './team-client.mjs'
const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16'),
  dir = resolve(process.argv[3] ?? 'validate/game/movement-control')
const state = (s) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith('review-move-state-{')
      ? [JSON.parse(v.TextShape.text.slice('review-move-state-'.length))]
      : []
  )[0]
const evidence = { date: new Date().toISOString(), muted: true }
let shift = false
const key = async (name, down) => {
  if (name === 'Shift') shift = down
  const keys = {
    w: ['KeyW', 87],
    s: ['KeyS', 83],
    d: ['KeyD', 68],
    Shift: ['ShiftLeft', 16],
    Space: ['Space', 32],
    e: ['KeyE', 69],
    f: ['KeyF', 70]
  }
  const [code, vk] = keys[name]
  await c.key(
    down ? 'keyDown' : 'keyUp',
    name === 'Space' ? ' ' : shift && name.length === 1 ? name.toUpperCase() : name,
    code,
    vk,
    shift ? 8 : 0
  )
}
const tap = async (name) => {
  await key(name, true)
  await pause(60)
  await key(name, false)
}
async function collect(ms) {
  const samples = [],
    until = Date.now() + ms
  while (Date.now() < until) {
    const s = await c.snapshot()
    samples.push({ at: Date.now() / 1000, position: s['1'].Transform.position, ...state(s) })
    await pause(50)
  }
  return samples
}
const speed = (s) => Math.hypot(s.native?.actualVelocity?.x ?? 0, s.native?.actualVelocity?.z ?? 0)
async function reset() {
  await c.command('/move_player_to 21 11 51')
  await pause(1200)
  await c.aimAt({ x: 21, y: 11.626, z: 90 })
  await pause(100)
}
mkdirSync(dir, { recursive: true })
try {
  await c.connect()
  await c.until((s) => labels(s).includes('Select a team') && state(s)?.health, 'lobby', 60000)
  await c.join(2)
  await c.until((s) => state(s)?.health.current === 100, 'spawn')
  const [w, h] = await c.evaluate('[innerWidth,innerHeight]'),
    k = Math.min(w / 640, h / 480)
  await c.click((w - 640 * k) / 2 + 150 * k, (h - 480 * k) / 2 + (126 + 8 * 28) * k)
  await c.until((s) => s['2'].PointerLock?.isPointerLocked && state(s)?.match.phase === 'live', 'live', 20000)
  await c.key('keyDown', '3', 'Digit3', 51)
  await pause(60)
  await c.key('keyUp', '3', 'Digit3', 51)
  await reset()
  evidence.initial = await collect(200)
  await key('w', true)
  evidence.run = await collect(1400)
  await key('w', false)
  evidence.stop = await collect(1000)
  assert.ok(
    evidence.run.some((s) => speed(s) > 6.1),
    'reaches 250 HU/s with knife'
  )
  assert.ok(
    evidence.run.some((s) => speed(s) > 0.2 && speed(s) < 5),
    'accelerates through intermediate speeds'
  )
  assert.ok(speed(evidence.stop.at(-1)) < 0.05, 'friction stops the released player')
  await reset()
  await key('Shift', true)
  await key('w', true)
  await key('d', true)
  evidence.walk = await collect(1200)
  await key('w', false)
  await key('d', false)
  await key('Shift', false)
  assert.ok(
    evidence.walk.some((s) => Math.abs(speed(s) - 3.25) < 0.08),
    'diagonal walk reaches 52 percent'
  )
  assert.ok(
    evidence.walk.every((s) => speed(s) < 3.4),
    'diagonal walk never becomes run speed'
  )
  await reset()
  await key('w', true)
  await collect(900)
  await key('w', false)
  await key('s', true)
  evidence.counter = await collect(400)
  await key('s', false)
  assert.ok(
    evidence.counter.some((s) => (s.native?.actualVelocity?.z ?? 0) < -1),
    'counter-strafe reverses velocity'
  )
  await reset()
  const start = (await c.snapshot())['1'].Transform.position
  await key('Space', true)
  evidence.jump = await collect(1700)
  await key('Space', false)
  const height = Math.max(...evidence.jump.map((s) => s.position.y)) - start.y
  assert.ok(height > 1 && height < 1.25, 'standing jump apex is approximately 45 HU: ' + height)
  assert.ok(Math.abs(evidence.jump.at(-1).position.y - start.y) < 0.15, 'holding space lands without repeated jumping')
  await reset()
  await key('w', true)
  await collect(1000)
  await tap('f')
  evidence.small = await collect(1800)
  await key('w', false)
  assert.ok(
    evidence.small.some((s) => s.control.modifier < 0.7),
    'pistol hit begins small flinch'
  )
  assert.ok(
    evidence.small.some((s) => speed(s) < 2),
    'pistol hit slows actual movement'
  )
  assert.ok(evidence.small.at(-1).control.modifier === 1, 'small flinch recovers')
  await reset()
  await tap('e')
  evidence.large = await collect(1500)
  assert.ok(
    evidence.large.some((s) => s.control.modifier < 0.8),
    'rifle hit begins large flinch'
  )
  assert.ok(
    evidence.large.some((s) => (s.native?.actualVelocity?.z ?? 0) < -0.2),
    'rifle hit pushes away from attacker'
  )
  assert.ok(
    evidence.large.at(-1).position.z < evidence.large[0].position.z - 0.03,
    'rifle impulse displaces the actual player away from the attacker'
  )
  assert.ok(evidence.large.at(-1).control.modifier === 1, 'large flinch recovers')
  await c.command('/move_player_to 21 14.2 51')
  await pause(1200)
  evidence.platform = await collect(200)
  assert.ok(
    evidence.platform.every((s) => s.control.grounded && Math.abs(s.position.y - 14.1) < 0.04),
    'stands on a native box outside the BSP'
  )
  await c.aimAt({ x: 21, y: 15.7, z: 90 })
  await key('Space', true)
  evidence.platformJump = await collect(1400)
  await key('Space', false)
  assert.ok(Math.max(...evidence.platformJump.map((s) => s.position.y)) > 15.1, 'can jump from native platform')
  assert.ok(Math.abs(evidence.platformJump.at(-1).position.y - 14.1) < 0.05, 'lands on native platform')
  const readFalls = (s) =>
    Object.values(s)
      .flatMap((v) => (v.TextShape?.text.startsWith('review-fall-') ? [JSON.parse(v.TextShape.text.slice(12))] : []))
      .sort((a, b) => a.at - b.at)
  evidence.drops = []
  for (const height of [14, 24, 24]) {
    await c.command(`/move_player_to 21 ${height + 0.2} 51`)
    await pause(1200)
    await c.aimAt({ x: 21, y: height + 1.7, z: 90 })
    const before = state(await c.snapshot())
    await key('w', true)
    const samples = await collect(2400)
    await key('w', false)
    await pause(700)
    const snapshot = await c.snapshot(),
      after = state(snapshot),
      falls = readFalls(snapshot),
      entry = { height, before, after, samples, falls }
    evidence.drops.push(entry)
    assert.ok(
      samples.some((s) => s.position.y < 11),
      'leaves platform and lands on Dust2'
    )
    if (height === 14)
      assert.equal(after.health.current, before.health.current, 'short fall stays below damage threshold')
    else {
      assert.ok(after.health.current < before.health.current, 'CS gravity produces damaging high fall')
      const fall = falls.at(-1)
      assert.equal(fall.previousHealth, before.health.current, 'fall event belongs to this drop')
      assert.equal(fall.result.damage, Math.floor((fall.speed / 0.025 - 500) * (100 / 600) * 1.25))
    }
  }
  assert.equal(evidence.drops.at(-1).after.health.current, 0, 'repeat high fall kills')
  const respawn = await c.until(
    (s) => state(s)?.health.current === 100 && state(s)?.match.round > evidence.drops.at(-1).after.match.round,
    'respawn',
    20000
  )
  evidence.respawn = state(respawn)
  assert.equal(evidence.respawn.control.modifier, 1, 'round reset clears flinch')
  assert.ok(!evidence.respawn.requested, 'frozen round releases custom movement')
  writeFileSync(`${dir}/browser.json`, JSON.stringify(evidence, null, 2) + '\n')
  console.log('PASS: ground/air movement, walking diagonal, counter-strafe, jump and actual-velocity hit reactions')
} catch (error) {
  evidence.failure = String(error)
  evidence.last = await collect(200)
  writeFileSync(`${dir}/failure.json`, JSON.stringify(evidence, null, 2) + '\n')
  throw error
} finally {
  for (const name of ['w', 's', 'd', 'Shift', 'Space']) await key(name, false)
  c.socket.close()
}
