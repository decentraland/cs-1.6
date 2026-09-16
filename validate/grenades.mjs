import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Client, pause, labels, readHud } from './team-client.mjs'
const endpoint = process.argv[2],
  dir = resolve(process.argv[3] ?? 'validate/game/grenades'),
  session = process.argv[4] ?? 'cs16-grenade-review'
const c = new Client(endpoint, 'https://decentraland.org/bevy-web/', 'CS16'),
  run = promisify(execFile),
  evidence = {}
mkdirSync(dir, { recursive: true })
const tagged = (s, prefix) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith(prefix) ? [JSON.parse(v.TextShape.text.slice(prefix.length))] : []
  )
const state = (s) => tagged(s, 'review-state-')[0]
const grenades = (s) => tagged(s, 'review-grenade-')
const model = (s, id) =>
  Object.values(s).some((v) => v.GltfContainer?.src.endsWith(`/${id}-view.glb`) && v.VisibilityComponent?.visible)
const count = (s, id) => state(s)?.inventory?.items.find((i) => i.id === id)?.reserve ?? 0
async function row(index) {
  const [w, h] = await c.evaluate('[innerWidth,innerHeight]'),
    k = Math.min(w / 640, h / 480)
  await c.click((w - 640 * k) / 2 + 150 * k, (h - 480 * k) / 2 + (126 + index * 28) * k)
  await pause(200)
}
async function slot() {
  await c.key('keyDown', 'Shift', 'ShiftLeft', 16)
  await c.key('keyDown', '3', 'Digit3', 51, 8)
  await pause(60)
  await c.key('keyUp', '3', 'Digit3', 51, 8)
  await c.key('keyUp', 'Shift', 'ShiftLeft', 16)
  await pause(150)
}
async function select(id) {
  for (let i = 0; i < 4; i++) {
    const before = await c.snapshot()
    if (model(before, id)) {
      await pause(900)
      return
    }
    await slot()
    await c.until((s) => state(s).weapon.revision !== state(before).weapon.revision, 'grenade selection acknowledged')
  }
  throw new Error(`Cannot select ${id}`)
}
async function mouse(type) {
  await c.send('Input.dispatchMouseEvent', { type, x: c.mx, y: c.my, button: 'left', clickCount: 1 })
}
async function save(name) {
  await run('agent-browser', ['--session', session, 'screenshot', `${dir}/${name}.png`], { timeout: 15000 })
}
async function throwNear(id, hold = 600) {
  await select(id)
  const s = await c.snapshot(),
    p = s['1'].Transform.position
  await c.aimAt({ x: p.x, y: p.y - 10, z: p.z + 1 })
  await mouse('mousePressed')
  await pause(hold)
  await mouse('mouseReleased')
  return c.until((s) => grenades(s).some((g) => g.kind === id && g.phase === 'flight'), `${id} thrown`)
}
try {
  await c.connect()
  const deadline = Date.now() + 120000
  while (!(await c.evaluate("typeof window.engine_console_command === 'function'"))) {
    assert.ok(Date.now() < deadline, 'Bevy console becomes available')
    await pause(500)
  }
  await c.until(
    (s) => labels(s).includes('Select a team') && state(s)?.money?.amount === 16000,
    'initialized lobby',
    60000
  )
  await c.join(2)
  await c.until((s) => state(s)?.health?.current === 100 && state(s)?.match?.phase === 'live', 'live round', 20000)
  await row(7)
  await c.until((s) => labels(s).includes('3 FLASHBANG'), 'equipment menu')
  for (const index of [2, 2, 3, 4, 0]) await row(index)
  let s = await c.until(
    (s) =>
      count(s, 'flashbang') === 2 &&
      count(s, 'hegrenade') === 1 &&
      count(s, 'smokegrenade') === 1 &&
      state(s).health.armor === 100,
    'full grenade inventory and kevlar'
  )
  assert.equal(state(s).money.amount, 14350)
  await row(2)
  await row(3)
  await row(4)
  s = await c.snapshot()
  assert.equal(state(s).money.amount, 14350)
  evidence.purchase = { inventory: state(s).inventory, money: state(s).money.amount, carryCapButtonsReject: true }
  await save('equipment')
  await row(8)
  await row(8)
  await c.until((s) => s['2'].PointerLock?.isPointerLocked, 'capture')
  const selected = []
  for (const id of ['flashbang', 'hegrenade', 'smokegrenade', 'flashbang']) {
    await slot()
    s = await c.until((s) => model(s, id), `slot cycles to ${id}`)
    selected.push(id)
  }
  evidence.slotCycle = selected
  const spawn = s['1'].Transform.position
  await pause(900)
  await c.aimAt({ x: spawn.x, y: spawn.y - 10, z: spawn.z + 1 })
  await mouse('mousePressed')
  await c.until((s) => state(s).weapon.mode === 1, 'pin pulled')
  await pause(2000)
  s = await c.snapshot()
  assert.equal(grenades(s).length, 0)
  assert.equal(count(s, 'flashbang'), 2)
  await save('flash-held')
  await mouse('mouseReleased')
  s = await c.until((s) => grenades(s).some((g) => g.kind === 'flashbang'), 'flash throw')
  const flashFlight = grenades(s).find((g) => g.kind === 'flashbang')
  await c.until((s) => model(s, 'awp') && count(s, 'flashbang') === 1, 'flash retires to AWP with one remaining')
  s = await c.until((s) => grenades(s).some((g) => g.kind === 'flashbang' && g.phase === 'exploded'), 'flash detonates')
  const flash = state(s).flashes.find((f) => f.alpha === 255)
  assert.ok(flash, 'looking at near flash causes full white fade')
  const explosion = grenades(s).find((g) => g.kind === 'flashbang')
  assert.ok(explosion.activated - flashFlight.created >= 1.5)
  assert.ok(explosion.activated - flashFlight.created < 1.85)
  evidence.flash = {
    heldForSeconds: 2,
    noCooking: true,
    fuse: explosion.activated - flashFlight.created,
    effect: flash,
    remaining: count(s, 'flashbang'),
    autoSelected: state(s).inventory.active
  }
  await save('flash-white')
  console.log('PASS: prices/caps, grenade cycling, hold without cooking, original flash fuse/fade and weapon return')
  await pause(Math.max(0, (flash.start + flash.hold + flash.fade - Date.now() / 1000) * 1000) + 200)
  s = await throwNear('smokegrenade')
  s = await c.until(
    (s) => grenades(s).some((g) => g.kind === 'smokegrenade' && g.phase === 'smoke'),
    'smoke reaches ground and activates',
    10000
  )
  const smoke = grenades(s).find((g) => g.kind === 'smokegrenade')
  const viewer = s['1'].Transform.position
  await c.aimAt({ x: viewer.x, y: viewer.y + 1.6, z: viewer.z + 10 })
  await pause(800)
  s = await c.snapshot()
  const clouds = Object.values(s).filter((v) =>
    v.Material?.material?.$case === 'unlit'
      ? v.Material.material.unlit.texture?.tex?.texture?.src?.includes('gas_puff')
      : JSON.stringify(v.Material ?? {}).includes('grenade-gas_puff_01.png')
  )
  assert.equal(clouds.length, 20)
  assert.ok(
    clouds.every((cloud) => !cloud.Billboard),
    'source sprites stay parallel to the camera'
  )
  for (const cloud of clouds)
    for (const axis of ['x', 'y', 'z', 'w'])
      assert.ok(
        Math.abs(cloud.Transform.rotation[axis] - s['2'].Transform.rotation[axis]) < 0.001,
        'cloud shares view axes'
      )
  evidence.smoke = {
    center: smoke.center,
    activated: smoke.activated,
    expires: smoke.expires,
    cloudCount: clouds.length,
    canister: Object.values(s).some((v) => v.GltfContainer?.src.endsWith('smokegrenade-projectile.glb'))
  }
  assert.equal(smoke.expires - smoke.activated, 30)
  await save('smoke')
  s = await throwNear('hegrenade')
  await c.until((s) => model(s, 'awp'), 'HE retires to firearm')
  s = await c.until((s) => state(s).health.current < 100, 'HE self-damage with kevlar', 10000)
  assert.ok(state(s).health.current >= 45 && state(s).health.current <= 65, 'armor absorbs half of close HE blast')
  assert.ok(state(s).health.armor < 100)
  evidence.he = {
    health: state(s).health,
    projectile: grenades(s).find((g) => g.kind === 'hegrenade'),
    selected: state(s).inventory.active
  }
  await save('he-explosion')
  console.log('PASS: visible original smoke, animated canister, HE self-damage/armor and weapon return')
  await c.until((s) => !grenades(s).some((g) => g.kind === 'smokegrenade'), 'smoke expires at 30 seconds', 40000)
  s = await c.snapshot()
  assert.ok(!Object.values(s).some((v) => JSON.stringify(v.Material ?? {}).includes('grenade-gas_puff_01.png')))
  evidence.smoke.cleanedUp = true
  await save('smoke-cleared')
  console.log('PASS: smoke visual lifetime and entity cleanup')
  writeFileSync(`${dir}/browser.json`, JSON.stringify(evidence, null, 2) + '\n')
} catch (error) {
  try {
    writeFileSync(`${dir}/failure-state.json`, JSON.stringify(await c.snapshot(), null, 2))
    await save('failure')
  } catch (captureError) {
    console.error('Failure capture:', captureError)
  }
  throw error
} finally {
  await mouse('mouseReleased').catch((error) => console.error('Release failed:', error))
  c.socket.close()
}
