import { readHud } from './read-hud.mjs'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import {
  captureMouse,
  ensureRifle,
  equippedGun,
  isBotRoundLive,
  joinCounterTerrorists,
  readViewmodel
} from './solo-flow.mjs'

const endpoint = process.argv[2]
if (!endpoint) throw new Error('Usage: node validate/camera.mjs <browser-CDP-websocket> [evidence.json]')
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
function wrap(a) {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

try {
  const { targetInfos } = await send('Target.getTargets')
  const target = targetInfos.find((t) => t.type === 'page' && t.url.includes('127.0.0.1:8123'))
  assert.ok(target, 'dedicated validation page exists')
  sessionId = (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId
  await send('Page.bringToFront')
  await send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await evaluate("window.engine_console_command('/set_scene Counter-Strike')")
  await evaluate("window.engine_console_command('/reload')")
  await pause(4000)
  const io = { send, evaluate, snapshot }
  const [w, h] = await evaluate('[innerWidth,innerHeight]')
  await joinCounterTerrorists(io, 25000)
  await stateUntil(isBotRoundLive, 'live')
  // Humans spawn with a pistol; sustained recoil needs the purchased rifle.
  await ensureRifle(io)
  await stateUntil(isBotRoundLive, 'live round with the rifle', 20000)
  await captureMouse(io)
  mx = w / 2
  my = h / 2
  const before = await snapshot()
  const base = angles(before['2'].Transform.rotation)
  const restView = readViewmodel(before)
  assert.ok(restView, 'first-person viewmodel is visible')
  console.log('BASE', JSON.stringify({ gun: equippedGun(before), camera: base, viewmodel: restView.tilt }))
  const samples = []
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mx, y: my, button: 'left', clickCount: 1 })
  for (let i = 0; i < 12; i++) {
    await pause(70)
    const state = await snapshot()
    samples.push({
      ...angles(state['2'].Transform.rotation),
      viewmodel: readViewmodel(state),
      hud: readHud(state),
      labels: labels(state),
      locked: state['2'].PointerLock?.isPointerLocked
    })
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1 })
  await pause(1000)
  const settled = await snapshot()
  const final = angles(settled['2'].Transform.rotation)
  const settledView = readViewmodel(settled)
  // Recoil no longer pitches the engine camera: the punch tilts the weapon viewmodel and decays after release.
  const rise = Math.max(...samples.map((s) => (s.viewmodel?.tilt ?? 0) - restView.tilt))
  const cameraDrift = Math.max(...samples.map((s) => Math.abs(s.pitch - base.pitch)))
  console.log('RECOIL', JSON.stringify({ rise, settledTilt: settledView?.tilt, cameraDrift }))
  assert.ok(rise > 0.012, 'sustained fire visibly tilts the weapon viewmodel')
  assert.ok((settledView?.tilt ?? 1) < 0.01, 'viewmodel settles after release')
  assert.ok(cameraDrift < 0.01, 'recoil leaves the engine camera pitch alone')
  assert.ok(Math.abs(final.pitch - base.pitch) < 0.01, 'camera stays on the mouse aim')
  mx += Math.PI / 4 / 0.005236
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx, y: my })
  await pause(200)
  const rotated = await snapshot()
  const view = angles(rotated['2'].Transform.rotation)
  assert.ok(Math.abs(wrap(view.yaw - base.yaw) - Math.PI / 4) < 0.08, 'mouse controls camera yaw')
  const from = rotated['1'].Transform.position
  await key('w', 'KeyW', 87, 450)
  const moved = await snapshot()
  const to = moved['1'].Transform.position
  const dx = to.x - from.x,
    dz = to.z - from.z
  const distance = Math.hypot(dx, dz)
  const alignment = (dx * Math.sin(view.yaw) + dz * Math.cos(view.yaw)) / distance
  assert.ok(distance > 0.6, 'W moves player')
  assert.ok(alignment > 0.9, 'W follows the rotated camera heading')
  const evidence = {
    date: new Date().toISOString(),
    input: 'left mouse',
    gun: equippedGun(before),
    viewmodelRiseRadians: rise,
    viewmodelSettledRadians: settledView?.tilt,
    cameraDriftRadians: cameraDrift,
    settledPitch: final.pitch,
    basePitch: base.pitch,
    mouseYawRadians: wrap(view.yaw - base.yaw),
    movement: { distance, alignment },
    samples
  }
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(evidence, null, 2) + '\n')
  console.log('PASS: viewmodel recoil → recovery with a still camera → mouse turn → movement follows camera')
} finally {
  if (sessionId) {
    await evaluate('document.exitPointerLock()').catch((error) => console.warn(error.message))
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1 })
  }
  socket.close()
}
