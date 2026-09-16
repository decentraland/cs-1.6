import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Client, pause, labels, readHud } from './team-client.mjs'
const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16'),
  dir = resolve(process.argv[3] ?? 'validate/game/penetration'),
  session = process.argv[4] ?? 'cs16-penetration-review',
  run = promisify(execFile)
mkdirSync(dir, { recursive: true })
const health = (s) => {
  const text = Object.values(s)
    .map((v) => v.TextShape?.text)
    .find((v) => v?.startsWith('review-bot-0-health-'))
  return text ? Number(text.split('-').at(-1)) : undefined
}
const save = async (name) => {
  await run('agent-browser', ['--session', session, 'screenshot', `${dir}/${name}.png`], { timeout: 15000 })
}
async function tap(key, code, vk) {
  await c.key('keyDown', key, code, vk)
  await pause(60)
  await c.key('keyUp', key, code, vk)
}
try {
  await c.connect()
  await c.until((s) => labels(s).includes('Select a team'), 'fresh fixture', 60000)
  await c.until((s) => readHud(s)?.money === 16000, 'player state initialized')
  await c.join(2)
  await c.until((s) => health(s) === 100 && !labels(s).includes('Prepare to fight!'), 'live fixture', 20000)
  const [w, h] = await c.evaluate('[innerWidth,innerHeight]'),
    scale = Math.min(w / 640, h / 480)
  await c.click((w - 640 * scale) / 2 + 150 * scale, (h - 480 * scale) / 2 + 350 * scale)
  await c.until((s) => s['2'].PointerLock?.isPointerLocked, 'mouse captured')
  await pause(300)
  assert.equal(readHud(await c.snapshot()).clip, 10, 'closing the menu must not fire the AWP')
  await c.command('/move_player_to 72.68839293 7 69.39560782')
  await pause(700)
  await tap('2', 'Digit2', 50)
  await pause(1200)
  await c.aimAt({ x: 71.7592916, y: 7.7427, z: 67.40143921 })
  const before = await c.snapshot()
  assert.equal(health(before), 100)
  await save('door-before')
  await c.shoot(60)
  const pistol = await c.until((s) => readHud(s).clip < readHud(before).clip, 'USP accepted')
  await pause(500)
  assert.equal(health(await c.snapshot()), 100, 'USP cannot penetrate this door')
  await tap('1', 'Digit1', 49)
  await pause(1800)
  await c.aimAt({ x: 71.7592916, y: 7.7427, z: 67.40143921 })
  await tap('e', 'KeyE', 69)
  await pause(700)
  await c.shoot(45)
  const first = await c.until((s) => health(s) < 100, 'AWP hits through door')
  assert.equal(health(first), 44, 'first AWP hit deals 56 after two falloff truncations and the door multiplier')
  await save('door-awp-hit')
  await pause(1800)
  await c.shoot(45)
  const second = await c.until((s) => health(s) === 0, 'second AWP hit kills through door')
  await save('door-awp-kill')
  const evidence = {
    captureDidNotFire: true,
    pistol: { ammoBefore: readHud(before).clip, ammoAfter: readHud(pistol).clip, healthAfter: 100 },
    awp: { healthAfterFirst: health(first), healthAfterSecond: health(second), ammoAfter: readHud(second).clip },
    labels: labels(second),
    origin: before['2'].Transform.position,
    target: { x: 71.7592916, y: 6.6927, z: 67.40143921 }
  }
  writeFileSync(`${dir}/browser.json`, JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence))
  console.log('PASS: USP blocked, AWP reduced damage and kill through original Dust2 middle door')
} finally {
  c.socket.close()
}
