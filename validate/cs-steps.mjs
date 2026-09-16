import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { Client, pause, labels } from './team-client.mjs'
const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16'),
  evidence = {}
const state = (s) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith('review-move-state-') ? [JSON.parse(v.TextShape.text.slice(18))] : []
  )[0]
try {
  await c.connect()
  await c.until((s) => labels(s).includes('Select a team') && state(s)?.health, 'lobby', 60000)
  await c.join(2)
  await c.until((s) => state(s)?.health.current === 100, 'spawn')
  const [w, h] = await c.evaluate('[innerWidth,innerHeight]'),
    k = Math.min(w / 640, h / 480)
  await c.click((w - 640 * k) / 2 + 150 * k, (h - 480 * k) / 2 + (126 + 8 * 28) * k)
  await c.until((s) => state(s)?.match.phase === 'live' && s['2'].PointerLock?.isPointerLocked, 'live', 20000)
  await c.key('keyDown', '3', 'Digit3', 51)
  await pause(80)
  await c.key('keyUp', '3', 'Digit3', 51)
  for (const [x, name] of [
    [29, 'stairs'],
    [35, 'step'],
    [41, 'wall'],
    [47, 'tooHigh'],
    [53, 'ceiling']
  ]) {
    await c.command(`/move_player_to ${x} 40.2 47`)
    await pause(1200)
    await c.aimAt({ x, y: 41.7, z: 90 })
    const a = []
    await c.key('keyDown', 'w', 'KeyW', 87)
    const end = Date.now() + 2500
    while (Date.now() < end) {
      const s = await c.snapshot()
      a.push({ position: s['1'].Transform.position, ...state(s) })
      await pause(60)
    }
    await c.key('keyUp', 'w', 'KeyW', 87)
    evidence[name] = a
    console.log(name, JSON.stringify(a.at(-1).position), 'max y', Math.max(...a.map((v) => v.position.y)))
  }
  writeFileSync(
    process.argv[3] ?? 'validate/game/movement-control/steps.json',
    JSON.stringify(evidence, null, 2) + '\n'
  )
  assert.ok(
    evidence.stairs.some((s) => s.position.z > 51.5 && s.position.y > 40.6),
    'climbs 20cm stairs'
  )
  assert.ok(
    evidence.step.some((s) => s.position.z > 51 && s.position.y > 40.5),
    'climbs 45cm step'
  )
  assert.ok(
    evidence.wall.every((s) => s.position.z < 49.25),
    'solid tall wall blocks movement'
  )
  assert.ok(
    evidence.tooHigh.every((s) => s.position.z < 49.4),
    '50cm obstacle exceeds original step height'
  )
  assert.ok(
    evidence.ceiling.every((s) => s.position.z < 49.4 && s.position.y < 40.25),
    'ceiling collision prevents step lift'
  )
  console.log('PASS: stairs, maximum step and wall blocking')
} finally {
  await c.key('keyUp', 'w', 'KeyW', 87)
  c.socket.close()
}
