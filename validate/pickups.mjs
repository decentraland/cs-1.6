import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Client, pause, labels, readHud } from './team-client.mjs'
const endpoint = process.argv[2],
  dir = resolve(process.argv[3] ?? 'validate/game/pickups'),
  session = process.argv[4] ?? 'cs16-pickup-review'
const c = new Client(endpoint, 'https://decentraland.org/bevy-web/', 'CS16'),
  run = promisify(execFile),
  evidence = {}
mkdirSync(dir, { recursive: true })
const tagged = (s, prefix) =>
  Object.entries(s).flatMap(([entity, v]) =>
    v.TextShape?.text.startsWith(prefix)
      ? [{ entity, transform: v.Transform, ...JSON.parse(v.TextShape.text.slice(prefix.length)) }]
      : []
  )
const drops = (s) => tagged(s, 'review-drop-'),
  bots = (s) => tagged(s, 'review-bot-')
const model = (s, id) =>
  Object.values(s).some((v) => v.GltfContainer?.src.endsWith(`/${id}-view.glb`) && v.VisibilityComponent?.visible)
async function tap(key, code, vk) {
  await c.key('keyDown', key, code, vk)
  await pause(60)
  await c.key('keyUp', key, code, vk)
}
async function drop() {
  await c.key('keyDown', 'Shift', 'ShiftLeft', 16)
  await c.key('keyDown', '2', 'Digit2', 50, 8)
  await pause(60)
  await c.key('keyUp', '2', 'Digit2', 50, 8)
  await c.key('keyUp', 'Shift', 'ShiftLeft', 16)
}
async function row(index) {
  const [w, h] = await c.evaluate('[innerWidth,innerHeight]'),
    k = Math.min(w / 640, h / 480)
  await c.click((w - 640 * k) / 2 + 150 * k, (h - 480 * k) / 2 + (126 + index * 28) * k)
  await pause(200)
}
async function move(p) {
  await c.command(`/move_player_to ${p.x} ${p.y + 0.15} ${p.z}`)
  await pause(700)
}
async function save(name) {
  await run('agent-browser', ['--session', session, 'screenshot', `${dir}/${name}.png`], { timeout: 15000 })
}
const mid = { x: 72.68839293, y: 6.6127, z: 69.39560782 },
  target = { x: 71.7592916, y: 7.7427, z: 67.40143921 }
