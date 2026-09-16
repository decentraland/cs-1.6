import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Client, pause, labels } from './team-client.mjs'
const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16')
const dir = resolve(process.argv[3] ?? 'validate/game/grenades'),
  session = process.argv[4] ?? 'cs16-grenade-review',
  run = promisify(execFile),
  evidence = {}
mkdirSync(dir, { recursive: true })
const tagged = (s, prefix) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith(prefix) ? [JSON.parse(v.TextShape.text.slice(prefix.length))] : []
  )
const state = (s) => tagged(s, 'review-state-')[0],
  grenades = (s) => tagged(s, 'review-grenade-')
async function row(index) {
  const [w, h] = await c.evaluate('[innerWidth,innerHeight]'),
    k = Math.min(w / 640, h / 480)
  await c.click((w - 640 * k) / 2 + 150 * k, (h - 480 * k) / 2 + (126 + index * 28) * k)
  await pause(250)
}
async function select(id) {
  for (let i = 0; i < 4; i++) {
    const before = state(await c.snapshot())
    if (before.inventory.active === id) return
    await c.key('keyDown', 'Shift', 'ShiftLeft', 16)
    await c.key('keyDown', '3', 'Digit3', 51, 8)
    await pause(60)
    await c.key('keyUp', '3', 'Digit3', 51, 8)
    await c.key('keyUp', 'Shift', 'ShiftLeft', 16)
    await c.until((s) => state(s).weapon.revision !== before.weapon.revision, 'slot acknowledged')
  }
  throw new Error(`Cannot select ${id}`)
}
async function mouse(type) {
  await c.send('Input.dispatchMouseEvent', { type, x: c.mx, y: c.my, button: 'left', clickCount: 1 })
}
async function move(point) {
  await c.command(`/move_player_to ${point.x} ${point.y + 0.15} ${point.z}`)
  await pause(500)
}
async function throwNear(id) {
  await select(id)
  await pause(900)
  const p = (await c.snapshot())['1'].Transform.position
  await c.aimAt({ x: p.x, y: p.y - 10, z: p.z + 1 })
  await c.shoot(600)
  return c.until((s) => grenades(s).some((g) => g.kind === id && g.phase === 'flight'), `${id} in flight`)
}
async function buy(rows) {
  await c.evaluate('document.exitPointerLock()')
  await c.until((s) => labels(s).includes('0 CANCEL'), 'buy menu')
  await row(7)
  for (const index of rows) await row(index)
  await row(8)
  await row(8)
  await c.until((s) => s['2'].PointerLock?.isPointerLocked, 'capture after buy')
}
async function save(name) {
  await run('agent-browser', ['--session', session, 'screenshot', `${dir}/${name}.png`], { timeout: 15000 })
}
try {
  await c.connect()
  let s = await c.snapshot()
  assert.ok(state(s).health.current >= 45 && state(s).health.current <= 65, 'run after grenades.mjs in the same fixture')
  const spawn = s['1'].Transform.position
  await throwNear('flashbang')
  await c.aimAt({ x: spawn.x, y: spawn.y + 100, z: spawn.z + 1 })
  s = await c.until(
    (s) => state(s).flashes.some((f) => f.alpha === 200 && Date.now() / 1000 - f.start < 1),
    'flash turned away'
  )
  const back = state(s).flashes.find((f) => f.alpha === 200 && Date.now() / 1000 - f.start < 1)
  evidence.facingAway = back
  await save('flash-away')
  await pause(Math.max(0, (back.start + back.hold + back.fade - Date.now() / 1000) * 1000) + 200)
  await buy([2, 3])
  const front = { x: 72.68839293, y: 6.6127, z: 69.39560782 },
    behind = { x: 71.7592916, y: 6.6927, z: 67.40143921 }
  await move(front)
  s = await throwNear('flashbang')
  const oldStart = Math.max(0, ...state(s).flashes.map((f) => f.start))
  await move(behind)
  s = await c.until(
    (s) => grenades(s).some((g) => g.kind === 'flashbang' && g.phase === 'exploded'),
    'flash beyond door explodes'
  )
  assert.equal(Math.max(0, ...state(s).flashes.map((f) => f.start)), oldStart, 'door blocks flash')
  evidence.wallFlash = {
    projectile: grenades(s).find((g) => g.kind === 'flashbang'),
    player: s['1'].Transform.position,
    oldStart,
    preserved: true
  }
  await move(front)
  const health = state(await c.snapshot()).health.current
  await throwNear('hegrenade')
  await move(behind)
  s = await c.until((s) => state(s).health.current < health, 'HE passes door')
  assert.ok(state(s).health.current > 0)
  evidence.wallHE = {
    beforeHealth: health,
    after: state(s).health,
    projectile: grenades(s).find((g) => g.kind === 'hegrenade'),
    player: s['1'].Transform.position
  }
  await save('he-through-door')
  console.log('PASS: looking away weakens flash; middle door blocks flash but passes HE damage')
  await move(spawn)
  await buy([2, 3, 4])
  const round = state(await c.snapshot()).match.round
  s = await throwNear('hegrenade')
  const he = grenades(s).find((g) => g.kind === 'hegrenade' && g.phase === 'flight')
  await c.until((s) => state(s).inventory.active === 'awp', 'HE retires')
  await select('flashbang')
  await mouse('mousePressed')
  s = await c.until((s) => state(s).health.current === 0, 'self HE kills while holding flash', 5000)
  await mouse('mouseReleased')
  s = await c.until(
    (s) => grenades(s).some((g) => g.kind === 'flashbang' && g.phase === 'flight'),
    'primed flash drops on death'
  )
  const deathFlash = grenades(s).find((g) => g.kind === 'flashbang')
  assert.ok(deathFlash.created >= he.created + 1.5)
  assert.ok(
    Object.values(s).some((v) => v.GltfContainer?.src.endsWith('/awp-drop.glb')),
    'death also drops best firearm'
  )
  evidence.death = { flash: deathFlash, health: state(s).health, inventory: state(s).inventory, round }
  await save('primed-death')
  s = await c.until((s) => state(s).match.round > round && state(s).health.current === 100, 'next round', 20000)
  assert.equal(grenades(s).length, 0)
  assert.equal(state(s).flashes.length, 0)
  assert.ok(
    !state(s).inventory.items.some((i) => i.id.endsWith('grenade') || i.id === 'flashbang'),
    'death discards unprimed grenades'
  )
  evidence.roundCleanup = { round: state(s).match.round, flashes: 0, projectiles: 0 }
  console.log('PASS: primed death throw, best-gun death drop, discarded spare grenades and round cleanup')
  writeFileSync(`${dir}/combat.json`, JSON.stringify(evidence, null, 2) + '\n')
} catch (error) {
  writeFileSync(`${dir}/combat-partial.json`, JSON.stringify(evidence, null, 2) + '\n')
  try {
    writeFileSync(`${dir}/combat-failure.json`, JSON.stringify(await c.snapshot(), null, 2))
    await save('combat-failure')
  } catch (captureError) {
    console.error(captureError)
  }
  throw error
} finally {
  await mouse('mouseReleased').catch((error) => console.error(error))
  c.socket.close()
}
