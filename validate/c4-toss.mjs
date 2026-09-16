import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client, pause, labels } from './team-client.mjs'
const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16'),
  dir = resolve(process.argv[3] ?? 'validate/game/c4-toss')
const read = (s, prefix) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith(prefix) ? [JSON.parse(v.TextShape.text.slice(prefix.length))] : []
  )[0]
const state = (s) => read(s, 'review-c4-'),
  toss = (s) => read(s, 'review-toss-'),
  boxes = (s) => read(s, 'review-boxes-') ?? []
const evidence = { date: new Date().toISOString(), muted: true }
async function key(value, shift = false) {
  if (shift) await c.key('keyDown', 'Shift', 'ShiftLeft', 16)
  await c.key('keyDown', value, 'Digit' + value, 48 + Number(value), shift ? 8 : 0)
  await pause(60)
  await c.key('keyUp', value, 'Digit' + value, 48 + Number(value), shift ? 8 : 0)
  if (shift) await c.key('keyUp', 'Shift', 'ShiftLeft', 16)
}
async function move(p) {
  await c.command(`/move_player_to ${p.x} ${p.y} ${p.z}`)
}
async function flight(name) {
  const samples = []
  evidence[name] = samples
  let s = await c.until((s) => state(s)?.bomb.phase === 'dropped', 'C4 leaves carrier', 5000)
  const end = Date.now() + 6000
  while (Date.now() < end) {
    samples.push({ state: state(s), toss: toss(s) })
    assert.equal(state(s).bomb.phase, 'dropped', 'no pickup while airborne')
    if (state(s).bomb.settled) return { samples, s }
    await pause(40)
    s = await c.snapshot()
  }
  throw new Error('C4 did not settle')
}
mkdirSync(dir, { recursive: true })
try {
  await c.connect()
  let s = await c.until((s) => labels(s).includes('Select a team') && state(s)?.health, 'lobby', 60000)
  await c.join(1)
  s = await c.until((s) => state(s)?.bomb.carrier && labels(s).includes('0 CANCEL'), 'spawn', 15000)
  const [w, h] = await c.evaluate('[innerWidth,innerHeight]'),
    k = Math.min(w / 640, h / 480)
  for (let i = 0; i < 3; i++) {
    await c.click((w - 640 * k) / 2 + 150 * k, (h - 480 * k) / 2 + (126 + 8 * 28) * k)
    await pause(700)
    if ((await c.snapshot())['2'].PointerLock?.isPointerLocked) break
  }
  await c.until((s) => s['2'].PointerLock?.isPointerLocked, 'capture')
  await move({ x: 21, y: 18, z: 60 })
  await pause(100)
  await c.aimAt({ x: 21, y: 19.6, z: 80 })
  s = await c.snapshot()
  evidence.freezeBefore = state(s)
  evidence.freezeFeet = s['1'].Transform.position
  assert.equal(evidence.freezeBefore.match.phase, 'freeze')
  await key('4', true)
  let f = await flight('freezeFlight')
  evidence.freezeFlight = f.samples
  s = f.s
  assert.ok(
    f.samples.some((v) => !v.state.bomb.settled && v.state.bomb.position.y > 15),
    'backpack visibly falls from height'
  )
  assert.ok(Math.abs(state(s).bomb.position.z - evidence.freezeFeet.z) > 2, 'forward toss travels before landing')
  assert.ok(toss(s).motion.settled)
  const ground = state(s).bomb.position
  await move({ ...ground, y: ground.y + 0.1 })
  s = await c.until((s) => state(s).bomb.phase === 'carried', 'freeze pickup', 5000)
  evidence.freezePickup = state(s)
  assert.equal(state(s).match.phase, 'freeze')
  await c.until((s) => state(s).match.phase === 'live', 'live', 30000)
  await move({ x: 21, y: 10.6, z: 60 })
  await pause(700)
  const feet = (await c.snapshot())['1'].Transform.position
  await c.aimAt({ x: feet.x, y: feet.y + 1.6 - 30, z: feet.z + 5 })
  await key('1')
  await pause(1600)
  await key('2', true)
  s = await c.until((s) => boxes(s).some((b) => b.data.gun === 'awp'), 'real AWP drop')
  const gunSamples = []
  for (let i = 0; i < 20; i++) {
    const b = boxes(s).find((b) => b.data.gun === 'awp')
    if (b) gunSamples.push(b)
    if (b?.motion.settled) break
    await pause(40)
    s = await c.snapshot()
  }
  evidence.gunFlight = gunSamples
  assert.ok(
    gunSamples.some((b) => b.motion.velocity.y > 0),
    'looking down gives the source upward body-pitch toss'
  )
  s = await c.until((s) => boxes(s).some((b) => b.data.gun === 'awp' && b.motion.settled), 'AWP lands')
  await move({ ...boxes(s).find((b) => b.data.gun === 'awp').motion.position, y: 10.6 })
  await c.until((s) => !boxes(s).some((b) => b.data.gun === 'awp'), 'AWP pickup')
  await key('4')
  await pause(850)
  await move({ x: 21, y: 45, z: 52 })
  s = await c.until((s) => state(s).health.current === 0, 'real fatal fall with C4', 10000)
  evidence.death = state(s)
  f = await flight('deathFlight')
  evidence.deathFlight = f.samples
  s = f.s
  assert.ok(
    f.samples.some((v) => !v.state.bomb.settled),
    'dead carrier also tosses its backpack'
  )
  assert.ok(
    f.samples.some((v) => ['won', 'lost'].includes(v.state.match.phase)),
    'toss continues through round result'
  )
  assert.ok(state(s).bomb.settled)
  s = await c.until((s) => state(s).match.round === 2 && state(s).health.current === 100, 'next round', 25000)
  evidence.reset = { state: state(s), toss: toss(s) }
  assert.equal(state(s).bomb.phase, 'carried')
  assert.equal(state(s).bomb.settled, false)
  assert.equal(toss(s).motion, undefined)
  assert.ok(!Object.values(s).some((v) => v.GltfContainer?.src.endsWith('/c4-drop.glb')))
  writeFileSync(`${dir}/browser.json`, JSON.stringify(evidence, null, 2) + '\n')
  console.log(
    'PASS: airborne C4 drop and pickup during freeze, body-pitch gun toss, real fatal carrier fall, post-round flight and reset'
  )
} catch (error) {
  evidence.failure = String(error)
  writeFileSync(`${dir}/failure.json`, JSON.stringify(evidence, null, 2) + '\n')
  throw error
} finally {
  c.socket.close()
}