try {
  await c.connect()
  const readyBy = Date.now() + 90000
  while (!(await c.evaluate("typeof window.engine_console_command === 'function'"))) {
    assert.ok(Date.now() < readyBy, 'Bevy console becomes available')
    await pause(500)
  }
  await c.until((s) => labels(s).includes('Select a team') && readHud(s)?.money === 16000, 'initialized lobby', 60000)
  await c.join(2)
  let s = await c.until(
    (s) => readHud(s)?.health === 100 && !labels(s).includes('Prepare to fight!'),
    'live round',
    20000
  )
  const spawn = s['1'].Transform.position
  await row(8)
  await c.until((s) => s['2'].PointerLock?.isPointerLocked, 'capture')
  await move(mid)
  await c.aimAt({ x: mid.x, y: mid.y + 20, z: mid.z + 1 })
  await tap('e', 'KeyE', 69)
  await pause(700)
  await c.shoot(45)
  await c.until((s) => readHud(s).clip === 9, 'AWP fired once')
  await pause(1700)
  await c.aimAt(target)
  await c.until((s) => !model(s, 'awp') && Object.values(s).some((v) => v.TextureCamera), 'AWP scope active')
  await drop()
  s = await c.until((s) => model(s, 'usp') && drops(s).some((d) => d.gun === 'awp' && d.settled), 'scoped AWP dropped')
  let awp = drops(s).find((d) => d.gun === 'awp')
  assert.equal(awp.clip, 9)
  assert.equal(awp.reserve, 0)
  assert.ok(!Object.values(s).some((v) => v.TextureCamera), 'scope target released')
  evidence.manual = { clip: awp.clip, reserveInBox: awp.reserve, position: awp.position, scopeReleased: true }
  await c.aimAt({ ...awp.position, y: awp.position.y + 0.08 })
  await save('awp-on-ground')
  await c.key('keyDown', 'w', 'KeyW', 87)
  try {
    s = await c.until((s) => model(s, 'awp') && !drops(s).some((d) => d.gun === 'awp'), 'walk-over pickup', 3000)
  } finally {
    await c.key('keyUp', 'w', 'KeyW', 87)
  }
  assert.equal(readHud(s).clip, 9)
  assert.equal(readHud(s).reserve, 30)
  evidence.recovered = readHud(s)
  console.log('PASS: scoped drop, ground model, walking pickup and retained reserves')
  await move(mid)
  await pause(1200)
  await c.aimAt(target)
  await tap('e', 'KeyE', 69)
  await pause(600)
  await c.shoot(45)
  await c.until((s) => bots(s).some((b) => b.index === 0 && b.health === 44), 'first door hit')
  await pause(1700)
  await c.shoot(45)
  s = await c.until((s) => drops(s).some((d) => d.gun === 'ak47' && d.settled), 'bot death drops AK')
  const enemy = drops(s).find((d) => d.gun === 'ak47')
  assert.equal(enemy.clip, 30)
  assert.equal(enemy.reserve, 90)
  evidence.botDrop = { clip: enemy.clip, reserve: enemy.reserve, position: enemy.position }
  await pause(1400)
  await drop()
  await c.until((s) => model(s, 'usp'), 'drop AWP to empty primary slot')
  await move(enemy.position)
  s = await c.until((s) => model(s, 'ak47'), 'CT picks up terrorist rifle')
  assert.equal(readHud(s).clip, 30)
  assert.equal(readHud(s).reserve, 90)
  await pause(1000)
  await c.shoot(45)
  s = await c.until((s) => readHud(s).clip === 29, 'enemy rifle fires')
  evidence.enemyPickup = readHud(s)
  await save('captured-ak47')
  console.log('PASS: bot death packs ammo, CT takes and fires enemy AK')
  await move(spawn)
  await c.aimAt({ x: spawn.x, y: spawn.y + 1.4, z: spawn.z + 10 })
  await pause(500)
  await c.evaluate('document.exitPointerLock()')
  await c.until((s) => labels(s).includes('0 CANCEL'), 'buy menu')
  await row(3)
  await row(2)
  await c.until((s) => model(s, 'm4a1'), 'buy M4A1')
  await row(6)
  await row(8)
  await c.until((s) => s['2'].PointerLock?.isPointerLocked, 'recapture')
  s = await c.until((s) => drops(s).some((d) => d.gun === 'ak47' && d.settled), 'replaced AK lands')
  const replaced = drops(s).find((d) => d.gun === 'ak47')
  assert.equal(replaced.clip, 29)
  assert.equal(replaced.reserve, 0)
  await move(replaced.position)
  s = await c.snapshot()
  assert.ok(
    Math.hypot(s['1'].Transform.position.x - replaced.position.x, s['1'].Transform.position.z - replaced.position.z) <
      0.5,
    'test player reached the dropped gun'
  )
  assert.ok(model(s, 'm4a1'))
  assert.ok(
    drops(s).some((d) => d.gun === 'ak47'),
    'occupied slot does not consume box'
  )
  await drop()
  s = await c.until((s) => model(s, 'ak47'), 'freeing primary slot picks up AK')
  assert.equal(readHud(s).clip, 29)
  assert.equal(readHud(s).reserve, 90)
  evidence.purchaseReplacement = {
    clip: replaced.clip,
    reserveInBox: replaced.reserve,
    occupiedSlotPreserved: true,
    recovered: readHud(s)
  }
  console.log('PASS: purchase drops old rifle, occupied slot refuses pickup, reserves remain unchanged')
  await move(spawn)
  await c.evaluate('document.exitPointerLock()')
  await c.until((s) => labels(s).includes('0 CANCEL'), 'buy menu for pistol')
  await row(0)
  await row(3)
  s = await c.until((s) => drops(s).some((d) => d.gun === 'usp'), 'pistol replacement drops USP')
  assert.ok(model(s, 'ak47'), 'buying a pistol retains the higher-weight rifle')
  assert.equal(readHud(s).clip, 29)
  assert.equal(readHud(s).reserve, 90)
  await row(5)
  await row(8)
  await c.until((s) => s['2'].PointerLock?.isPointerLocked, 'recapture after pistol purchase')
  await tap('2', 'Digit2', 50)
  s = await c.until((s) => model(s, 'deagle'), 'purchased pistol can be selected')
  assert.equal(readHud(s).clip, 7)
  assert.equal(readHud(s).reserve, 0)
  await tap('1', 'Digit1', 49)
  s = await c.until((s) => model(s, 'ak47'), 'return to rifle')
  evidence.purchaseSelection = { keptRifle: true, pistol: 'deagle', pistolClip: 7, rifle: readHud(s) }
  console.log('PASS: purchasing Deagle keeps AK selected and stores the new pistol in slot 2')
  const bot = bots(s).find((b) => b.alive)
  assert.ok(bot)
  await move(bot.transform.position)
  await tap('3', 'Digit3', 51)
  await c.until((s) => readHud(s).health === 0, 'bot kills knife-holding player', 30000)
  s = await c.until(
    (s) => drops(s).some((d) => d.gun === 'ak47' && d.clip === 29 && d.reserve === 90),
    'human death drops best gun',
    3000
  )
  evidence.humanDeath = drops(s).find((d) => d.gun === 'ak47' && d.clip === 29 && d.reserve === 90)
  await save('death-drop')
  s = await c.until((s) => readHud(s).health === 100 && drops(s).length === 0, 'next round clears ground guns', 20000)
  assert.equal(readHud(s).clip, 10)
  assert.equal(readHud(s).reserve, 30)
  evidence.nextRound = { hud: readHud(s), groundGuns: drops(s).length }
  evidence.scoreboard = labels(await c.scoreboard())
  await save('next-round')
  console.log('PASS: human death drops best gun with ammo; next round removes all ground guns')
  writeFileSync(`${dir}/browser.json`, JSON.stringify(evidence, null, 2))
} catch (error) {
  writeFileSync(`${dir}/partial.json`, JSON.stringify(evidence, null, 2))
  throw error
} finally {
  c.socket.close()
}
