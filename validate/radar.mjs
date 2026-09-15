import assert from 'node:assert/strict'
import { writeFile, mkdir } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { Client, pause, labels, readHud, startTeamMatch } from './team-client.mjs'
if (process.argv.length < 5)
  throw new Error('Usage: node validate/radar.mjs <CT-A-CDP> <CT-B-CDP> <T-CDP> [--live] (fresh realm unless --live)')
const clients = process.argv.slice(2, 5).map((url) => new Client(url)),
  [a, b, t] = clients
const evidence = { date: new Date().toISOString(), checks: [] }
const directory = fileURLToPath(new URL('./game/radar/', import.meta.url))
function radar(s) {
  const entry = Object.entries(s).find(([, v]) => v.UiBackground?.texture?.tex?.texture?.src === 'assets/ui/radar.png')
  if (!entry) return undefined
  const [id, panel] = entry
  const markers = Object.entries(s)
    .filter(([, v]) => v.UiTransform?.parent === Number(id))
    .map(([id, v]) => ({
      x: v.UiTransform.positionLeft - 64,
      y: v.UiTransform.positionTop - 64,
      parts: Object.values(s)
        .filter((v) => v.UiTransform?.parent === Number(id))
        .map((v) => ({ color: v.UiBackground?.color, width: v.UiTransform.width, height: v.UiTransform.height }))
    }))
  return { width: panel.UiTransform.width, height: panel.UiTransform.height, markers }
}
try {
  await Promise.all(clients.map((c) => c.connect()))
  if (!process.argv.includes('--live')) {
    await a.until((s) => labels(s).includes('Select a team'), 'fresh team menu', 50000)
    assert.equal(radar(await a.snapshot()), undefined)
    evidence.warmUp = await startTeamMatch(a, 2, [
      [b, 2],
      [t, 1]
    ])
  }
  await a.until(
    (s) => readHud(s)?.health === 100 && !labels(s).includes('Prepare to fight!') && readHud(s)?.seconds > 10,
    'live round'
  )
  for (const c of clients) {
    await c.evaluate('document.exitPointerLock()')
    await c.capture()
  }
  await a.command('/move_player_to 90 14 52')
  await b.command('/move_player_to 94 14 52')
  await pause(1800)
  let state = await a.snapshot()
  let view = radar(state)
  assert.equal(view.width, 128)
  assert.equal(view.height, 128)
  assert.equal(view.markers.length, 1)
  assert.equal(radar(await t.snapshot()).markers.length, 0)
  evidence.checks.push('128px radar; CT sees one teammate and T sees no enemies')
  const bp = (await b.snapshot())['1'].Transform.position,
    ap = state['1'].Transform.position
  await a.aimAt({ ...bp, y: ap.y + 1.6 })
  await a.until((s) => {
    const m = radar(s)?.markers[0]
    return m && Math.abs(m.x) <= 1 && m.y < 0
  }, 'teammate ahead')
  state = await a.snapshot()
  evidence.ahead = radar(state)
  await a.aimAt({ x: ap.x, y: ap.y + 1.6, z: ap.z + 10 })
  await a.until((s) => {
    const m = radar(s)?.markers[0]
    return m && m.x > 0 && Math.abs(m.y) <= 1
  }, 'teammate right after camera turns')
  evidence.right = radar(await a.snapshot())
  evidence.checks.push('teammate marker rotates ahead to right with camera yaw')
  // Shift+4 drops the C4.
  await t.key('keyDown', 'Shift', 'ShiftLeft', 16)
  await t.key('keyDown', '4', 'Digit4', 52, 8)
  await t.key('keyUp', '4', 'Digit4', 52, 8)
  await t.key('keyUp', 'Shift', 'ShiftLeft', 16)
  const dropped = await t.until(
    (s) => radar(s)?.markers.some((m) => m.parts.some((p) => p.color.r === 1 && p.color.g === 0)),
    'T sees dropped C4'
  )
  const dp = dropped['1'].Transform.position
  await t.command(`/move_player_to ${dp.x + 3} ${dp.y + 1} ${dp.z}`)
  assert.equal(radar(await a.snapshot()).markers.length, 1)
  await t.until((s) => radar(s)?.markers.length === 0, 'C4 flash off')
  await t.until((s) => radar(s)?.markers.length === 1, 'C4 flash on')
  evidence.checks.push('dropped C4 flashes for T only')
  await mkdir(directory, { recursive: true })
  await promisify(execFile)(
    'agent-browser',
    ['--session', 'cs16-radar-a', 'screenshot', join(directory, 'teammate.png')],
    { timeout: 45000 }
  )
  await a.command('/move_player_to 90 14 52')
  await t.command('/move_player_to 94 14 52')
  await b.command('/move_player_to 90 14 64')
  await pause(1800)
  const feet = (await a.snapshot())['1'].Transform.position
  await t.aimAt({ ...feet, y: feet.y + 1.6 })
  for (let i = 0; i < 6; i++) {
    await t.shoot(70)
    await pause(400)
    if (readHud(await a.snapshot()).health === 0) break
  }
  await a.until((s) => readHud(s)?.health === 0, 'observer killed')
  assert.equal(radar(await a.snapshot()), undefined)
  await b.until((s) => radar(s)?.markers.length === 0, 'dead teammate removed')
  evidence.checks.push('death hides own radar and removes dead teammate from survivor radar')
  await writeFile(join(directory, 'results.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify(evidence, null, 2))
} finally {
  for (const c of clients) c.socket.close()
}
