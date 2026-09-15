import { readHud } from './read-hud.mjs'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import {
  captureMouse,
  ensureRifle,
  equippedGun,
  GUN_FIRE_MS,
  isBotRoundLive,
  joinCounterTerrorists,
  readViewmodel
} from './solo-flow.mjs'

const endpoint = process.argv[2]
if (!endpoint) throw new Error('Usage: node validate/cadence.mjs <browser-CDP-websocket> [evidence.json]')
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
  // Humans spawn with a pistol; full-auto cadence needs the purchased rifle.
  await ensureRifle(io)
  await stateUntil(isBotRoundLive, 'live round with the rifle', 20000)
  await captureMouse(io)
  mx = w / 2
  my = h / 2
  const gun = equippedGun(await snapshot())
  assert.ok(GUN_FIRE_MS[gun], `rifle equipped: ${gun}`)
  const readings = []
  const start = Date.now()
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mx, y: my, button: 'left', clickCount: 1 })
  let empty = false
  while (Date.now() - start < 6000) {
    const state = await snapshot()
    const hud = readHud(state)
    const ammo = hud?.clip === undefined || hud.reserve === undefined ? undefined : `${hud.clip} | ${hud.reserve}`
    readings.push({ ms: Date.now() - start, ammo, tilt: readViewmodel(state)?.tilt })
    if (ammo === '0 | 90') {
      empty = true
      break
    }
    await pause(60)
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1 })
  assert.ok(empty, 'holding left mouse consumes the full magazine')
  const first = readings.find((r) => r.ammo && r.ammo !== '30 | 90')
  const duration = readings.at(-1).ms - first.ms
  const expectedMs = 29 * GUN_FIRE_MS[gun]
  console.log('MAGAZINE', JSON.stringify({ gun, duration, shots: 30, expectedMs }))
  assert.ok(
    duration >= expectedMs - 400 && duration <= expectedMs + 500,
    `29 ${gun} firing intervals took ${duration} ms; expected about ${expectedMs} ms`
  )
  const reloaded = await stateUntil(
    (s) => readHud(s)?.clip === 30 && readHud(s)?.reserve === 60,
    'automatic reload conserves ammo',
    4000
  )
  // Recoil tilts the first-person viewmodel (the engine camera is no longer punched).
  assert.ok((readViewmodel(reloaded)?.tilt ?? 1) < 0.01, 'viewmodel recoil settles after release')
  const evidence = {
    date: new Date().toISOString(),
    input: 'left mouse',
    gun,
    durationMs: duration,
    expectedMs,
    readings,
    reloaded: readHud(reloaded)
  }
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(evidence, null, 2) + '\n')
  console.log('PASS: full-auto cadence → 30 rounds → release → automatic reload')
} finally {
  if (sessionId) {
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1 })
    await evaluate('document.exitPointerLock()').catch((error) => console.warn(error.message))
  }
  socket.close()
}
