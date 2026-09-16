import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client, pause, labels } from './team-client.mjs'

const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16')
const dir = resolve(process.argv[3] ?? 'validate/game/burst-fire'),
  baseline = process.argv.includes('--baseline')
const evidence = { date: new Date().toISOString(), baseline, checks: [] }
mkdirSync(dir, { recursive: true })
const read = (s, source) =>
  Object.values(s).flatMap((v) => {
    const prefix = 'review-burst-' + source + '-',
      text = v.TextShape?.text
    return text?.startsWith(prefix) ? [JSON.parse(text.slice(prefix.length))] : []
  })[0]
const state = (s) => read(s, 'client')
const accepted = (s) => read(s, 'server') ?? []
async function mouse(type) {
  await c.send('Input.dispatchMouseEvent', { type, x: c.mx, y: c.my, button: 'left', clickCount: 1 })
}
async function picture(name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${dir}/${name}.png`, Buffer.from(data, 'base64'))
}
async function row(index) {
  const [w, h] = await c.evaluate('[innerWidth,innerHeight]'),
    k = Math.min(w / 640, h / 480)
  await c.click((w - 640 * k) / 2 + 150 * k, (h - 480 * k) / 2 + (126 + index * 28) * k)
  await pause(250)
}
async function key(key, code, which) {
  await c.key('keyDown', key, code, which)
  await pause(70)
  await c.key('keyUp', key, code, which)
}
async function mode(value) {
  await key('e', 'KeyE', 69)
  await c.until((s) => state(s).weapon.mode === value, 'alternate mode ' + value)
  await pause(350)
}
async function fire(name, milliseconds) {
  const before = await c.snapshot(),
    initial = state(before)
  await mouse('mousePressed')
  await pause(milliseconds)
  await mouse('mouseReleased')
  await pause(450)
  const after = await c.snapshot(),
    final = state(after)
  const shots = accepted(after).filter((s) => s.id > initial.weapon.lastFiredShotId)
  const requests = final.shots.filter((s) => s.id > initial.weapon.lastFiredShotId)
  assert.deepEqual(
    shots.map((s) => s.id),
    requests.map((s) => s.id),
    name + ': every predicted round accepted'
  )
  assert.equal(initial.weapon.ammoClip - final.weapon.ammoClip, shots.length, name + ': ammunition')
  const result = { name, milliseconds, initial, final, shots, requests }
  evidence.checks.push(result)
  return result
}
function bursts(result, cycle) {
  assert.equal(result.shots.length % 3, 0, 'complete three-round bursts')
  assert.deepEqual(
    result.shots.map((s) => s.index),
    result.shots.map((_, i) => i % 3)
  )
  for (let i = 3; i < result.shots.length; i += 3) {
    const elapsed = result.shots[i].at - result.shots[i - 3].at
    assert.ok(elapsed >= cycle - 0.002, 'burst cycle: ' + elapsed)
  }
}
try {
  await c.connect()
  const deadline = Date.now() + 120000
  while (!(await c.evaluate("typeof window.engine_console_command === 'function'"))) {
    assert.ok(Date.now() < deadline)
    await pause(500)
  }
  if (!process.argv.includes('--joined')) {
    await c.until((s) => labels(s).includes('Select a team') && state(s)?.health, 'lobby', 60000)
    await c.join(2)
  } else await row(5)
  await c.until((s) => state(s)?.match.phase === 'live' && state(s)?.health.current === 100, 'live')
  await c.evaluate('document.exitPointerLock()')
  await c.until((s) => labels(s).includes('0 CANCEL'), 'buy menu')
  await row(0)
  await row(0)
  await row(5)
  for (let attempt = 0; attempt < 3; attempt++) {
    if ((await c.snapshot())['2'].PointerLock?.isPointerLocked) break
    await row(8)
    await pause(700)
  }
  await c.until((s) => s['2'].PointerLock?.isPointerLocked && state(s).input.ready, 'capture ready')
  await key('2', 'Digit2', 50)
  await c.until((s) => state(s)?.weapon.name === 'Glock-18', 'Glock selected')
  await c.aimAt({ x: 45, y: 21, z: 50 })
  await pause(1000)
  if (!baseline) assert.equal((await fire('Glock semi held', 650)).shots.length, 1)
  await mode(1)
  const glock = await fire('Glock burst held', 1250)
  if (baseline) assert.equal(glock.shots.length, 3, 'old gate only allows one burst per press')
  else {
    assert.ok(glock.shots.length >= 6, 'held Glock starts additional bursts')
    bursts(glock, 0.5)
    await picture('glock-burst')
    await mode(0)
    assert.equal((await fire('Glock semi after burst', 650)).shots.length, 1)
    await mode(1)
    await key('1', 'Digit1', 49)
    await c.until((s) => state(s).weapon.name === 'FAMAS', 'FAMAS selected')
    await pause(1000)
    await mode(1)
    const famas = await fire('FAMAS burst held', 1350)
    assert.ok(famas.shots.length >= 6)
    bursts(famas, 0.55)
    for (let i = 0; i < famas.shots.length; i += 3) {
      assert.ok(famas.shots[i + 1].at - famas.shots[i].at >= 0.05 - 0.002)
      assert.ok(famas.shots[i + 2].at - famas.shots[i + 1].at >= 0.1 - 0.002)
    }
    const tapped = await fire('FAMAS released during burst', 75)
    assert.equal(tapped.shots.length, 3)
    assert.ok(
      tapped.requests.some((s) => !s.held),
      'continuation after release'
    )
    await picture('famas-burst')
  }
  await picture(baseline ? 'before' : 'after')
  writeFileSync(`${dir}/${baseline ? 'before' : 'browser'}.json`, JSON.stringify(evidence, null, 2) + '\n')
  console.log(
    baseline
      ? 'REPRODUCED: held Glock stops after three rounds'
      : 'PASS: held Glock repeats, semi modes fire once, FAMAS deadlines and released continuations preserved'
  )
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
  await mouse('mouseReleased').catch((e) => console.warn(e.message))
  c.socket.close()
}
