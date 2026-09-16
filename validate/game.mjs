import { readHud } from './read-hud.mjs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readTextEntities, readTeamScore, readScoreRows } from './read-scoreboard.mjs'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { captureScoreboardViewports } from './scoreboard-screenshots.mjs'
import { captureMouse, ensureRifle, isBotRoundLive, joinTerrorists, stateUntil as waitFor } from './solo-flow.mjs'

const endpoint = process.argv[2]
if (!endpoint) throw new Error('Usage: node validate/game.mjs <browser-CDP-websocket> [evidence.json] [--fresh-page]')
const evidencePath = process.argv.slice(3).find((argument) => !argument.startsWith('--'))
const browserSessionIndex = process.argv.indexOf('--browser-session')
const browserSession = browserSessionIndex < 0 ? undefined : process.argv[browserSessionIndex + 1]
if (process.argv.includes('--screenshots') && (!browserSession || browserSession.startsWith('--')))
  throw new Error('--screenshots requires --browser-session <owned agent-browser session>')
const socket = new WebSocket(endpoint)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let nextId = 0
const audioLogs = []
let soundEvidence = []
let sessionId
const pending = new Map()
socket.addEventListener('message', ({ data }) => {
  const response = JSON.parse(data)
  if (response.method === 'Runtime.consoleAPICalled') {
    const text = (response.params.args ?? []).map((arg) => arg.value ?? arg.description ?? '').join(' ')
    if (/audio|\.wav|sound|decod/i.test(text)) audioLogs.push(`${response.params.type}: ${text.slice(0, 200)}`)
    return
  }
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
async function key(key, code, vk, duration) {
  try {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk })
    await pause(duration)
  } finally {
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk })
  }
}

const labels = (state) => readTextEntities(state).map((c) => c.UiText.value)
const enemies = (state) =>
  Object.entries(state).filter(
    ([, c]) => c.MeshCollider && c.Transform && c.GltfContainer?.src.startsWith('assets/scene/players/')
  )
// Bots head for the bomb sites rather than the player, so only shoot ones with a clear line of sight.
const worldOutput = mkdtempSync(join(tmpdir(), 'cs16-game-world-'))
execFileSync(process.execPath, [
  join(fileURLToPath(new URL('../', import.meta.url)), 'node_modules', 'typescript', 'bin', 'tsc'),
  join(fileURLToPath(new URL('../', import.meta.url)), 'src', 'world-query.ts'),
  '--target',
  'es2020',
  '--module',
  'commonjs',
  '--outDir',
  worldOutput,
  '--skipLibCheck'
])
const { mapDistance } = createRequire(import.meta.url)(join(worldOutput, 'world-query.js'))
function visibleFrom(eye, feet) {
  const target = { x: feet.x, y: feet.y + 1.05, z: feet.z }
  const dx = target.x - eye.x,
    dy = target.y - eye.y,
    dz = target.z - eye.z
  const distance = Math.hypot(dx, dy, dz)
  if (distance < 0.5) return true
  return mapDistance(eye, { x: dx / distance, y: dy / distance, z: dz / distance }, distance) >= distance - 0.3
}
const io = { send, evaluate, snapshot }
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
const shiftOne = (type) =>
  send('Input.dispatchKeyEvent', { type, key: '1', code: 'Digit1', windowsVirtualKeyCode: 49, modifiers: 8 })
const shift = (type) =>
  send('Input.dispatchKeyEvent', { type, key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 })
