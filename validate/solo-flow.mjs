// Shared steps for the single-human browser scripts. `io` is any object with the CDP trio
// { send, evaluate, snapshot } — the raw-socket scripts and team-client's Client both qualify.
import assert from 'node:assert/strict'
import { readHud } from './read-hud.mjs'
import { teamButtonPoint } from './menu-layout.mjs'

export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export const labels = (state) =>
  Object.values(state)
    .filter((c) => c.UiText)
    .map((c) => c.UiText.value)
// First original spawn of each team (team-spawns.ts). Bots on a side start there.
export const T_SPAWN = { x: 85.74417, y: 14.8, z: 131.18173 }
export const CT_SPAWN = { x: 51.61083, y: 7.76, z: 46.70173 }
export const GUN_SPEEDS = { 'AK-47': 221 * 0.025, M4A1: 230 * 0.025, USP: 250 * 0.025, 'Glock-18': 250 * 0.025 }
export const GUN_FIRE_MS = { 'AK-47': 95.5, M4A1: 87.5, USP: 150, 'Glock-18': 150 }
const RIFLE_BUDGET = 3100 + 3 * 60
export const HINT = '   1: Primary   2: Pistol   3: Knife   4: C4   Shift+1: Scores'

export function equippedGun(state) {
  const hint = labels(state).find((value) => value.endsWith(HINT))
  return hint?.slice(0, -HINT.length)
}
export const isLive = (state) => !labels(state).includes('Prepare to fight!') && readHud(state)?.seconds > 100
export const isBotRoundLive = (state) => labels(state).includes('Enemies left: 3') && isLive(state)
export const isLocked = (state) => !!state['2'].PointerLock?.isPointerLocked

// The equipped first-person viewmodel: the only camera child that is visible and is a root (no mesh of its own).
// Recoil and pain punch tilt this entity instead of the engine camera.
export function readViewmodel(state) {
  const entry = Object.entries(state).find(
    ([, c]) => c.Transform?.parent === 2 && c.VisibilityComponent?.visible === true && !c.MeshRenderer
  )
  if (!entry) return undefined
  const [id, c] = entry
  const q = c.Transform.rotation ?? { x: 0, y: 0, z: 0, w: 1 }
  return {
    id,
    rotation: q,
    tilt: 2 * Math.acos(Math.min(1, Math.abs(q.w))),
    pitch: Math.asin(Math.max(-1, Math.min(1, 2 * (q.y * q.z - q.w * q.x))))
  }
}

export async function stateUntil(io, predicate, message, timeout = 10000, interval = 100) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const state = await io.snapshot()
    if (predicate(state)) return state
    await pause(interval)
  }
  throw new Error(`Timed out: ${message}`)
}

export async function click(io, x, y, duration = 100) {
  await io.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await pause(150)
  await io.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await pause(duration)
  await io.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}

export async function tapKey(io, key, code, vk, duration = 80, modifiers = 0) {
  await io.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers })
  await pause(duration)
  await io.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers })
}

// Picking a side fills the other side with three bots and starts the freeze at once.
export async function joinCounterTerrorists(io, timeout = 30000) {
  return joinSide(io, 2, timeout)
}
// CT bots hunt the player, T bots run for the bomb sites: join T when the script needs the bots to come to it.
export async function joinTerrorists(io, timeout = 30000) {
  return joinSide(io, 1, timeout)
}
async function joinSide(io, team, timeout) {
  await stateUntil(io, (s) => labels(s).includes('Select a team'), 'team menu', timeout)
  await io.evaluate('document.exitPointerLock()')
  await pause(200)
  const [w, h] = await io.evaluate('[innerWidth,innerHeight]')
  const point = teamButtonPoint(w, h, team)
  await click(io, point.x, point.y)
  // Picking a side starts the freeze at once, so the menu (and its 'Joined' label) closes immediately.
  return stateUntil(
    io,
    (s) => labels(s).some((label) => label === 'Prepare to fight!' || label.startsWith('Enemies left')),
    'freeze starts on join',
    20000
  )
}

