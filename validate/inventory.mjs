import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { Client, pause, labels, readHud, live, startTeamMatch } from './team-client.mjs'
if (process.argv.length < 4)
  throw new Error(
    'Usage: node validate/inventory.mjs <CT-CDP-websocket> <T-CDP-websocket> [evidence.json] (fresh realm)'
  )
const [ct, t] = process.argv.slice(2, 4).map((endpoint) => new Client(endpoint))
const evidence = { date: new Date().toISOString(), checks: [] }
const gunLabel = (s, name) => labels(s).some((v) => v.startsWith(name + '   1:'))
async function tap(c, key, code, vk) {
  await c.key('keyDown', key, code, vk)
  await pause(70)
  await c.key('keyUp', key, code, vk)
  await pause(200)
}
function menuRows(s) {
  const isCT = labels(s).some((v) => v.startsWith('M4A1    '))
  return [
    'Kevlar Vest    ',
    'Kevlar Vest & Helmet',
    ...(isCT ? ['Defuse Kit    ', 'M4A1    '] : ['AK-47    ']),
    'USP    ',
    'Glock-18    ',
    'Primary Ammo',
    'Secondary Ammo'
  ]
}
async function buy(c, item) {
  await c.evaluate('document.exitPointerLock()')
  await c.until((s) => labels(s).includes('Buy Equipment'), 'buy menu')
  const s = await c.snapshot(),
    rows = menuRows(s),
    index = rows.findIndex((v) => v.startsWith(item))
  assert.ok(index >= 0, item)
  const h = await c.evaluate('innerHeight')
  await c.click(140, h * 0.16 + (labels(s).includes('Defuse Kit') ? 25 : 0) + 14 + 36 + 16 + index * 32)
  await pause(500)
  return readHud(await c.snapshot())
}
async function close(c) {
  const s = await c.snapshot(),
    h = await c.evaluate('innerHeight')
  await c.click(100, h * 0.16 + (labels(s).includes('Defuse Kit') ? 25 : 0) + 14 + 36 + 16 + menuRows(s).length * 32)
  await c.until((s) => s['2'].PointerLock?.isPointerLocked, 'cursor recaptured')
  await pause(900)
}
// 1 selects the primary, 2 the pistol (CS 1.6 slots).
async function switchGun(c, secondary) {
  if (secondary) await tap(c, '2', 'Digit2', 50)
  else await tap(c, '1', 'Digit1', 49)
  await pause(1000)
}
try {
  await Promise.all([ct.connect(), t.connect()])
  evidence.warmUp = await startTeamMatch(ct, 2, [[t, 1]])
  await t.until(live, 'live')
  const initialCT = await ct.snapshot(),
    initialT = await t.snapshot()
  // The CT carries the warm-up loss bonus ($800 + $1400); the T joined too late for a payment.
  const ctMoney = readHud(initialCT).money
  assert.equal(ctMoney, 2200, 'CT money after the warm-up loss')
  assert.equal(readHud(initialT).money, 800)
  assert.ok(gunLabel(initialCT, 'USP'))
  assert.ok(gunLabel(initialT, 'Glock-18'))
  assert.equal(readHud(initialCT).clip, 12)
  assert.equal(readHud(initialCT).reserve, 24)
  assert.equal(readHud(initialT).clip, 20)
  assert.equal(readHud(initialT).reserve, 40)
  await ct.capture()
  await t.capture()
  await pause(900)
  await ct.shoot(700)
  await t.shoot(700)
  await pause(600)
  const pistolCT = readHud(await ct.snapshot()),
    pistolT = readHud(await t.snapshot())
  assert.equal(pistolCT.clip, 11, 'held USP fires once')
  assert.equal(pistolT.clip, 19, 'held Glock fires once')
  evidence.checks.push('original starting pistols/reserves; holding each pistol fires one bullet')
  const unaffordable = await buy(ct, 'M4A1')
  assert.equal(unaffordable.money, ctMoney)
  assert.equal(unaffordable.clip, 11)
  assert.equal((await buy(ct, 'Defuse Kit')).money, ctMoney - 200)
  await close(ct)
  await t.command('/move_player_to 32.8375 14 46.7017')
  await pause(1200)
  await tap(t, '4', 'Digit4', 52)
  await t.until((s) => labels(s).some((v) => v.startsWith('C4 —')), 'C4 selected')
  await t.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: t.mx, y: t.my, button: 'left', clickCount: 1 })
  await t.until((s) => labels(s).includes('The bomb has been planted!'), 'plant', 7000)
  await t.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t.mx, y: t.my, button: 'left', clickCount: 1 })
  await pause(900)
  assert.equal(readHud(await t.snapshot()).clip, 19, 'finishing a plant does not immediately fire the gun')
  const feet = (await t.snapshot())['1'].Transform.position,
    bomb = { ...feet, y: feet.y + 0.08 }
  await ct.command(`/move_player_to ${bomb.x + 1.3} ${bomb.y + 0.1} ${bomb.z}`)
  await pause(1200)
  await ct.aimAt(bomb)
  await ct.key('keyDown', 'e', 'KeyE', 69)
  await ct.until((s) => labels(s).includes('The bomb has been defused!'), 'kit defuse', 8000)
  await ct.key('keyUp', 'e', 'KeyE', 69)
  await ct.until((s) => labels(s).includes('Prepare to fight!'), 'next freeze', 8000)
  const ctAfterDefuse = ctMoney - 200 + 3250
  await ct.until((s) => readHud(s)?.money === ctAfterDefuse, 'CT reward')
  await t.until((s) => readHud(s)?.money === 3000, 'T reward')
  assert.equal(readHud(await ct.snapshot()).clip, 11)
  assert.equal(readHud(await t.snapshot()).clip, 19)
  await ct.until((s) => !labels(s).includes('Prepare to fight!') && readHud(s)?.seconds > 100, 'second live')
  const m4 = await buy(ct, 'M4A1')
  assert.equal(m4.money, ctAfterDefuse - 3100)
  assert.equal(m4.clip, 30)
  assert.equal(m4.reserve, 0)
  const ak = await buy(t, 'AK-47')
  assert.equal(ak.money, 500)
  assert.equal(ak.clip, 30)
  assert.equal(ak.reserve, 0)
  for (let i = 0; i < 3; i++) {
    await buy(ct, 'Primary Ammo')
    await buy(t, 'Primary Ammo')
  }
  assert.equal(readHud(await ct.snapshot()).money, ctAfterDefuse - 3100 - 180)
  assert.equal(readHud(await t.snapshot()).money, 260)
  await close(ct)
  await close(t)
  await ct.shoot(550)
  await t.shoot(550)
  await pause(500)
  const rifleCT = readHud(await ct.snapshot()),
    rifleT = readHud(await t.snapshot())
  assert.ok(rifleCT.clip <= 25 && rifleCT.clip >= 21)
  assert.ok(rifleT.clip <= 25 && rifleT.clip >= 21)
  evidence.rifleHold = { ct: rifleCT.clip, t: rifleT.clip }
  evidence.checks.push(
    'earned money buys team rifles; purchased guns include no reserve; caliber ammo prices; rifle automatic fire'
  )
  await tap(ct, 'f', 'KeyF', 70)
  await switchGun(ct, true)
  assert.ok(gunLabel(await ct.snapshot(), 'USP'))
  assert.equal(readHud(await ct.snapshot()).clip, 11)
  await pause(3100)
  await switchGun(ct, false)
  assert.ok(gunLabel(await ct.snapshot(), 'M4A1'))
  assert.equal(readHud(await ct.snapshot()).clip, rifleCT.clip)
  assert.equal(readHud(await ct.snapshot()).reserve, 90, 'cancelled reload does not transfer reserve')
  await tap(ct, 'f', 'KeyF', 70)
  const loaded = await ct.until((s) => readHud(s)?.clip === 30 && readHud(s)?.reserve < 90, 'M4 reload', 5000)
  assert.equal(readHud(loaded).reserve, 90 - (30 - rifleCT.clip))
  evidence.checks.push(
    'primary/secondary switching retains magazines; switching cancels reload; selected gun reloads with its own duration'
  )
  await ct.command('/move_player_to 90 11 52')
  await t.command('/move_player_to 94 11 52')
  await pause(1300)
  const target = (await ct.snapshot())['1'].Transform.position
  await t.aimAt({ ...target, y: target.y + 1.6 })
  for (let i = 0; i < 5; i++) {
    await t.shoot(100)
    await pause(450)
    if (readHud(await ct.snapshot()).health === 0) break
  }
  await ct.until((s) => readHud(s)?.health === 0, 'CT killed')
  const tClip = readHud(await t.snapshot()).clip
  await ct.until((s) => labels(s).includes('Prepare to fight!'), 'third freeze', 8000)
  const fresh = await ct.until((s) => gunLabel(s, 'USP') && readHud(s)?.health === 100, 'CT returns with pistol')
  assert.equal(readHud(fresh).clip, 12)
  assert.equal(readHud(fresh).reserve, 24)
  assert.ok(gunLabel(await t.snapshot(), 'AK-47'))
  assert.equal(readHud(await t.snapshot()).clip, tClip)
  await ct.until((s) => !labels(s).includes('Prepare to fight!') && readHud(s)?.seconds > 100, 'third live')
  await switchGun(ct, false)
  assert.ok(gunLabel(await ct.snapshot(), 'USP'), 'dead CT no longer owns rifle')
  evidence.checks.push('death removes purchased rifle and restores default pistol; surviving T retains rifle and ammo')
  if (process.argv[4]) await writeFile(process.argv[4], JSON.stringify(evidence, null, 2) + '\n')
  console.log('PASS', JSON.stringify(evidence))
} finally {
  for (const c of [ct, t]) {
    if (c.sessionId) await c.key('keyUp', 'e', 'KeyE', 69).catch((e) => console.warn(e.message))
    c.socket.close()
  }
}
