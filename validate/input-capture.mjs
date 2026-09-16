import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client, pause, labels } from './team-client.mjs'
const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16'),
  dir = resolve(process.argv[3] ?? 'validate/game/input-capture'),
  baseline = process.argv.includes('--baseline')
const evidence = { date: new Date().toISOString(), muted: true, baseline }
mkdirSync(dir, { recursive: true })
const state = (s) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith('review-c4-') ? [JSON.parse(v.TextShape.text.slice(10))] : []
  )[0]
async function move(p) {
  await c.command(`/move_player_to ${p.x} ${p.y + 0.15} ${p.z}`)
  await pause(800)
}
async function mouse(type) {
  await c.send('Input.dispatchMouseEvent', { type, x: c.mx, y: c.my, button: 'left', clickCount: 1 })
}
async function picture(name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${dir}/${name}.png`, Buffer.from(data, 'base64'))
}
async function oneShot(name) {
  let s = await c.snapshot()
  const before = state(s).weapon.ammoClip
  await c.shoot(75)
  s = await c.until((s) => state(s).weapon.ammoClip === before - 1, name)
  evidence[name] = state(s)
  await pause(1600)
  return s
}
try {
  await c.connect()
  const deadline = Date.now() + 120000
  while (!(await c.evaluate("typeof window.engine_console_command === 'function'"))) {
    assert.ok(Date.now() < deadline)
    await pause(500)
  }
  await c.until((s) => labels(s).includes('Select a team') && state(s)?.health, 'lobby', 60000)
  await c.join(2)
  await c.until((s) => state(s)?.match.phase === 'live' && state(s)?.health.current === 100, 'spawn')
  await c.evaluate('document.exitPointerLock()')
  await c.until((s) => labels(s).includes('0 CANCEL'), 'initial buy menu')
  await pause(1200)
  const [w, h] = await c.evaluate('[innerWidth,innerHeight]')
  const k = Math.min(w / 640, h / 480)
  const cancel = { x: (w - 640 * k) / 2 + 150 * k, y: (h - 480 * k) / 2 + (126 + 8 * 28) * k }
  await c.click(cancel.x, cancel.y)
  let s = await c.until((s) => s['2'].PointerLock?.isPointerLocked, 'delayed menu capture', 4000)
  await pause(400)
  s = await c.snapshot()
  evidence.spawn = state(s)
  evidence.spawnPosition = s['1'].Transform.position
  assert.equal(state(s).input.pointer, false, 'menu click released before automatic capture')
  assert.equal(state(s).input.ready, !baseline, 'delayed capture readiness')
  s = await c.until((s) => state(s).bomb.phase === 'planted', 'parked bot plants', 10000)
  const bomb = state(s).bomb.position
  await move({ ...bomb, x: bomb.x - 0.9 })
  await c.aimAt(bomb)
  await c.key('keyDown', 'e', 'KeyE', 69)
  if (baseline) {
    await pause(600)
    s = await c.snapshot()
    evidence.blockedUse = state(s)
    assert.equal(state(s).bomb.defuser, '')
    assert.equal(state(s).input.use, true)
    assert.equal(state(s).input.ready, false)
    await c.key('keyUp', 'e', 'KeyE', 69)
    await c.aimAt({ x: 35, y: 20, z: 42 })
    const before = state(s).weapon.ammoClip
    await c.shoot(75)
    await pause(400)
    s = await c.snapshot()
    assert.equal(state(s).weapon.ammoClip, before)
    evidence.swallowedFirstClick = state(s)
    await picture('before')
    writeFileSync(`${dir}/before.json`, JSON.stringify(evidence, null, 2) + '\n')
    console.log(
      'REPRODUCED: cursor captured with mouse released, E blocked, first deliberate click consumed without firing'
    )
  } else {
    s = await c.until((s) => state(s).bomb.defuser, 'first E starts defuse with no priming click', 3000)
    assert.equal(state(s).weapon.zoom, 90)
    assert.equal(state(s).bomb.actionEnds - state(s).bomb.actionStarted, 10)
    evidence.firstUse = state(s)
    await c.key('keyUp', 'e', 'KeyE', 69)
    await c.until((s) => !state(s).bomb.defuser, 'release cancels use')
    await c.aimAt({ x: 35, y: 20, z: 42 })
    await oneShot('firstClick')
    await move({ x: 21, y: 10.43, z: 60 })
    await c.evaluate('document.exitPointerLock()')
    await c.until((s) => !s['2'].PointerLock?.isPointerLocked, 'cursor release')
    c.mx = w / 2
    c.my = h / 2
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.mx, y: c.my })
    const clip = state(await c.snapshot()).weapon.ammoClip
    await mouse('mousePressed')
    await c.until((s) => s['2'].PointerLock?.isPointerLocked, 'world click recaptures')
    await pause(700)
    s = await c.snapshot()
    evidence.heldCapture = state(s)
    assert.equal(state(s).weapon.ammoClip, clip)
    assert.equal(state(s).input.ready, false)
    await mouse('mouseReleased')
    await c.until((s) => state(s).input.ready, 'release arms next action')
    await oneShot('afterCapture')
    await move(evidence.spawnPosition)
    await c.evaluate('document.exitPointerLock()')
    await c.until((s) => labels(s).includes('0 CANCEL'), 'buy menu')
    c.mx = (w - 640 * k) / 2 + 150 * k
    c.my = (h - 480 * k) / 2 + (126 + 8 * 28) * k
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.mx, y: c.my })
    await pause(150)
    const menuClip = state(await c.snapshot()).weapon.ammoClip
    await mouse('mousePressed')
    await c.until((s) => s['2'].PointerLock?.isPointerLocked, 'menu click captures')
    await pause(700)
    s = await c.snapshot()
    evidence.heldMenu = state(s)
    assert.equal(state(s).weapon.ammoClip, menuClip)
    assert.equal(state(s).input.ready, false)
    await mouse('mouseReleased')
    await c.until((s) => state(s).input.ready, 'menu release arms next action')
    await oneShot('afterMenu')
    await move({ ...bomb, x: bomb.x - 0.9 })
    await c.aimAt(bomb)
    await c.key('keyDown', 'e', 'KeyE', 69)
    s = await c.until((s) => state(s).bomb.phase === 'defused', 'normal ten-second defuse', 12000)
    await c.key('keyUp', 'e', 'KeyE', 69)
    evidence.defused = state(s)
    const ammo = state(s).weapon.ammoClip
    s = await c.until(
      (s) => state(s).match.round === 2 && s['2'].PointerLock?.isPointerLocked && state(s).input.ready,
      'next-round capture arms without a click',
      15000
    )
    assert.equal(state(s).weapon.ammoClip, ammo)
    evidence.nextRound = state(s)
    await c.until((s) => state(s).match.phase === 'live', 'second live')
    await oneShot('afterRound')
    await c.key('keyDown', '2', 'Digit2', 50)
    await pause(60)
    await c.key('keyUp', '2', 'Digit2', 50)
    await c.until((s) => state(s).weapon.name === 'USP', 'pistol')
    await pause(1000)
    const pistol = state(await c.snapshot()).weapon.ammoClip
    await mouse('mousePressed')
    await pause(800)
    s = await c.snapshot()
    assert.equal(state(s).weapon.ammoClip, pistol - 1, 'pistol remains one shot per press')
    await mouse('mouseReleased')
    evidence.pistolHeld = state(s)
    await pause(150)
    await c.shoot(75)
    s = await c.until((s) => state(s).weapon.ammoClip === pistol - 2, 'next pistol press')
    evidence.pistolNext = state(s)
    await picture('after')
    writeFileSync(`${dir}/browser.json`, JSON.stringify(evidence, null, 2) + '\n')
    console.log(
      'PASS: first E/shot after delayed capture, held world/menu clicks suppressed, next-click fire, next-round readiness and pistol semi-auto'
    )
  }
} catch (error) {
  evidence.failure = String(error)
  try {
    evidence.state = await c.snapshot()
    await picture('failure')
  } catch (e) {
    console.warn(e.message)
  }
  writeFileSync(`${dir}/failure.json`, JSON.stringify(evidence, null, 2) + '\n')
  throw error
} finally {
  await c.key('keyUp', 'e', 'KeyE', 69).catch((e) => console.warn(e.message))
  c.socket.close()
}
