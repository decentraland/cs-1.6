import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { writeFileSync, mkdirSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Client, pause, labels, readHud } from './team-client.mjs'
const endpoint = process.argv[2],
  dir = resolve(process.argv[3] ?? 'validate/game/arsenal'),
  browserSession = process.argv[4] ?? 'cs16-arsenal-review'
assert.ok(endpoint, 'Pass the isolated browser CDP endpoint; start with an unscoped AWP and captured mouse')
mkdirSync(dir, { recursive: true })
const c = new Client(endpoint, 'https://decentraland.org/bevy-web/', 'CS16'),
  run = promisify(execFile),
  results = []
async function tap() {
  await c.key('keyDown', 'e', 'KeyE', 69)
  await pause(60)
  await c.key('keyUp', 'e', 'KeyE', 69)
}
try {
  await c.connect()
  const start = await c.snapshot()
  assert.ok(
    labels(start).some((v) => v.includes('AWP')),
    'AWP equipped'
  )
  assert.ok(start['2'].PointerLock?.isPointerLocked, 'mouse captured')
  for (const zoom of [90, 40, 10]) {
    if (zoom !== 90) await tap()
    await pause(700)
    const s = await c.snapshot(),
      camera = Object.values(s).find((v) => v.TextureCamera)?.TextureCamera
    assert.ok(camera, 'scoped weapon has a warm render target')
    const fov = camera.mode?.perspective?.fieldOfView
    if (zoom !== 90)
      assert.ok(
        Math.abs(fov - 2 * Math.atan(Math.tan((zoom * Math.PI) / 360) * 0.75)) < 1e-5,
        'actual render camera FOV'
      )
    const name = zoom === 90 ? 'awp-idle' : `awp-scope-${zoom}`
    await run('agent-browser', ['--session', browserSession, 'screenshot', `${dir}/${name}.png`], { timeout: 15000 })
    results.push({ zoom, camera, hud: readHud(s) })
  }
  const before = readHud(await c.snapshot()).clip
  assert.ok(before > 0, 'loaded AWP')
  await c.shoot(45)
  let s = await c.until(
    (s) =>
      Object.values(s).some((v) => v.GltfContainer?.src.endsWith('/awp-view.glb') && v.VisibilityComponent?.visible),
    'bolt leaves scope'
  )
  await c.until((s) => readHud(s).clip < before, 'scoped shot consumes authoritative ammo')
  await c.until(
    (s) =>
      Object.values(s).some((v) => v.GltfContainer?.src.endsWith('/awp-view.glb') && !v.VisibilityComponent?.visible),
    'bolt restores scope',
    5000
  )
  writeFileSync(`${dir}/scope.json`, JSON.stringify({ levels: results, boltUnscope: true, boltRescope: true }, null, 2))
  console.log('PASS: AWP 40/10-degree render-camera zoom, scoped shot, automatic bolt unscope/rescope')
} finally {
  c.socket.close()
}
