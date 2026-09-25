import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { Client, pause, labels } from './team-client.mjs'

assert.ok(process.argv[2], 'Usage: node validate/round-continuation.mjs <browser-CDP-websocket> [output-directory]')
const c = new Client(process.argv[2], 'realm=', 'CS16'),
  dir = process.argv[3] ?? 'validate/game/round-continuation'
await mkdir(dir, { recursive: true })
const state = (s) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith('review-round-') ? [JSON.parse(v.TextShape.text.slice(13))] : []
  )[0]
function point(s, id) {
  const rect = s[id].UiTransform
  let x = 0,
    y = 0
  const seen = new Set()
  while (id && !seen.has(id)) {
    seen.add(id)
    const t = s[id]?.UiTransform
    if (!t) break
    x += t.positionLeft ?? 0
    y += t.positionTop ?? 0
    id = t.parent
  }
  return { x: x + rect.width / 2, y: y + rect.height / 2 }
}
async function icon(index) {
  const s = await c.snapshot(),
    x = (index % 8) / 8,
    y = 1 - Math.floor(index / 8) / 3
  const items = Object.values(s).filter(
    (v) =>
      JSON.stringify(v.UiBackground?.texture ?? {}).includes('assets/ui/touch-controls.png') &&
      v.UiBackground?.uvs &&
      Math.abs(v.UiBackground.uvs[0] - x) < 1e-5 &&
      Math.abs(v.UiBackground.uvs[3] - y) < 1e-5
  )
  assert.ok(items.length, 'icon ' + index)
  return items.map((v) => point(s, v.UiTransform.parent)).sort((a, b) => b.x - a.x)[0]
}
async function press(p, held = 80) {
  await c.click(p.x, p.y, held)
  await pause(200)
}
const evidence = {}
async function record(name) {
  const s = await c.snapshot()
  evidence[name] = { ...state(s), position: s['1'].Transform.position, speed: s['1'].AvatarLocomotionSettings.jogSpeed }
  return s
}
try {
  await c.connect()
  for (let i = 0; i < 50; i++) {
    if (await c.evaluate('typeof window.engine_console_command === "function"')) break
    await pause(1000)
  }
  await c.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false })
  await c.until((s) => !!state(s), 'scene state', 30000, 500)
  await pause(1200)
  await c.evaluate(
    `(()=>{for(const canvas of document.querySelectorAll('canvas')){let el=canvas;while(el.parentElement){for(const sibling of el.parentElement.children)if(sibling!==el&&sibling.tagName!=='STYLE'&&sibling.tagName!=='SCRIPT')sibling.style.visibility='hidden';el=el.parentElement}}})()`
  )
  let s = await c.snapshot()
  const join = Object.values(s).find((v) => v.UiText?.value === 'CT FORCES')
  if (join) await press(point(s, join.UiTransform.parent))
  await c.until((s) => state(s)?.match.phase === 'live', 'live round', 60000)
  await c.evaluate('document.exitPointerLock()')
  await c.click(790, 361)
  s = await c.until(
    (s) => state(s)?.match.phase === 'won' && state(s).match.timeLeft >= 20,
    'time limit gives CT the round',
    60000,
    300
  )
  await record('result')
  assert.equal(state(s).weapon.ammoClip, 30)
  assert.ok(s['1'].AvatarLocomotionSettings.jogSpeed > 0, 'result keeps movement enabled')
  await c.key('keyDown', 'w', 'KeyW', 87)
  await pause(500)
  await c.key('keyUp', 'w', 'KeyW', 87)
  await press(await icon(0), 450)
  s = await c.until((s) => state(s).weapon.ammoClip < 30, 'shots consume ammo during result')
  assert.equal(state(s).match.phase, 'won')
  await pause(500)
  const clip = state(await record('fired')).weapon.ammoClip
  await pause(350)
  assert.equal(state(await c.snapshot()).weapon.ammoClip, clip, 'release stops fire')
  await press(await icon(1))
  await c.until((s) => state(s).weapon.isReloading, 'result reload starts')
  await c.until((s) => !state(s).weapon.isReloading && state(s).weapon.ammoClip === 30, 'result reload completes', 5000)
  await record('reloaded')
  await press(await icon(12))
  await c.until((s) => state(s).weapon.name === 'Knife', 'result weapon selection')
  await press(await icon(13))
  await c.until((s) => state(s).weapon.name === 'HE Grenade', 'select HE')
  await pause(850)
  await press(await icon(13), 650)
  await c.until((s) => state(s).grenades.some((grenade) => grenade.kind === 'hegrenade'), 'result grenade throw')
  s = await record('grenade')
  assert.equal(state(s).match.phase, 'won')
  assert.equal(state(s).match.ctScore, evidence.result.match.ctScore)
  assert.equal(state(s).match.tScore, 0)
  const before = evidence.result.position,
    after = evidence.fired.position
  assert.ok(Math.hypot(before.x - after.x, before.z - after.z) > 0.2, 'player moved during result')
  assert.ok(
    state(s).bots.some((bot) => {
      const previous = evidence.result.bots.find((other) => other.entity === bot.entity)
      return previous && Math.hypot(previous.position.x - bot.position.x, previous.position.z - bot.position.z) > 0.1
    }),
    'bots keep moving during result'
  )
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${dir}/result.png`, Buffer.from(data, 'base64'))
  await c.until(
    (s) => state(s).match.round === evidence.result.match.round + 1 && state(s).match.phase === 'freeze',
    'next freeze',
    30000,
    150
  )
  s = await record('next-round')
  assert.equal(state(s).match.ctScore, evidence.result.match.ctScore)
  assert.equal(s['1'].AvatarLocomotionSettings.jogSpeed, 0)
  const nextClip = state(s).weapon.ammoClip
  await press(await icon(0), 300)
  assert.equal(state(await c.snapshot()).weapon.ammoClip, nextClip, 'freeze blocks attacks')
  await writeFile(`${dir}/checks.json`, JSON.stringify(evidence, null, 2) + '\n')
  console.log(
    'PASS: result movement, finite firing/release, reload, weapon selection, grenade throw, moving bots, locked score and next-round freeze'
  )
} finally {
  c.socket.close()
}
