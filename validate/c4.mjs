import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Client, pause, labels } from './team-client.mjs'
const endpoint = process.argv[2],
  dir = resolve(process.argv[3] ?? 'validate/game/c4'),
  session = process.argv[4] ?? 'cs16-c4-review'
const c = new Client(endpoint, 'https://decentraland.org/bevy-web/', 'CS16'),
  run = promisify(execFile)
const evidence = { date: new Date().toISOString() }
mkdirSync(dir, { recursive: true })
const state = (s) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith('review-c4-') ? [JSON.parse(v.TextShape.text.slice(10))] : []
  )[0]
const model = (s, suffix) =>
  Object.values(s).find(
    (v) => v.GltfContainer?.src.endsWith('/c4-' + suffix + '.glb') && v.VisibilityComponent?.visible !== false
  )
const clip = (s) => model(s, 'view')?.Animator?.states.find((a) => a.playing)?.clip
async function key(value, modifiers = 0) {
  if (modifiers) await c.key('keyDown', 'Shift', 'ShiftLeft', 16)
  await c.key('keyDown', value, 'Digit' + value, 48 + Number(value), modifiers)
  await pause(70)
  await c.key('keyUp', value, 'Digit' + value, 48 + Number(value), modifiers)
  if (modifiers) await c.key('keyUp', 'Shift', 'ShiftLeft', 16)
}
async function mouse(type) {
  await c.send('Input.dispatchMouseEvent', { type, x: c.mx, y: c.my, button: 'left', clickCount: 1 })
}
async function save(name) {
  await run('agent-browser', ['--session', session, 'screenshot', `${dir}/${name}.png`], { timeout: 15000 })
}
async function move(p) {
  await c.command(`/move_player_to ${p.x} ${p.y + 0.15} ${p.z}`)
  await pause(800)
}
async function plantStart() {
  await c.until(
    (s) =>
      state(s).bomb.phase === 'carried' &&
      state(s).bomb.readyAt < Date.now() / 1000 &&
      state(s).animation.readyAt < Date.now() / 1000,
    'C4 ready'
  )
  await mouse('mousePressed')
  return c.until((s) => state(s).bomb.phase === 'planting', 'plant started')
}
try {
  await c.connect()
  const deadline = Date.now() + 120000
  while (!(await c.evaluate("typeof window.engine_console_command === 'function'"))) {
    assert.ok(Date.now() < deadline)
    await pause(500)
  }
  await c.until((s) => labels(s).includes('Select a team') && state(s)?.health, 'lobby', 60000)
  await c.join(1)
  await c.until((s) => state(s)?.match?.phase === 'live', 'live round', 20000)
  const [w, h] = await c.evaluate('[innerWidth, innerHeight]'),
    k = Math.min(w / 640, h / 480)
  for (let i = 0; i < 3; i++) {
    await c.click((w - 640 * k) / 2 + 150 * k, (h - 480 * k) / 2 + (126 + 8 * 28) * k)
    await pause(700)
    if ((await c.snapshot())['2'].PointerLock?.isPointerLocked) break
  }
  await c.until((s) => s['2'].PointerLock?.isPointerLocked, 'capture')
  await key('4')
  let s = await c.until((s) => model(s, 'view') && state(s).equipment.bombSelected, 'original C4 view')
  await pause(800)
  s = await c.snapshot()
  assert.equal(s['1'].AvatarLocomotionSettings.jogSpeed, 6.25)
  evidence.equipped = { model: model(s, 'view').GltfContainer, speed: s['1'].AvatarLocomotionSettings.jogSpeed }
  await save('c4-held')
  await c.shoot(500)
  s = await c.snapshot()
  assert.equal(state(s).bomb.phase, 'carried', 'spawn is outside plant zone')
  const site = { x: 32.8375, y: 12.6, z: 46.7017 }
  await move(site)
  await c.aimAt({ x: 32.8, y: 14, z: 60 })
  await plantStart()
  await pause(600)
  await mouse('mouseReleased')
  s = await c.until((s) => state(s).bomb.phase === 'carried', 'early cancel')
  assert.equal(state(s).animation.plantAt, -1)
  await mouse('mousePressed')
  await pause(300)
  assert.equal(state(await c.snapshot()).bomb.phase, 'carried', 'cancel cooldown blocks restart')
  await mouse('mouseReleased')
  evidence.earlyCancel = { bomb: state(s).bomb, clip: clip(s) }
  s = await plantStart()
  const start = state(s).bomb.actionStarted
  await pause(Math.max(0, (start + 1.8 - Date.now() / 1000) * 1000))
  await save('plant-keypad')
  evidence.keypadAudio = Object.values(await c.snapshot())
    .filter((v) => JSON.stringify(v.AudioSource ?? '').includes('original/c4_click.wav'))
    .map((v) => v.AudioSource)
  assert.ok(evidence.keypadAudio.length, 'original keypad click is scheduled')
  s = await c.until((s) => state(s).animation.clip === 'drop', 'lowering C4', 3000)
  evidence.lowering = { bomb: state(s).bomb, animation: state(s).animation, clip: clip(s) }
  await save('plant-lowering')
  await mouse('mouseReleased')
  s = await c.until((s) => state(s).bomb.phase === 'carried', 'late cancel')
  assert.ok(state(s).animation.clip === 'draw' || state(s).animation.clip === 'idle1')
  evidence.lateCancel = { bomb: state(s).bomb, animation: state(s).animation }
  await plantStart()
  await pause(200)
  await key('2')
  s = await c.until(
    (s) => !state(s).equipment.bombSelected && state(s).bomb.phase === 'carried',
    'holster cancels planting'
  )
  await mouse('mouseReleased')
  assert.equal(state(s).weapon.name, 'Glock-18')
  evidence.holster = state(s).weapon
  await key('4')
  await pause(850)
  await key('4', 8)
  s = await c.until((s) => state(s).bomb.phase === 'dropped' && model(s, 'drop'), 'original backpack drop')
  s = await c.until((s) => state(s).bomb.phase === 'dropped' && state(s).bomb.settled, 'backpack lands before pickup')
  const dropped = state(s).bomb.position
  await move({ ...dropped, z: dropped.z - 1.5 })
  await c.aimAt(dropped)
  await save('c4-backpack')
  evidence.drop = { bomb: state(s).bomb, model: model(s, 'drop').GltfContainer }
  await move(dropped)
  await c.until((s) => state(s).bomb.phase === 'carried', 'T pickup')
  await move(site)
  await key('4')
  await pause(850)
  await c.aimAt({ x: 32.8, y: 14, z: 60 })
  await plantStart()
  s = await c.until((s) => state(s).bomb.phase === 'planted', 'three-second plant', 5000)
  await mouse('mouseReleased')
  assert.equal(
    state(s).inventory.active,
    'awp',
    'plant retires to highest-weight weapon, not the previously selected pistol'
  )
  assert.ok(model(s, 'planted'))
  assert.equal(model(s, 'view'), undefined)
  evidence.planted = state(s)
  const planted = state(s).bomb.position
  await move({ ...planted, z: planted.z - 1.5 })
  await c.aimAt(planted)
  await save('c4-planted')
  s = await c.until(
    (s) => Object.values(s).some((v) => JSON.stringify(v.Material ?? '').includes('ledglow')),
    'C4 blink',
    5000
  )
  evidence.blinkComponents = Object.values(s)
    .filter((v) => JSON.stringify(v.Material ?? '').includes('ledglow'))
    .map((v) => ({ Material: v.Material, Transform: v.Transform }))
  assert.ok(evidence.blinkComponents.length, 'original LED texture visible')
  await key('2')
  await pause(900)
  await c.key('keyDown', 'e', 'KeyE', 69)
  await pause(250)
  const use = await c.snapshot()
  assert.ok(use['1'].AvatarLocomotionSettings.jogSpeed > 0, 'T use near planted C4 does not freeze movement')
  evidence.terroristUse = use['1'].AvatarLocomotionSettings
  await c.key('keyUp', 'e', 'KeyE', 69)
  const explodeAt = state(s).bomb.explodeAt
  await move({ x: 51.61083, y: 7.76, z: 46.70173 })
  await c.aimAt({ ...planted, y: planted.y + 1 })
  await pause(Math.max(0, (explodeAt - 0.2 - Date.now() / 1000) * 1000))
  s = await c.until((s) => state(s).bomb.phase === 'exploded', '45-second fuse', 4000)
  await save('c4-explosion')
  assert.equal(model(s, 'planted'), undefined)
  evidence.exploded = state(s)
  evidence.explosionSprites = Object.values(s).filter((v) =>
    JSON.stringify(v.Material ?? '').includes('grenade-fexplo')
  ).length
  assert.ok(evidence.explosionSprites >= 2)
  await c.until((s) => state(s).match.round === 2, 'next round', 15000)
  await save('c4-next-round')
  evidence.nextRound = state(await c.snapshot())
  writeFileSync(`${dir}/browser.json`, JSON.stringify(evidence, null, 2) + '\n')
  console.log(
    'PASS: original C4 view, speed, cancel/draw/lowering, holster, backpack/pickup, three-second plant, best-weapon retirement, blink, explosion and next round'
  )
} catch (error) {
  await save('failure').catch((error) => console.warn(error.message))
  writeFileSync(`${dir}/failure.json`, JSON.stringify(await c.snapshot().catch(() => ({})), null, 2))
  throw error
} finally {
  c.socket.close()
}
