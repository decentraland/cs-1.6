import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client, pause, labels } from './team-client.mjs'

const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16')
const dir = resolve(process.argv[3] ?? 'validate/game/dual-hands')
const read = (s) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith('review-held-state-') ? [JSON.parse(v.TextShape.text.slice(18))] : []
  )[0]
const parts = (s) =>
  Object.entries(s).flatMap(([id, v]) => {
    if (!v.GltfContainer || s[v.Transform?.parent]?.AvatarAttach?.avatarId !== 'bot:0') return []
    return [
      {
        id,
        src: v.GltfContainer.src,
        visible: v.VisibilityComponent?.visible,
        loading: v.GltfContainerLoadingState,
        root: v.Transform.parent,
        attach: s[v.Transform.parent].AvatarAttach
      }
    ]
  })
const shown = (s) => parts(s).filter((v) => v.visible)
const evidence = { date: new Date().toISOString(), muted: true, states: {} }
async function mode(expected, visible) {
  await c.key('keyDown', '4', 'Digit4', 52)
  await pause(60)
  await c.key('keyUp', '4', 'Digit4', 52)
  const s = await c.until((s) => read(s)?.mode === expected && shown(s).length === visible, 'held mode ' + expected)
  evidence.states[expected] = { review: read(s), parts: parts(s) }
  return s
}
async function picture(name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${dir}/${name}.png`, Buffer.from(data, 'base64'))
}
mkdirSync(dir, { recursive: true })
try {
  await c.connect()
  let s = await c.until((s) => labels(s).includes('Select a team') || read(s)?.bot, 'lobby', 60000)
  if (labels(s).includes('Select a team')) await c.join(2)
  s = await c.until(
    (s) => read(s)?.bot && (labels(s).includes('0 CANCEL') || s['2'].PointerLock?.isPointerLocked),
    'spawn',
    20000
  )
  if (labels(s).includes('0 CANCEL')) {
    const [w, h] = await c.evaluate('[innerWidth,innerHeight]'),
      k = Math.min(w / 640, h / 480)
    for (let attempt = 0; attempt < 3; attempt++) {
      await c.click((w - 640 * k) / 2 + 150 * k, (h - 480 * k) / 2 + (126 + 8 * 28) * k)
      await pause(700)
      if ((await c.snapshot())['2'].PointerLock?.isPointerLocked) break
    }
  }
  await c.until((s) => s['2'].PointerLock?.isPointerLocked && !labels(s).includes('Prepare to fight!'), 'live', 20000)
  await c.command('/move_player_to 21 11 57.5')
  await pause(2000)
  s = await c.until(
    (s) => shown(s).length === 2 && shown(s).every((p) => p.loading?.currentState === 4),
    'two loaded pistols',
    30000
  )
  const pistols = shown(s)
  assert.deepEqual(pistols.map((p) => p.src).sort(), [
    'assets/scene/weapons/elite-left-world.glb',
    'assets/scene/weapons/elite-world.glb'
  ])
  assert.equal(new Set(pistols.map((p) => p.root)).size, 2, 'independent hand roots')
  assert.deepEqual(pistols.map((p) => p.attach.anchorPointId).sort(), [2, 3], 'left/right hand anchors')
  evidence.states.initial = { review: read(s), parts: parts(s) }
  await c.key('keyDown', '3', 'Digit3', 51)
  await pause(60)
  await c.key('keyUp', '3', 'Digit3', 51)
  await pause(800)
  await c.aimAt({ ...read(s).position, y: read(s).position.y + 1.1 })
  await picture('two-hands')
  s = await mode(1, 1)
  assert.ok(shown(s)[0].src.endsWith('ak47-world.glb'))
  s = await mode(2, 2)
  await pause(1000)
  s = await c.snapshot()
  evidence.states.walking = { review: read(s), parts: parts(s) }
  assert.ok(read(s).position.x > evidence.states.initial.review.position.x + 0.5, 'avatar actually moved')
  await c.aimAt({ ...read(s).position, y: read(s).position.y + 1.1 })
  await picture('walking')
  s = await mode(3, 1)
  assert.ok(shown(s)[0].src.endsWith('knife-world.glb'))
  s = await mode(4, 2)
  await c.key('keyDown', '1', 'Digit1', 49)
  await pause(60)
  await c.key('keyUp', '1', 'Digit1', 49)
  await pause(1600)
  await c.aimAt({ ...read(s).position, y: read(s).position.y + 1.225 })
  await c.shoot(40)
  s = await c.until(
    (s) => read(s)?.bot.alive === false && shown(s).length === 0,
    'real AWP kill hides both hands',
    8000
  )
  evidence.states.dead = { review: read(s), parts: parts(s) }
  await picture('death')
  const entities = parts(s).flatMap((p) => [p.id, String(p.root)])
  s = await mode(5, 0)
  s = await c.until(
    (s) => entities.every((id) => !s[id]?.GltfContainer && !s[id]?.AvatarAttach),
    'despawn removes cached models and hand attachments',
    8000
  )
  evidence.states.removed = {
    review: read(s),
    remaining: entities.filter((id) => s[id]?.GltfContainer || s[id]?.AvatarAttach)
  }
  writeFileSync(`${dir}/browser.json`, JSON.stringify(evidence, null, 2) + '\n')
  console.log(
    'PASS: separate loaded hand models, moving avatar, AK/knife switching, real AWP death and despawn cleanup'
  )
} catch (error) {
  evidence.failure = String(error)
  writeFileSync(`${dir}/failure.json`, JSON.stringify(evidence, null, 2) + '\n')
  throw error
} finally {
  c.socket.close()
}
