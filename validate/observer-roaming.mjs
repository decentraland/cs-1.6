import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Client, pause } from './team-client.mjs'
import { menuPoint } from './menu-layout.mjs'

const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16')
const directory = resolve(process.argv[3] ?? 'validate/game/observer-roaming')
const state = (snapshot) =>
  Object.values(snapshot).flatMap((v) =>
    v.TextShape?.text.startsWith('review-hit-state-{')
      ? [JSON.parse(v.TextShape.text.slice('review-hit-state-'.length))]
      : []
  )[0]
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const horizontal = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const evidence = { date: new Date().toISOString(), muted: true, checks: [] }
async function tap(key, code, vk, duration = 70) {
  await c.key('keyDown', key, code, vk)
  try {
    await pause(duration)
  } finally {
    await c.key('keyUp', key, code, vk)
  }
}
async function menuClick(y) {
  const [width, height] = await c.evaluate('[innerWidth,innerHeight]')
  const point = menuPoint(width, height, 150, y)
  await c.click(point.x, point.y, 100)
}
async function screenshot(name) {
  const shot = await c.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(resolve(directory, name + '.png'), Buffer.from(shot.data, 'base64'))
}
try {
  await mkdir(directory, { recursive: true })
  await c.connect()
  const initial = await c.until((s) => !!state(s), 'scene diagnostics ready', 60000)
  if (state(initial).match.roster.some((p) => p.connected && !p.address.startsWith('bot:'))) {
    if (!initial['2'].PointerLock?.isPointerLocked) await c.capture()
    await tap('Escape', 'Escape', 27)
    await c.until((s) => state(s)?.observer.menu, 'existing observer menu opens')
    await menuClick(318)
    await c.until(
      (s) => !state(s)?.match.roster.some((p) => p.connected && !p.address.startsWith('bot:')),
      'leave prior observer seat'
    )
  }
  await menuClick(254)
  const lobby = await c.until(
    (s) =>
      state(s)?.observer.active &&
      state(s)?.observer.mode === 'roaming' &&
      !state(s)?.observer.menu &&
      s['2'].PointerLock?.isPointerLocked,
    'neutral spectator enters free look in empty lobby'
  )
  assert.equal(state(lobby).match.phase, 'ready')
  const start = state(lobby)
  await tap('w', 'KeyW', 87, 900)
  await pause(100)
  const flown = await c.snapshot()
  const flying = state(flown)
  assert.ok(distance(start.view.position, flying.view.position) > 1, 'W moves the observer camera')
  assert.ok(
    distance(lobby['2'].Transform.position, flown['2'].Transform.position) > 1,
    'rendered camera follows free flight'
  )
  assert.ok(horizontal(start.feet, flying.feet) < 0.05, 'observer body stays still')
  assert.equal(flying.weapon.ammoClip, start.weapon.ammoClip)
  evidence.flight = { from: start.view.position, to: flying.view.position, feet: flying.feet }
  evidence.checks.push('empty-lobby Spectate enters free look', 'WASD moves camera without moving player or firing')
  await screenshot('free-look')
  await tap('Escape', 'Escape', 27)
  const menu = await c.until(
    (s) => state(s)?.observer.menu && !s['2'].PointerLock?.isPointerLocked,
    'Escape opens menu in lobby'
  )
  await tap('w', 'KeyW', 87, 450)
  assert.ok(
    distance(state(menu).view.position, state(await c.snapshot()).view.position) < 0.01,
    'menu stops free-flight movement'
  )
  await menuClick(382)
  await c.until(
    (s) => !state(s)?.observer.menu && s['2'].PointerLock?.isPointerLocked,
    'Resume captures in empty lobby'
  )
  evidence.checks.push('Escape stops flight and opens clickable menu', 'Resume recaptures in empty lobby')
  await tap('Escape', 'Escape', 27)
  await c.until((s) => state(s)?.observer.menu, 'team selection available')
  await c.join(2)
  const live = await c.until(
    (s) => state(s)?.match.phase === 'live' && state(s)?.health.current === 100 && !state(s)?.observer.active,
    'joining CT restores playable camera',
    15000
  )
  assert.ok(horizontal(state(live).view.position, state(live).feet) < 0.2)
  evidence.checks.push('joining a team leaves roaming and restores live camera')
  await c.capture()
  await tap('e', 'KeyE', 69)
  await c.until((s) => state(s)?.health.current === 0, 'server-confirmed lethal hit')
  await c.until((s) => !!state(s)?.observer.target, 'death transitions to living bot chase', 5000)
  await tap(' ', 'Space', 32)
  assert.equal(state(await c.snapshot()).observer.mode, 'chase', 'dead team players cannot enable free roaming')
  await tap('Escape', 'Escape', 27)
  await c.until((s) => state(s)?.observer.menu, 'dead-player menu opens')
  await menuClick(254)
  const chase = await c.until(
    (s) =>
      !state(s)?.observer.menu &&
      s['2'].PointerLock?.isPointerLocked &&
      state(s)?.match.roster.some((p) => p.team === 0 && p.connected && !p.address.startsWith('bot:')),
    'switch to neutral spectator'
  )
  const chased = state(chase).observer.target.address
  await tap(' ', 'Space', 32)
  const roaming = await c.until((s) => state(s)?.observer.mode === 'roaming', 'Space selects free look')
  assert.equal(state(roaming).observer.target, undefined)
  await tap('w', 'KeyW', 87, 500)
  await tap(' ', 'Space', 32)
  const restored = await c.until(
    (s) => state(s)?.observer.mode === 'chase' && state(s)?.observer.target?.address === chased,
    'Space restores selected chase target'
  )
  evidence.target = state(restored).observer.target
  evidence.checks.push('dead team player cannot roam', 'neutral Space toggles free look and preserves chase target')
  await screenshot('chase')
  await writeFile(resolve(directory, 'browser.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log(
    'PASS: neutral free look → fly → Escape/Resume → join/play → death → restricted chase → neutral mode switching'
  )
} finally {
  c.socket.close()
}
