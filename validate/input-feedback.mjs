import { readHud } from './read-hud.mjs'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { captureMouse, ensureRifle, isBotRoundLive, joinCounterTerrorists, readViewmodel } from './solo-flow.mjs'

const endpoint = process.argv[2]
if (!endpoint) throw new Error('Usage: node validate/input-feedback.mjs <browser-CDP-websocket> [evidence.json]')
const socket = new WebSocket(endpoint)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let nextId = 0
let sessionId
const pending = new Map()
socket.addEventListener('message', ({ data }) => {
  const response = JSON.parse(data)
  const entry = pending.get(response.id)
  if (!entry) return
  pending.delete(response.id)
  clearTimeout(entry.timeout)
  if (response.error) entry.reject(new Error(JSON.stringify(response.error)))
  else entry.resolve(response.result)
})
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    const timeout = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`${method} timed out`))
    }, 15000)
    pending.set(id, { resolve, reject, timeout })
    socket.send(JSON.stringify({ id, method, params, sessionId }))
  })
}
async function evaluate(expression, userGesture = false) {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture })
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails))
  return response.result.value
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const snapshot = () =>
  evaluate(
    "window.engine_console_command('/set_scene Counter-Strike').then(()=>window.engine_console_command('/crdt_snapshot')).then(JSON.parse)"
  )
async function key(key, code, vk, duration) {
  try {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk })
    await pause(duration)
  } finally {
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk })
  }
}

const labels = (state) =>
  Object.values(state)
    .filter((c) => c.UiText)
    .map((c) => c.UiText.value)
let mx = 0,
  my = 0
async function stateUntil(predicate, message, timeout = 10000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const state = await snapshot()
    if (predicate(state)) return state
    await pause(100)
  }
  throw new Error(`Timed out: ${message}`)
}
function angles(q) {
  return {
    yaw: Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y)),
    pitch: Math.asin(Math.max(-1, Math.min(1, 2 * (q.y * q.z - q.w * q.x))))
  }
}

