import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Client, pause, labels } from './team-client.mjs'
const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16'),
  dir = resolve(process.argv[3] ?? 'validate/game/bot-movement'),
  run = promisify(execFile)
const read = (s) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith('review-bot-state-') ? [JSON.parse(v.TextShape.text.slice(17))] : []
  )[0]
const evidence = { date: new Date().toISOString(), muted: true }
const speed = (s) => Math.hypot(s.velocity.x, s.velocity.z)
async function key(name, code, vk) {
  await c.key('keyDown', name, code, vk)
  await pause(60)
  await c.key('keyUp', name, code, vk)
}
async function mode(expected) {
  await key('4', 'Digit4', 52)
  await c.until((s) => read(s)?.mode === expected, 'mode ' + expected)
  await pause(300)
}
async function collect(ms) {
  const a = [],
    end = Date.now() + ms
  while (Date.now() < end) {
    a.push(read(await c.snapshot()))
    await pause(60)
  }
  return a
}
async function hit() {
  const before = read(await c.snapshot())
  await c.aimAt({ ...before.position, y: before.position.y + 1.225 })
  await c.shoot(40)
  return c.until((s) => read(s)?.bot.health < before.bot.health, 'real gun hit', 6000)
}
mkdirSync(dir, { recursive: true })
try {
  await c.connect()
  const initial = await c.until((s) => labels(s).includes('Select a team') || read(s), 'scene', 60000)
  if (labels(initial).includes('Select a team')) await c.join(2)
  await c.until((s) => read(s) && labels(s).includes('0 CANCEL'), 'spawn and buy menu', 20000)
  const [w, h] = await c.evaluate('[innerWidth,innerHeight]'),
    k = Math.min(w / 640, h / 480)
  await c.click((w - 640 * k) / 2 + 150 * k, (h - 480 * k) / 2 + (126 + 8 * 28) * k)
  await c.until(
    (s) => s['2'].PointerLock?.isPointerLocked && read(s)?.bot.alive && !labels(s).includes('Prepare to fight!'),
    'live',
    20000
  )
  await c.command('/move_player_to 21 11 52')
  await pause(1500)
  await key('2', 'Digit2', 50)
  await pause(1100)
  await mode(1)
  evidence.run = await collect(1500)
  assert.ok(
    evidence.run.some((s) => speed(s) > 5.4),
    'bot reaches AK running speed'
  )
  evidence.pistolHit = read(await hit())
  evidence.pistol = await collect(3000)
  const small = evidence.pistol
    .flatMap((s) => s.recent)
    .filter((row) => row[0] >= evidence.pistolHit.at - 0.1 && row[8] < 100)
  assert.ok(
    small.some((row) => row[7] < 0.7),
    'USP hit applies small flinch'
  )
  assert.ok(
    small.some((row) => Math.hypot(row[4], row[6]) < 2),
    'USP hit slows actual server movement'
  )
  assert.equal(evidence.pistol.at(-1).modifier, 1, 'bot recovers from pistol hit')
  await mode(2)
  await pause(500)
  await key('1', 'Digit1', 49)
  await pause(1500)
  const before = read(await c.snapshot())
  evidence.rifleBefore = before
  evidence.rifleHit = read(await hit())
  evidence.rifle = await collect(2200)
  const large = evidence.rifle
    .flatMap((s) => s.recent)
    .filter((row) => row[0] >= evidence.rifleHit.at - 0.15 && row[8] < 100)
  assert.ok(
    large.some((row) => row[7] >= 0.65 && row[7] < 0.8),
    'M4A1 hit applies large flinch'
  )
  assert.ok(
    large.some((row) => row[6] > 1),
    'M4A1 pushes the stopped bot away from the shooter'
  )
  assert.ok(evidence.rifle.at(-1).position.z > before.position.z + 0.04, 'knockback moves the rendered entity')
  assert.equal(evidence.rifle.at(-1).modifier, 1)
  await run('agent-browser', ['--session', 'cs16-bot-review', 'screenshot', `${dir}/hit-bot.png`])
  await mode(3)
  evidence.walk = await collect(2000)
  assert.ok(
    evidence.walk.some((s) => Math.abs(speed(s) - 5.525 * 0.52) < 0.08),
    'bot walking reaches 52 percent'
  )
  assert.ok(
    evidence.walk.every((s) => speed(s) < 3),
    'bot walking does not become running'
  )
  await mode(4)
  await pause(500)
  await key('2', 'Digit2', 50)
  await pause(900)
  evidence.death = []
  for (let i = 0; i < 6 && read(await c.snapshot()).bot.alive; i++) {
    evidence.death.push(read(await hit()))
    await pause(450)
  }
  assert.equal(read(await c.snapshot()).bot.alive, false, 'real shots kill the visible bot')
  const dead = read(await c.snapshot())
  await pause(500)
  const later = read(await c.snapshot())
  assert.deepEqual(later.position, dead.position, 'dead bot stops moving')
  assert.equal(speed(later), 0, 'death clears movement velocity')
  await run('agent-browser', ['--session', 'cs16-bot-review', 'screenshot', `${dir}/dead-bot.png`])
  writeFileSync(`${dir}/browser.json`, JSON.stringify(evidence, null, 2) + '\n')
  console.log('PASS: visible bot running/walking, real USP slowdown, M4A1 knockback, recovery and death stop')
} catch (error) {
  evidence.failure = String(error)
  evidence.last = read(await c.snapshot())
  writeFileSync(`${dir}/failure.json`, JSON.stringify(evidence, null, 2) + '\n')
  throw error
} finally {
  c.socket.close()
}
