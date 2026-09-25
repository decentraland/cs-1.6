import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { writeFileSync, mkdirSync } from 'node:fs'
import { Client, pause, labels, readHud } from './team-client.mjs'
import { cameraAtZoom, readSceneCamera } from './read-camera.mjs'
const endpoint = process.argv[2],
  dir = resolve(process.argv[3] ?? 'validate/game/native-scope')
assert.ok(endpoint, 'Pass the isolated browser CDP endpoint; start with an unscoped AWP and captured mouse')
mkdirSync(dir, { recursive: true })
const c = new Client(endpoint, 'https://decentraland.org/bevy-web/', 'CS16'),
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
    const s = await c.until((state) => cameraAtZoom(state, zoom), `native camera FOV ${zoom}`),
      camera = readSceneCamera(s)
    assert.ok(!Object.values(s).some((value) => value.TextureCamera), 'no duplicate scene render')
    await pause(400)
    const name = zoom === 90 ? 'awp-idle' : `awp-scope-${zoom}`
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(`${dir}/${name}.png`, Buffer.from(data, 'base64'))
    results.push({ zoom, camera, hud: readHud(s) })
  }
  const before = readHud(await c.snapshot()).clip
  assert.ok(before > 0, 'loaded AWP')
  await c.shoot(45)
  await c.until(
    (s) =>
      Object.values(s).some((v) => v.GltfContainer?.src.endsWith('/awp-view.glb') && v.VisibilityComponent?.visible) &&
      cameraAtZoom(s, 90),
    'bolt leaves scope'
  )
  await c.until((s) => readHud(s).clip < before, 'scoped shot consumes authoritative ammo')
  await c.until(
    (s) =>
      Object.values(s).some((v) => v.GltfContainer?.src.endsWith('/awp-view.glb') && !v.VisibilityComponent?.visible) &&
      cameraAtZoom(s, 10),
    'bolt restores scope',
    5000
  )
  writeFileSync(
    `${dir}/scope.json`,
    JSON.stringify({ levels: results, boltUnscope: true, boltRescope: true, textureCamera: false }, null, 2)
  )
  console.log('PASS: AWP 40/10-degree native-camera zoom, scoped shot, automatic bolt unscope/rescope')
} finally {
  c.socket.close()
}
