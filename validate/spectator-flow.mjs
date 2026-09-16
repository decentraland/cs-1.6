import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Client, pause } from './team-client.mjs'
import { menuPoint } from './menu-layout.mjs'
import { readHud } from './read-hud.mjs'

const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16')
const directory = resolve(process.argv[3] ?? 'validate/game/spectator-flow')
const state = (snapshot) =>
  Object.values(snapshot).flatMap((v) =>
    v.TextShape?.text.startsWith('review-hit-state-{')
      ? [JSON.parse(v.TextShape.text.slice('review-hit-state-'.length))]
      : []
  )[0]
const evidence = { date: new Date().toISOString(), muted: true, checks: [] }
async function tap(key, code, vk) {
  await c.key('keyDown', key, code, vk)
  await pause(65)
  await c.key('keyUp', key, code, vk)
}
async function screenshot(name) {
  const shot = await c.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(resolve(directory, name + '.png'), Buffer.from(shot.data, 'base64'))
}
try {
  await mkdir(directory, { recursive: true })
  await c.connect()
  await c.until((s) => !!state(s), 'scene diagnostics ready', 60000)
  await c.join(2)
  await c.until((s) => state(s)?.match.phase === 'live' && state(s)?.health.current === 100, 'live CT round', 15000)
  await c.capture()
  await tap('e', 'KeyE', 69)
  const dead = await c.until((s) => state(s)?.health.current === 0, 'authoritative lethal hit')
  evidence.deadHud = readHud(dead)
  assert.equal(state(dead).observer.transition, true)
  await pause(700)
  assert.equal(state(await c.snapshot()).observer.target, undefined, 'death view precedes chase')
  const chase = await c.until((s) => !!state(s)?.observer.target, 'living bot chase', 5000)
  const target = state(chase).observer.target.address
  const hud = readHud(chase)
  for (const field of ['health', 'armor', 'clip', 'reserve', 'money'])
    assert.equal(hud[field], undefined, field + ' is hidden in free chase')
  assert.ok(Number.isFinite(hud.seconds), 'round timer remains visible')
  evidence.chaseHud = hud
  evidence.checks.push('death transition precedes chase', 'own health/armor/ammo/money hidden in chase; timer retained')
  await screenshot('chase')
  await tap('Escape', 'Escape', 27)
  await c.until((s) => state(s)?.observer.menu && !s['2'].PointerLock?.isPointerLocked, 'Escape opens spectator menu')
  await screenshot('menu')
  const [width, height] = await c.evaluate('[innerWidth,innerHeight]')
  const resume = menuPoint(width, height, 150, 382)
  await c.click(resume.x, resume.y, 200)
  const resumed = await c.until(
    (s) => !state(s)?.observer.menu && s['2'].PointerLock?.isPointerLocked,
    'Resume captures pointer'
  )
  assert.equal(state(resumed).observer.target.address, target, 'resume click preserves target')
  const ammunition = state(resumed).weapon.ammoClip
  await c.shoot(70)
  const cycled = await c.until((s) => state(s)?.observer.target?.address !== target, 'next click cycles target')
  assert.equal(state(cycled).weapon.ammoClip, ammunition, 'spectator input does not fire')
  await pause(300)
  await c.key('keyDown', 'Shift', 'ShiftLeft', 16)
  try {
    await c.shoot(70)
  } finally {
    await c.key('keyUp', 'Shift', 'ShiftLeft', 16)
  }
  const previous = await c.until(
    (s) => state(s)?.observer.target?.address === target,
    'Shift-click selects previous target'
  )
  assert.equal(state(previous).weapon.ammoClip, ammunition)
  evidence.checks.push(
    'Escape opens clickable menu',
    'Resume preserves target',
    'forward/reverse target cycling without ammunition consumption'
  )
  evidence.target = state(previous).observer.target
  await screenshot('resumed')
  await writeFile(resolve(directory, 'browser.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log('PASS: death → chase HUD → Escape → Resume → forward/reverse cycling')
} finally {
  c.socket.close()
}