// Shift+1 holds the scoreboard (no Tab in the explorer).
async function scoreSnapshot() {
  await shift('keyDown')
  await shiftOne('keyDown')
  try {
    await pause(200)
    return await snapshot()
  } finally {
    await shiftOne('keyUp')
    await shift('keyUp')
  }
}
async function shoot(duration) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mx, y: my, button: 'left', clickCount: 1 })
  await pause(duration)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1 })
}
async function startGame() {
  const [w, h] = await evaluate('[innerWidth,innerHeight]')
  const frozen = await joinTerrorists(io)
  await key('w', 'KeyW', 87, 300)
  const after = await snapshot()
  assert.ok(
    Math.hypot(
      after['1'].Transform.position.x - frozen['1'].Transform.position.x,
      after['1'].Transform.position.z - frozen['1'].Transform.position.z
    ) < 0.15,
    'freeze blocks movement'
  )
  await stateUntil(isBotRoundLive, 'live phase')
  if (!(await snapshot())['2'].PointerLock?.isPointerLocked) {
    mx = w / 2
    my = h / 2
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx, y: my })
    await pause(150)
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mx, y: my, button: 'left', clickCount: 1 })
    await pause(100)
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1 })
  }
  await stateUntil((s) => s['2'].PointerLock?.isPointerLocked, 'initial mouse capture')
  await evaluate('document.exitPointerLock()')
  await stateUntil((s) => !s['2'].PointerLock?.isPointerLocked, 'cursor release')
  const [cw, ch] = await evaluate('[innerWidth,innerHeight]')
  mx = cw / 2
  my = ch / 2
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx, y: my })
  await pause(150)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mx, y: my, button: 'left', clickCount: 1 })
  await pause(100)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1 })
  await stateUntil((s) => s['2'].PointerLock?.isPointerLocked, 'left click recaptures the mouse')
  console.log('LOCK', JSON.stringify((await snapshot())['2'].PointerLock))
  // Humans spawn with a pistol; the three-kill sweep below wants a rifle, so lose two rounds and buy an M4A1.
  const armed = await ensureRifle(io)
  console.log('ARMED', JSON.stringify(armed))
  lostRounds = armed.lostRounds
  const live = await waitFor(io, isBotRoundLive, 'live phase with a rifle', 20000)
  await captureMouse(io)
  mx = w / 2
  my = h / 2
  return live
}
let lostRounds = 0
function angles(q) {
  return {
    yaw: Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y)),
    pitch: Math.asin(Math.max(-1, Math.min(1, 2 * (q.y * q.z - q.w * q.x))))
  }
}
function wrap(a) {
  return Math.atan2(Math.sin(a), Math.cos(a))
}
// Lead running bots: the snapshot is ~0.2 s stale by the time the shot lands, and a bot covers
// a metre in that time.
const lastSeen = new Map()
const LEAD_SECONDS = 0.22
function leadPosition(id, position) {
  const now = Date.now()
  const previous = lastSeen.get(id)
  lastSeen.set(id, { position, at: now })
  if (!previous || now - previous.at < 40 || now - previous.at > 1500) return position
  const dt = (now - previous.at) / 1000
  return {
    x: position.x + ((position.x - previous.position.x) / dt) * LEAD_SECONDS,
    y: position.y + ((position.y - previous.position.y) / dt) * LEAD_SECONDS,
    z: position.z + ((position.z - previous.position.z) / dt) * LEAD_SECONDS
  }
}
async function aimAt(id) {
  for (let i = 0; i < 3; i++) {
    const state = await snapshot(),
      enemy = state[id]
    if (!enemy?.MeshCollider) return false
    const c = state['2'].Transform,
      p = leadPosition(id, enemy.Transform.position)
    const dx = p.x - c.position.x,
      dy = p.y + 1.05 - c.position.y,
      dz = p.z - c.position.z
    const a = angles(c.rotation)
    const yawError = wrap(Math.atan2(dx, dz) - a.yaw)
    const pitchError = Math.atan2(dy, Math.hypot(dx, dz)) - a.pitch
    const tolerance = Math.hypot(dx, dz) > 20 ? 0.006 : 0.015
    if (Math.abs(yawError) < tolerance && Math.abs(pitchError) < tolerance) return true
    mx += yawError / 0.005236
    my -= pitchError / 0.005236
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx, y: my })
    await pause(60)
  }
  return true
}
try {
  const { targetInfos } = await send('Target.getTargets')
  const target = targetInfos.find((t) => t.type === 'page' && t.url.includes('127.0.0.1:8123'))
  sessionId = (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId
  await send('Page.bringToFront')
  await send('Runtime.enable')
  await send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await evaluate("window.engine_console_command('/set_scene Counter-Strike')")
  if (!process.argv.includes('--fresh-page')) {
    await evaluate("window.engine_console_command('/reload')")
    await pause(4000)
  }
  await evaluate("window.engine_console_command('/set_scene Counter-Strike')")
  const initial = await startGame()
  console.log('LIVE', labels(initial))
  assert.equal(enemies(initial).length, 3, 'three CT bots spawn against the lone T')
  // Bots start at the T spawn and cross the map toward B, so engage each one as it comes within range.
  const sweepDeadline = Date.now() + 110000
  let lastEngagement = Date.now() - 1500
  let remaining = 3
  let preferred
  let lastDebug = 0
  const engaged = new Set()
  while (Date.now() < sweepDeadline) {
    const state = await snapshot()
    if (labels(state).some((text) => text.endsWith('Win!'))) break
    const hud = readHud(state)
    if (hud?.clip !== undefined && hud.clip < 6) {
      await key('f', 'KeyF', 70, 100)
      await pause(3200)
      continue
    }
    const me = state['1'].Transform.position
    const eye = state['2'].Transform.position
    if (Date.now() - lastDebug > 1000) {
      lastDebug = Date.now()
      const view = enemies(state).map(([id, c]) => {
        const p = c.Transform.position
        return `${id}:${Math.hypot(p.x - me.x, p.z - me.z).toFixed(1)}m${visibleFrom(eye, p) ? ' visible' : ''}`
      })
      console.log(
        'SWEEP',
        `me ${me.x.toFixed(1)},${me.y.toFixed(1)},${me.z.toFixed(1)}`,
        view.join(' '),
        readHud(state)?.health
      )
    }
    const inRange = enemies(state)
      .map(([id, c]) => [id, Math.hypot(c.Transform.position.x - me.x, c.Transform.position.z - me.z), c])
      .filter(([, metres, c]) => metres < 40 && visibleFrom(eye, c.Transform.position))
      .sort((a, b) => (a[0] === preferred ? -1 : b[0] === preferred ? 1 : a[1] - b[1]))
    const seen = labels(state).find((text) => text.startsWith('Enemies left:'))
    if (seen) remaining = Number(seen.slice('Enemies left:'.length))
    if (!inRange.length) {
      // Bots hold the sites instead of coming to the player, so teleport to a clear spot near the nearest
      // one with the aim already on it (/move_player_to is preview-only: open the page with ?preview=true).
      // Bots see 28 m all round and fire 0.35 s after sighting, so the first burst has to leave fast.
      if (Date.now() - lastEngagement > 1500) {
        const target = enemies(state)
          .map(([id, c]) => [id, c.Transform.position])
          .sort((a, b) => Math.hypot(a[1].x - me.x, a[1].z - me.z) - Math.hypot(b[1].x - me.x, b[1].z - me.z))[0]
        if (target) {
          const [id, bot] = target
          const previous = lastSeen.get(id)
          let hx = 1,
            hz = 0
          if (previous && Date.now() - previous.at < 1500) {
            const vx = bot.x - previous.position.x,
              vz = bot.z - previous.position.z,
              length = Math.hypot(vx, vz)
            if (length > 0.05) ((hx = vx / length), (hz = vz / length))
          }
          // Prefer a spot just outside the bots' 28 m sight so the sniping player draws no fire: it needs
          // ground under it (the first runs dropped the player into a pit), a line of sight to the target,
          // and no other bot close enough to see it.
          const others = enemies(state)
            .filter(([other]) => other !== id)
            .map(([, c]) => c.Transform.position)
          const spot = [31, 30, 29]
            .flatMap((metres) =>
              [
                [hx, hz],
                [-hx, -hz],
                [-hz, hx],
                [hz, -hx],
                [Math.SQRT1_2 * (hx - hz), Math.SQRT1_2 * (hx + hz)],
                [Math.SQRT1_2 * (hx + hz), Math.SQRT1_2 * (hz - hx)]
              ].map(([dx, dz]) => ({ x: bot.x + dx * metres, z: bot.z + dz * metres }))
            )
            .map((point) => {
              const drop = mapDistance({ x: point.x, y: bot.y + 3, z: point.z }, { x: 0, y: -1, z: 0 }, 8)
              return drop < 8 ? { ...point, y: bot.y + 3 - drop + 0.05 } : undefined
            })
            .find(
              (point) =>
                point &&
                visibleFrom({ x: point.x, y: point.y + 1.6, z: point.z }, bot) &&
                !others.some(
                  (other) =>
                    Math.hypot(other.x - point.x, other.y - point.y, other.z - point.z) < 30 &&
                    visibleFrom({ x: other.x, y: other.y + 1.4, z: other.z }, point)
                )
            )
          if (spot) {
            const c = state['2'].Transform
            const a = angles(c.rotation)
            const dx = bot.x - spot.x,
              dy = bot.y + 1.05 - (spot.y + 1.6),
              dz = bot.z - spot.z
            mx += wrap(Math.atan2(dx, dz) - a.yaw) / 0.005236
            my -= (Math.atan2(dy, Math.hypot(dx, dz)) - a.pitch) / 0.005236
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx, y: my })
            await pause(60)
            const moved = await evaluate(
              `window.engine_console_command('/move_player_to ${spot.x} ${spot.y} ${spot.z}').then(String).catch((e) => 'move failed: ' + e)`
            )
            console.log('MOVE', moved, 'bot', id, 'at', `${bot.x.toFixed(1)},${bot.y.toFixed(1)},${bot.z.toFixed(1)}`)
            lastSeen.delete(id)
            preferred = id
            // Let the server sample the new position before the first claim.
            await pause(350)
            lastEngagement = Date.now()
            continue
          }
          console.log('MOVE skipped: no clear spot beside', id)
        }
      }
      await pause(100)
      continue
    }
    lastEngagement = Date.now()
    const [id] = inRange[0]
    engaged.add(id)
    // Bots run for the bomb sites instead of stopping to fight, so track and burst for a few seconds.
    const trackUntil = Date.now() + 3000
    while (Date.now() < trackUntil) {
      if (!(await aimAt(id))) break
      await shoot(120)
      await pause(40)
      const check = await snapshot()
      if (!check[id]?.MeshCollider || (readHud(check)?.clip ?? 30) < 3) break
    }
    const after = await snapshot()
    console.log(
      'SHOT',
      id,
      labels(after).filter((text) => text.startsWith('Enemies left:') || text.includes('Win!'))
    )
    // Fire cues are AudioSource entities parented to the camera; the engine console reports decode failures.
    const sounds = Object.entries(after)
      .filter(([, c]) => c.AudioSource?.audioClipUrl?.includes('sounds/weapons'))
      .map(([entity, c]) => ({ entity, ...c.AudioSource, parent: c.Transform?.parent }))
    if (sounds.length && !soundEvidence.length) {
      soundEvidence = sounds
      console.log('SOUND', JSON.stringify(sounds), 'console:', JSON.stringify(audioLogs.slice(0, 5)))
    }
    const left = labels(after).find((text) => text.startsWith('Enemies left:'))
    if (left && Number(left.slice('Enemies left:'.length)) < remaining) {
      remaining = Number(left.slice('Enemies left:'.length))
      lastEngagement = 0
    }
  }
  const ended = await stateUntil((s) => labels(s).some((text) => text.endsWith('Win!')), 'round end')
  console.log(
    'ROUND END',
    labels(ended).filter((text) => text.includes('Win!')),
    'bots killed:',
    3 - remaining
  )
  if (!labels(ended).includes('Terrorists Win!')) {
    console.log('LOST the round after', 3 - remaining, 'kills; the rest of the flow needs a win')
    process.exit(2)
  }
  const won = ended
  assert.equal(engaged.size, 3, 'each bot was engaged')
  assert.equal(enemies(won).length, 0)
  console.log('VICTORY', labels(won))
  assert.equal(readTeamScore(won, 2), undefined, 'round result does not open scoreboard automatically')
  const wonScores = await scoreSnapshot()
  assert.equal(readTeamScore(wonScores, 1), 1, 'the T round win is on the board')
  assert.equal(readTeamScore(wonScores, 2), lostRounds, 'arming losses are on the board')
  await stateUntil((s) => labels(s).includes('Prepare to fight!'), 'automatic next freeze', 8000)
  const restarted = await stateUntil(isBotRoundLive, 'automatic next live')
  assert.equal(enemies(restarted).length, 3)
  assert.equal(readHud(restarted)?.clip, readHud(won)?.clip, 'surviving T keeps the rifle magazine')
  assert.equal(readHud(restarted)?.reserve, readHud(won)?.reserve, 'surviving T keeps the rifle reserve')
  assert.equal(readHud(restarted)?.health, 100, 'restart restores health')
  await stateUntil((s) => labels(s).includes('Counter-Terrorists Win!'), 'defeat while idle', 130000)
  const lost = await scoreSnapshot()
  assert.equal(readTeamScore(lost, 2), lostRounds + 1)
  assert.equal(readTeamScore(lost, 1), 1)
  const humanRow = readScoreRows(lost).find((row) => row.values.at(-1) === '-' && row.values.at(-3) === '3')
  assert.ok(humanRow, 'three kills survive round reset')
  assert.ok(Number(humanRow.values.at(-2)) >= lostRounds, 'deaths survive round reset')
  const botScores = readScoreRows(lost)
    .filter((row) => row.values.includes('BOT'))
    .map((row) => Number(row.values.filter((value) => /^\d+$/.test(value))[0]))
  assert.equal(botScores.length, 3)
  assert.deepEqual(
    botScores,
    [...botScores].sort((a, b) => b - a),
    'visible scoreboard orders bots by kills'
  )
  console.log('DEFEAT', labels(lost))
  if (evidencePath)
    await writeFile(
      evidencePath,
      JSON.stringify(
        {
          date: new Date().toISOString(),
          hud: { initial: readHud(initial), victory: readHud(won), restart: readHud(restarted), defeat: readHud(lost) },
          armingLosses: lostRounds,
          sounds: soundEvidence,
          audioConsole: audioLogs.slice(0, 20),
          initial: labels(initial),
          victory: labels(wonScores),
          restart: labels(restarted),
          defeat: labels(lost),
          scene: await evaluate("window.engine_console_command('/scene_stats')")
        },
        null,
        2
      ) + '\n'
    )
  if (process.argv.includes('--screenshots') && evidencePath) {
    await captureScoreboardViewports({ send, snapshot }, browserSession, dirname(evidencePath))
    console.log('PASS: scoreboard columns and proportions at 1280x720, 1024x768, 1920x1080')
  }
  console.log(
    'PASS: join T → frozen movement → AK-47 in hand → three bot kills → scored victory → automatic round → scored defeat'
  )
} finally {
  await shiftOne('keyUp').catch((e) => console.warn(e.message))
  await shift('keyUp').catch((e) => console.warn(e.message))
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'left', clickCount: 1 }).catch(
    (e) => console.warn(e.message)
  )
  await evaluate('document.exitPointerLock()').catch((e) => console.warn(e.message))
  socket.close()
}
