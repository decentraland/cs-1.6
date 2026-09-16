import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client, pause, labels } from './team-client.mjs'

const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16')
const dir = resolve(process.argv[3] ?? 'validate/game/empty-reload'),
  baseline = process.argv.includes('--baseline')
const evidence = { date: new Date().toISOString(), muted: true, baseline, guns: [] }
mkdirSync(dir, { recursive: true })
const state = (s) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith('review-reload-') ? [JSON.parse(v.TextShape.text.slice(14))] : []
  )[0]
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
  await pause(200)
}
async function capture() {
  for (let attempt = 0; attempt < 3; attempt++) {
    if ((await c.snapshot())['2'].PointerLock?.isPointerLocked) break
    await row(8)
    await pause(700)
  }
  await c.until((s) => s['2'].PointerLock?.isPointerLocked && state(s).input.ready, 'capture ready')
  await c.aimAt({ x: 45, y: 21, z: 50 })
}
async function magazine(pistol) {
  let s = await c.snapshot(),
    initial = state(s)
  assert.equal(initial.weapon.ammoClip, 3)
  if (pistol)
    for (let i = 0; i < 2; i++) {
      await c.shoot(75)
      await c.until((s) => state(s).weapon.ammoClip === 2 - i, 'pistol shot')
      await pause(250)
    }
  await mouse('mousePressed')
  s = await c.until((s) => state(s).weapon.ammoClip === 0, 'empty magazine')
  const empty = state(s)
  await pause((initial.weapon.reloadTime + 0.7) * 1000)
  const held = state(await c.snapshot())
  assert.equal(held.input.pointer, true)
  const result = { initial, empty, held }
  evidence.guns.push(result)
  if (baseline) {
    assert.ok(held.weapon.ammoReserve < empty.weapon.ammoReserve, 'old gate reloads reserve while fire held')
    await picture('before')
    return
  }
  assert.equal(held.weapon.ammoClip, 0)
  assert.equal(held.weapon.ammoReserve, empty.weapon.ammoReserve)
  assert.equal(held.weapon.isReloading, false)
  assert.equal(held.weapon.lastFiredShotId, empty.weapon.lastFiredShotId)
  await picture(pistol ? 'empty-pistol' : 'empty-rifle')
  await mouse('mouseReleased')
  s = await c.until((s) => state(s).weapon.isReloading, 'release starts reload')
  result.started = state(s)
  s = await c.until((s) => !state(s).weapon.isReloading && state(s).weapon.ammoClip > 0, 'reload completed')
  result.finished = state(s)
  assert.equal(result.finished.weapon.ammoClip, initial.weapon.maxAmmoClip)
  assert.equal(result.finished.weapon.ammoReserve, initial.weapon.ammoReserve - initial.weapon.maxAmmoClip)
  assert.equal(result.finished.weapon.lastFiredShotId, empty.weapon.lastFiredShotId)
  assert.ok(Date.now() / 1000 - result.started.weapon.reloadStartTime >= initial.weapon.reloadTime - 0.03)
}
async function shotgun(index, name) {
  await c.evaluate('document.exitPointerLock()')
  await c.until((s) => labels(s).includes('0 CANCEL'), 'buy menu')
  await row(1)
  await row(index)
  await c.until((s) => state(s).weapon.name === name, name + ' bought')
  await row(2)
  await row(5)
  await capture()
  await pause(1000)
  const initial = state(await c.snapshot())
  assert.equal(initial.weapon.ammoClip, 3)
  assert.ok(initial.weapon.ammoReserve > 0)
  await mouse('mousePressed')
  let s = await c.until((s) => state(s).weapon.ammoClip === 0, name + ' empty')
  const empty = state(s)
  s = await c.until((s) => state(s).weapon.isReloading, name + ' reloads while held')
  const reloading = state(s)
  assert.equal(reloading.input.pointer, true)
  s = await c.until(
    (s) => state(s).weapon.lastFiredShotId > empty.weapon.lastFiredShotId,
    name + ' fires inserted shell'
  )
  const fired = state(s)
  assert.equal(fired.input.pointer, true)
  assert.ok(fired.weapon.ammoReserve < initial.weapon.ammoReserve)
  evidence.guns.push({ initial, empty, reloading, fired })
  await mouse('mouseReleased')
  await picture(name.toLowerCase())
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
  await c.until((s) => state(s)?.match.phase === 'live' && state(s)?.health.current === 100, 'live')
  await capture()
  await pause(1000)
  await magazine(false)
  if (!baseline) {
    await c.key('keyDown', '2', 'Digit2', 50)
    await pause(60)
    await c.key('keyUp', '2', 'Digit2', 50)
    await c.until((s) => state(s).weapon.name === 'USP', 'pistol selected')
    await pause(1000)
    await magazine(true)
    await shotgun(0, 'M3')
    await shotgun(1, 'XM1014')
  }
  writeFileSync(`${dir}/${baseline ? 'before' : 'browser'}.json`, JSON.stringify(evidence, null, 2) + '\n')
  console.log(
    baseline
      ? 'REPRODUCED: empty rifle reloads while fire remains held'
      : 'PASS: M4/USP wait for release, normal reload conserves ammo, M3/XM1014 reload and fire inserted shells while held'
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