try {
  const { targetInfos } = await send('Target.getTargets')
  const target = targetInfos.find((t) => t.type === 'page' && t.url.includes('127.0.0.1:8123'))
  assert.ok(target, 'dedicated validation page exists')
  sessionId = (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId
  await send('Page.bringToFront')
  await send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await evaluate("window.engine_console_command('/set_scene Counter-Strike')")
  const io = { send, evaluate, snapshot }
  const [w, h] = await evaluate('[innerWidth,innerHeight]')
  if (labels(await snapshot()).includes('Select a team')) await joinCounterTerrorists(io)
  await stateUntil(isBotRoundLive, 'live bot round', 35000)
  // Humans spawn with a pistol; the AK viewmodel animation check needs the purchased rifle.
  await ensureRifle(io)
  await stateUntil(isBotRoundLive, 'live round with the rifle', 20000)
  await captureMouse(io)
  mx = w / 2
  my = h / 2
  const before = await snapshot()
  const base = angles(before['2'].Transform.rotation)
  const restView = readViewmodel(before)
  assert.ok(restView, 'first-person viewmodel is visible')
  const spheres = (state) => Object.keys(state).filter((id) => state[id].MeshRenderer?.mesh?.sphere !== undefined)
  const initialSpheres = new Set(spheres(before))
  const fireAnimation = (state) =>
    Object.values(state).some(
      (value) =>
        value.GltfContainer?.src === 'assets/scene/weapons/ak47.glb' &&
        value.Animator?.states?.some((animation) => animation.clip === 'fire' && animation.playing)
    )
  const samples = []
  const started = Date.now()
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mx, y: my, button: 'left', clickCount: 1 })
  await pause(35)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1 })
  while (Date.now() - started < 900) {
    const state = await snapshot()
    samples.push({
      ms: Date.now() - started,
      // Recoil punch tilts the weapon viewmodel; the engine camera keeps the mouse aim.
      tilt: (readViewmodel(state)?.tilt ?? 0) - restView.tilt,
      cameraPitch: angles(state['2'].Transform.rotation).pitch - base.pitch,
      fireAnimation: fireAnimation(state),
      impact: spheres(state).some((id) => !initialSpheres.has(id))
    })
    await pause(12)
  }
  const kick = samples.find((sample) => sample.tilt > 0.003)
  const impact = samples.find((sample) => sample.impact)
  const animation = samples.find((sample) => sample.fireAnimation)
  assert.ok(kick && impact && animation, 'viewmodel kick, weapon fire animation, and server impact were observed')
  assert.ok(kick.ms < 200, `viewmodel kick appeared after ${kick.ms}ms`)
  assert.ok(animation.ms < 200, `weapon animation appeared after ${animation.ms}ms`)
  assert.ok(impact.ms - kick.ms > 150, 'local viewmodel kick precedes deliberately delayed server feedback')
  assert.ok(
    samples.filter((sample) => sample.ms > 350).every((sample) => Math.abs(sample.tilt) < 0.003),
    'late acknowledgement does not kick the viewmodel again'
  )
  assert.ok(
    samples.every((sample) => Math.abs(sample.cameraPitch) < 0.003),
    'the shot never pitches the engine camera'
  )
  console.log('FEEDBACK', JSON.stringify({ kick: kick.ms, animation: animation.ms, impact: impact.ms }))
  const gap = (state) => {
    const arms = Object.values(state).filter(
      (value) =>
        value.UiTransform?.width === 10 && value.UiTransform?.height === 2 && value.UiBackground?.color?.g === 1
    )
    return Math.max(...arms.map((value) => value.UiTransform.positionLeft))
  }
  const motion = []
  const record = async (label, duration) => {
    const started = Date.now()
    while (Date.now() - started < duration) {
      const state = await snapshot()
      motion.push({ label, ms: Date.now(), gap: gap(state), position: state['1'].Transform.position })
      await pause(35)
    }
  }
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Shift',
    code: 'ShiftLeft',
    windowsVirtualKeyCode: 16,
    modifiers: 8
  })
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'w',
    code: 'KeyW',
    windowsVirtualKeyCode: 87,
    modifiers: 8
  })
  await record('walk-forward', 500)
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'd',
    code: 'KeyD',
    windowsVirtualKeyCode: 68,
    modifiers: 8
  })
  await record('walk-diagonal', 700)
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'd',
    code: 'KeyD',
    windowsVirtualKeyCode: 68,
    modifiers: 8
  })
  await record('walk-forward-again', 400)
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'w',
    code: 'KeyW',
    windowsVirtualKeyCode: 87,
    modifiers: 8
  })
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Shift',
    code: 'ShiftLeft',
    windowsVirtualKeyCode: 16,
    modifiers: 0
  })
  assert.ok(
    motion.every((sample) => sample.gap <= 6),
    `walking crosshair gaps: ${motion.map((sample) => sample.gap)}`
  )
  const diagonal = motion.filter((sample) => sample.label === 'walk-diagonal')
  const first = diagonal[0],
    last = diagonal.at(-1)
  const speed =
    Math.hypot(last.position.x - first.position.x, last.position.z - first.position.z) / ((last.ms - first.ms) / 1000)
  assert.ok(speed > 1.5 && speed < 3.5, `diagonal walking speed ${speed}m/s`)
  console.log('WALK', JSON.stringify({ speed, gaps: motion.map((sample) => sample.gap) }))
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83 })
  const run = await stateUntil((state) => gap(state) >= 15, 'running still expands crosshair', 3000)
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83 })
  const evidence = {
    date: new Date().toISOString(),
    feedbackDelayMs: 400,
    firstKickMs: kick.ms,
    firstAnimationMs: animation.ms,
    firstImpactMs: impact.ms,
    diagonalSpeed: speed,
    runningGap: gap(run),
    samples,
    motion
  }
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(evidence, null, 2) + '\n')
  console.log(
    'PASS: immediate viewmodel/weapon feedback → delayed acknowledgement without second kick → stable Shift W+D crosshair → running expansion'
  )
  console.log(
    JSON.stringify({
      firstKickMs: kick.ms,
      firstAnimationMs: animation.ms,
      firstImpactMs: impact.ms,
      diagonalSpeed: speed
    })
  )
} finally {
  if (sessionId) {
    for (const [key, code, vk] of [
      ['w', 'KeyW', 87],
      ['d', 'KeyD', 68],
      ['s', 'KeyS', 83],
      ['Shift', 'ShiftLeft', 16]
    ])
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers: 0 })
    await evaluate('document.exitPointerLock()').catch((error) => console.warn(error.message))
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1 })
  }
  socket.close()
}
