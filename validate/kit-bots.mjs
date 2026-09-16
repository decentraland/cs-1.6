import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client, pause, labels } from './team-client.mjs'
const c = new Client(process.argv[2], 'https://decentraland.org/bevy-web/', 'CS16'),
  dir = resolve(process.argv[3] ?? 'validate/game/defuse-kits/bots'),
  evidence = { date: new Date().toISOString(), muted: true }
mkdirSync(dir, { recursive: true })
const state = (s) =>
  Object.values(s).flatMap((v) =>
    v.TextShape?.text.startsWith('review-c4-') ? [JSON.parse(v.TextShape.text.slice(10))] : []
  )[0]
const bot = (s, index) => state(s)?.bots.find((x) => x.bot.index === index)
async function key(value) {
  await c.key('keyDown', value, 'Digit' + value, 48 + Number(value))
  await pause(60)
  await c.key('keyUp', value, 'Digit' + value, 48 + Number(value))
}
async function picture(name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${dir}/${name}.png`, Buffer.from(data, 'base64'))
}
try {
  await c.connect()
  const deadline = Date.now() + 120000
  while (!(await c.evaluate("typeof window.engine_console_command === 'function'"))) {
    assert.ok(Date.now() < deadline)
    await pause(500)
  }
  await c.until((s) => state(s)?.health && labels(s).includes('Select a team'), 'lobby', 60000)
  await c.join(1)
  await c.until((s) => state(s)?.match.phase === 'live', 'live')
  const [w, h] = await c.evaluate('[innerWidth,innerHeight]'),
    k = Math.min(w / 640, h / 480)
  for (let i = 0; i < 3; i++) {
    if ((await c.snapshot())['2'].PointerLock?.isPointerLocked) break
    await c.click((w - 640 * k) / 2 + 150 * k, (h - 480 * k) / 2 + (126 + 8 * 28) * k)
    await pause(700)
  }
  await c.until((s) => s['2'].PointerLock?.isPointerLocked, 'capture')
  await c.shoot(60)
  await c.command('/move_player_to 33.5 12.8 42')
  await pause(1000)
  let s = await c.snapshot()
  evidence.before = state(s)
  assert.equal(bot(s, 0).bot.defuseKit, true)
  assert.equal(bot(s, 1).bot.defuseKit, false)
  const target = bot(s, 0).position
  await c.aimAt({ ...target, y: target.y + 1.6 })
  await c.shoot(60)
  s = await c.until(
    (s) => !bot(s, 0).bot.alive && bot(s, 1).bot.defuseKit,
    'real AWP kill transfers kit to adjacent CT bot'
  )
  evidence.transfer = state(s)
  assert.equal(bot(s, 0).bot.defuseKit, false)
  const plantedAt = { x: 32.9, y: 12.6, z: 46.5 }
  await c.command(`/move_player_to ${plantedAt.x} ${plantedAt.y + 0.15} ${plantedAt.z}`)
  await pause(800)
  await key('4')
  await pause(900)
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.mx, y: c.my, button: 'left', clickCount: 1 })
  s = await c.until((s) => state(s).bomb.phase === 'planted', 'real T plants C4', 5000)
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.mx, y: c.my, button: 'left', clickCount: 1 })
  s = await c.until((s) => state(s).bomb.defuser === 'bot:1', 'kit-carrying bot defuses')
  evidence.defuse = state(s)
  assert.equal(state(s).bomb.actionEnds - state(s).bomb.actionStarted, 5)
  await c.command('/move_player_to 33.5 12.8 42')
  await pause(750)
  await c.aimAt(state(s).bomb.position)
  await picture('bot-defusing')
  s = await c.until((s) => state(s).bomb.phase === 'defused', 'five-second bot defuse', 7000)
  evidence.result = state(s)
  s = await c.until((s) => state(s).match.round === 2, 'next round', 15000)
  evidence.retained = state(s)
  assert.equal(bot(s, 1).bot.defuseKit, true)
  assert.equal(bot(s, 0).bot.defuseKit, false)
  await c.until((s) => state(s).match.phase === 'live', 'next live')
  await c.command('/move_player_to 32 12.8 42')
  await pause(800)
  const next = bot(await c.snapshot(), 1).position
  await c.aimAt({ ...next, y: next.y + 1.6 })
  await c.shoot(60)
  s = await c.until(
    (s) => !bot(s, 1).bot.alive && bot(s, 0).bot.defuseKit,
    'second real kill re-drops recovered kit to another CT'
  )
  evidence.redrop = state(s)
  assert.equal(bot(s, 1).bot.defuseKit, false)
  writeFileSync(`${dir}/browser.json`, JSON.stringify(evidence, null, 2) + '\n')
  console.log(
    'PASS: real bot death, adjacent CT pickup, five-second bot defuse, survivor kit retention and re-drop on death'
  )
} catch (error) {
  evidence.failure = String(error)
  try {
    evidence.state = await c.snapshot()
    await picture('failure')
  } catch (e) {
    console.warn(e.message)
  }
  writeFileSync(`${dir}/failure.json`, JSON.stringify(evidence, null, 2) + '\n')
  throw error
} finally {
  c.socket.close()
}