export async function captureMouse(io) {
  if (isLocked(await io.snapshot())) return
  const [w, h] = await io.evaluate('[innerWidth,innerHeight]')
  await click(io, w / 2, h / 2)
  await stateUntil(io, isLocked, 'mouse capture')
}

// Stand next to the nearest living bot (at the T spawn during the freeze, on their route once live) so the
// bots end the round within seconds of seeing the player.
export async function loseRound(io) {
  const state = await io.snapshot()
  const bots = Object.values(state).filter((c) => c.AvatarShape?.name?.startsWith('BOT ') && c.MeshCollider)
  const me = state['1'].Transform.position
  const nearest = bots
    .map((c) => c.Transform.position)
    .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0]
  const spot = nearest ? { x: nearest.x + 1.5, y: nearest.y + 0.1, z: nearest.z } : T_SPAWN
  await io.evaluate(`window.engine_console_command('/walk_player_to ${spot.x} ${spot.y} ${spot.z} 15')`)
  return stateUntil(io, (s) => labels(s).some((value) => value.endsWith('Win!')), 'bots end the round', 140000)
}

function buyRowY(state, h, item) {
  const rows = labels(state).filter((value) =>
    /^(Kevlar Vest|Defuse Kit    |AK-47    |M4A1    |USP    |Glock-18    |Primary Ammo|Secondary Ammo)/.test(value)
  )
  const index = item === 'Close' ? rows.length : rows.findIndex((value) => value.startsWith(item))
  assert.ok(index >= 0, `buy menu lists ${item}: ${JSON.stringify(rows)}`)
  return h * 0.16 + (labels(state).includes('Defuse Kit') ? 25 : 0) + 14 + 36 + 16 + index * 32
}

async function buy(io, item, x = 140) {
  const state = await io.snapshot()
  const h = await io.evaluate('innerHeight')
  await click(io, x, buyRowY(state, h, item))
  await pause(400)
}

// Humans spawn with a pistol. Losing two rounds pays $1400 + $1900, enough for an M4A1 and three ammo boxes,
// which the rifle scripts (cadence, camera, feedback, viewmodel) need. Skipped when a rifle is already equipped.
export async function ensureRifle(io) {
  let state = await io.snapshot()
  if (!['M4A1', 'AK-47'].includes(equippedGun(state))) {
    await tapKey(io, '1', 'Digit1', 49)
    await pause(600)
    state = await io.snapshot()
  }
  const hud = readHud(state)
  if (['M4A1', 'AK-47'].includes(equippedGun(state)) && hud?.clip === 30 && hud.reserve >= 60) return { lostRounds: 0 }
  let lostRounds = 0
  for (let round = 0; round < 4; round++) {
    const spawned = await stateUntil(
      io,
      (s) => readHud(s)?.health === 100 && (labels(s).includes('Prepare to fight!') || isLive(s)),
      'player spawned at the CT spawn',
      140000
    )
    if ((readHud(spawned)?.money ?? 0) >= RIFLE_BUDGET) break
    await loseRound(io)
    lostRounds++
  }
  assert.ok((readHud(await io.snapshot())?.money ?? 0) >= RIFLE_BUDGET, 'loss bonuses fund an M4A1 plus ammo')
  await io.evaluate('document.exitPointerLock()')
  await stateUntil(io, (s) => labels(s).includes('Buy Equipment'), 'buy menu at spawn')
  await buy(io, 'M4A1')
  await stateUntil(io, (s) => equippedGun(s) === 'M4A1' && readHud(s)?.clip === 30, 'M4A1 equipped')
  for (let box = 0; box < 3; box++) await buy(io, 'Primary Ammo')
  await stateUntil(io, (s) => readHud(s)?.reserve === 90, 'three ammo boxes fill the reserve')
  await buy(io, 'Close', 100)
  await stateUntil(io, isLocked, 'closing the buy menu recaptures the mouse')
  return { lostRounds }
}
