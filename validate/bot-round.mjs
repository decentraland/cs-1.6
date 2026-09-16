import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client, pause, labels } from './team-client.mjs'
const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16'),
  dir = resolve(process.argv[3] ?? 'validate/game/bot-movement')
const read = (s, prefix) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith(prefix) ? [JSON.parse(v.TextShape.text.slice(prefix.length))] : []
  )[0]
const bots = (s) => read(s, 'review-bot-round-'),
  player = (s) => read(s, 'review-move-state-')
const evidence = { date: new Date().toISOString(), muted: true, samples: [] }
mkdirSync(dir, { recursive: true })
try {
  await c.connect()
  let s = await c.until((s) => labels(s).includes('Select a team') || player(s), 'lobby', 60000)
  if (labels(s).includes('Select a team')) await c.join(2)
  s = await c.until(
    (s) =>
      bots(s)?.bots.length === 3 &&
      player(s)?.health.current > 0 &&
      (labels(s).includes('0 CANCEL') || s['2'].PointerLock?.isPointerLocked),
    'spawn',
    20000
  )
  if (labels(s).includes('0 CANCEL')) {
    const [w, h] = await c.evaluate('[innerWidth,innerHeight]'),
      k = Math.min(w / 640, h / 480)
    await c.click((w - 640 * k) / 2 + 150 * k, (h - 480 * k) / 2 + (126 + 8 * 28) * k)
  }
  s = await c.until((s) => s['2'].PointerLock?.isPointerLocked && player(s)?.match.phase === 'live', 'live', 20000)
  evidence.initial = { player: player(s), ...bots(s) }
  const target = bots(s).bots[0].position
  evidence.encounter = { x: target.x, y: target.y + 1, z: target.z + 4 }
  await c.command(`/move_player_to ${evidence.encounter.x} ${evidence.encounter.y} ${evidence.encounter.z}`)
  const end = Date.now() + 45000
  while (Date.now() < end) {
    s = await c.snapshot()
    evidence.samples.push({ player: player(s), ...bots(s), labels: labels(s) })
    if (player(s)?.health.current === 0) break
    await pause(120)
  }
  assert.equal(player(s)?.health.current, 0, 'normal bots can still shoot and kill the player')
  assert.ok(
    evidence.samples.some((s) => s.bots.some((b) => Math.hypot(b.velocity.x, b.velocity.z) > 0.5)),
    'normal AI moves visible bot entities'
  )
  s = await c.until((s) => labels(s).includes('Terrorists Win!'), 'round result', 10000)
  evidence.result = { player: player(s), ...bots(s), labels: labels(s) }
  assert.ok(
    evidence.result.match.botKills.reduce((a, b) => a + b, 0) >
      evidence.initial.match.botKills.reduce((a, b) => a + b, 0),
    'new bot kill is scored'
  )
  s = await c.until(
    (s) =>
      player(s)?.health.current === 100 &&
      player(s)?.match.round > evidence.initial.match.round &&
      player(s)?.match.phase === 'freeze',
    'next round',
    20000
  )
  evidence.respawn = { player: player(s), ...bots(s) }
  assert.ok(
    evidence.respawn.bots.every(
      (b) =>
        b.bot.alive &&
        b.bot.health === 100 &&
        b.modifier === 1 &&
        Math.hypot(b.velocity.x, b.velocity.y, b.velocity.z) === 0
    ),
    'all bot movement/health states reset on respawn'
  )
  writeFileSync(`${dir}/round.json`, JSON.stringify(evidence, null, 2) + '\n')
  console.log('PASS: normal bot movement, real bot gunfire/player death, scored round and fresh bot/player respawn')
} catch (error) {
  evidence.failure = String(error)
  writeFileSync(`${dir}/round-failure.json`, JSON.stringify(evidence, null, 2) + '\n')
  throw error
} finally {
  c.socket.close()
}
