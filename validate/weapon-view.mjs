import assert from 'node:assert/strict'

const endpoint = process.argv[2]
if (!endpoint) throw new Error('Usage: node validate/weapon-view.mjs <browser-CDP-websocket>')
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
const snapshot = () => evaluate("window.engine_console_command('/crdt_snapshot').then(JSON.parse)")
function weapon(state) {
  const entries = Object.values(state).filter((c) => c.GltfContainer?.src.includes('/weapons/'))
  assert.equal(entries.length, 1, 'exactly one first-person weapon')
  return entries[0]
}
function ammo(state) {
  const labels = Object.values(state).map((c) => c.UiText?.value).filter(Boolean)
  const value = labels.find((text) => /^\d+ \/ \d+$/.test(text))
  assert.ok(value, 'server-backed ammunition HUD is present')
  const [clip, reserve] = value.split(' / ').map(Number)
  return { clip, reserve }
}
async function waitForState(predicate, description) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const state = await snapshot()
    if (predicate(state)) return state
    await pause(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
async function key(key, code, vk, duration) {
  try {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk })
    await pause(duration)
  } finally {
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk })
  }
}

try {
  const { targetInfos } = await send('Target.getTargets')
  const target = targetInfos.find((t) => t.type === 'page' && t.url.includes('127.0.0.1:8123'))
  assert.ok(target, 'local scene preview is open')
  sessionId = (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId
  await send('Page.bringToFront')
  await evaluate("document.querySelector('canvas').focus(); document.querySelector('canvas').requestPointerLock()", true)
  await pause(500)
  await evaluate("window.engine_console_command('/set_scene SDK7')")
  const beforeState = await snapshot()
  const before = weapon(beforeState)
  const initialAmmo = ammo(beforeState)
  assert.ok(initialAmmo.clip >= 5 && initialAmmo.reserve >= 5, 'test needs ammunition; reload the local scene if depleted')
  assert.equal(before.Transform.parent, 2, 'weapon follows camera')
  assert.equal(before.GltfContainerLoadingState.currentState, 4, 'GLB finished loading')
  assert.equal(before.GltfContainer.visibleMeshesCollisionMask, 0, 'weapon cannot intercept shots')
  await key('e', 'KeyE', 69, 350)
  await pause(250)
  const firingState = await waitForState((state) => ammo(state).clip < initialAmmo.clip, 'server ammunition consumption')
  const firing = weapon(firingState)
  const firedAmmo = ammo(firingState)
  assert.ok(firedAmmo.clip < initialAmmo.clip, 'accepted shots consume server ammo')
  assert.equal(firedAmmo.reserve, initialAmmo.reserve)
  assert.ok(firing.Animator.states.some((s) => s.clip === 'fire' && s.playing), 'fire input starts fire clip')
  await key('f', 'KeyF', 70, 150)
  await pause(250)
  const reloadState = await waitForState((state) => weapon(state).Animator.states.some((s) => s.clip === 'reload' && s.playing), 'reload acknowledgement')
  const reloading = weapon(reloadState)
  const reloadAmmo = ammo(reloadState)
  assert.ok(reloadAmmo.clip <= firedAmmo.clip, 'reload does not grant ammunition early')
  assert.equal(reloadAmmo.reserve, initialAmmo.reserve)
  assert.ok(reloading.Animator.states.some((s) => s.clip === 'reload' && s.playing), 'reload input starts reload clip')
  await key('e', 'KeyE', 69, 250)
  await pause(250)
  assert.deepEqual(ammo(await snapshot()), reloadAmmo, 'firing during reload spends no ammunition')
  await pause(3000)
  const idleState = await waitForState((state) => ammo(state).clip === 30 && weapon(state).Animator.states.some((s) => s.clip === 'idle' && s.playing), 'reload completion')
  const idle = weapon(idleState)
  const finalAmmo = ammo(idleState)
  assert.equal(finalAmmo.clip, 30, 'reload fills the AK magazine')
  assert.equal(finalAmmo.clip + finalAmmo.reserve, reloadAmmo.clip + reloadAmmo.reserve, 'reload conserves ammunition')
  assert.ok(idle.Animator.states.some((s) => s.clip === 'idle' && s.playing), 'reload finishes in idle')
  console.log('PASS: one loaded camera weapon; server ammo consumed; reload blocks fire, conserves ammo, and returns to idle')
  console.log(JSON.stringify({ initialAmmo, firedAmmo, reloadAmmo, finalAmmo }))
} finally {
  if (sessionId) await evaluate('document.exitPointerLock()').catch((error) => console.warn(error.message))
  socket.close()
}
