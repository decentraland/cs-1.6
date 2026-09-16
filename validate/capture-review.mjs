import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client, pause, readHud } from './team-client.mjs'
const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16')
const evidence = []
const dir = resolve(process.argv[3] ?? 'validate/game/penetration')
mkdirSync(dir, { recursive: true })
try {
  await c.connect()
  await c.key('keyDown', '1', 'Digit1', 49)
  await pause(50)
  await c.key('keyUp', '1', 'Digit1', 49)
  await pause(1800)
  const scoped = (s) =>
    Object.values(s).some((v) => v.GltfContainer?.src.endsWith('/awp-view.glb') && !v.VisibilityComponent?.visible)
  if (!scoped(await c.snapshot())) {
    await c.key('keyDown', 'e', 'KeyE', 69)
    await pause(50)
    await c.key('keyUp', 'e', 'KeyE', 69)
  }
  await c.until(scoped, 'AWP scope active')
  assert.ok(
    Object.values(await c.snapshot()).some((v) => v.TextureCamera),
    'scope render target exists'
  )
  await c.key('keyDown', '2', 'Digit2', 50)
  await pause(50)
  await c.key('keyUp', '2', 'Digit2', 50)
  await pause(1500)
  const beforeSwitch = readHud(await c.snapshot())
  assert.ok(beforeSwitch.clip >= 3, 'USP has ammunition for the capture checks')
  assert.ok(
    !Object.values(await c.snapshot()).some((v) => v.TextureCamera),
    'switching to USP releases the scope render target'
  )
  for (const duration of [10, 70, 250]) {
    await c.evaluate('document.exitPointerLock()')
    await c.until((s) => !s['2'].PointerLock?.isPointerLocked, 'pointer released')
    const before = readHud(await c.snapshot()).clip
    await c.click(640, 320, duration)
    await c.until((s) => s['2'].PointerLock?.isPointerLocked, 'pointer captured')
    await pause(300)
    assert.equal(readHud(await c.snapshot()).clip, before, `capture ${duration}ms does not fire`)
    await c.shoot(60)
    const after = await c.until(
      (s) => readHud(s).clip === before - 1,
      `first intentional shot after ${duration}ms capture`
    )
    evidence.push({ duration, before, after: readHud(after).clip })
  }
  writeFileSync(`${dir}/capture.json`, JSON.stringify({ scopedWeaponSwitchPassed: true, captures: evidence }, null, 2))
  console.log(
    'PASS: switch out of scope, capture at 10/70/250ms, first intentional shot accepted',
    JSON.stringify(evidence)
  )
} finally {
  c.socket.close()
}
