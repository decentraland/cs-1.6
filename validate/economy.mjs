import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { Client, pause, labels, readHud, live, startTeamMatch } from './team-client.mjs'
if (process.argv.length < 4)
  throw new Error(
    'Usage: node validate/economy.mjs <CT-CDP-websocket> <T-CDP-websocket> [evidence.json] [--resume] (fresh realm)'
  )
const [ct, t] = process.argv.slice(2, 4).map((endpoint) => new Client(endpoint))
const evidence = { date: new Date().toISOString(), checks: [] }
async function buy(client, item) {
  await client.evaluate('document.exitPointerLock()')
  await client.until((s) => labels(s).includes('Buy Equipment'), 'equipment menu')
  const s = await client.snapshot(),
    h = await client.evaluate('innerHeight')
  const rows = [
    'Kevlar Vest    ',
    'Kevlar Vest & Helmet',
    ...(labels(s).some((v) => v.startsWith('Defuse Kit    ')) ? ['Defuse Kit', 'M4A1'] : ['AK-47']),
    'USP',
    'Glock-18',
    'Primary Ammo',
    'Secondary Ammo'
  ]
  const index = rows.findIndex((v) => v.startsWith(item))
  assert.ok(index >= 0, `${item}: ${JSON.stringify(rows)}`)
  await client.click(140, h * 0.16 + (labels(s).includes('Defuse Kit') ? 25 : 0) + 14 + 36 + 16 + index * 32)
  await pause(500)
  return readHud(await client.snapshot())
}
async function closeMenu(client) {
  const s = await client.snapshot(),
    h = await client.evaluate('innerHeight')
  const rows = [
    'Kevlar Vest    ',
    'Kevlar Vest & Helmet',
    ...(labels(s).some((v) => v.startsWith('Defuse Kit    ')) ? ['Defuse Kit', 'M4A1'] : ['AK-47']),
    'USP',
    'Glock-18',
    'Primary Ammo',
    'Secondary Ammo'
  ]
  await client.click(100, h * 0.16 + (labels(s).includes('Defuse Kit') ? 25 : 0) + 14 + 36 + 16 + rows.length * 32)
  await client.until((s) => s['2'].PointerLock?.isPointerLocked, 'close recaptures cursor')
}
async function key(c, k, code, vk) {
  await c.key('keyDown', k, code, vk)
  await pause(70)
  await c.key('keyUp', k, code, vk)
  await pause(200)
}
try {
  await Promise.all([ct.connect(), t.connect()])
  if (!process.argv.includes('--resume')) {
    evidence.warmUp = await startTeamMatch(ct, 2, [[t, 1]])
    await t.until(live, 'live')
  }
  // The CT starts round two with $800 plus the $1400 warm-up loss bonus; the T joined too late for a payment.
  const ctMoney = readHud(await ct.snapshot()).money
  assert.equal(ctMoney, 2200, 'CT money after the warm-up loss')
  assert.equal(readHud(await t.snapshot()).money, 800)
  assert.equal((await buy(ct, 'Defuse Kit')).money, ctMoney - 200)
  const denied = await buy(ct, 'M4A1')
  assert.equal(denied.money, ctMoney - 200)
  assert.equal(denied.clip, 12, 'unaffordable rifle leaves the USP equipped')
  assert.equal((await buy(ct, 'Defuse Kit')).money, ctMoney - 200, 'duplicate item cannot charge twice')
  const vest = await buy(t, 'Kevlar Vest    ')
  assert.equal(vest.money, 150)
  assert.equal(vest.armor, 100)
  evidence.checks.push(
    'starting $800 (+$1400 warm-up loss); kit $200; vest $650; insufficient funds and owned kit rejected'
  )
  await closeMenu(ct)
  await closeMenu(t)
  await t.command('/move_player_to 32.8375 14 46.7017')
  await pause(1300)
  await key(t, '4', 'Digit4', 52)
  await t.until((s) => labels(s).some((v) => v.startsWith('C4 —')), 'select C4')
  await t.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: t.mx, y: t.my, button: 'left', clickCount: 1 })
  await t.until((s) => labels(s).includes('The bomb has been planted!'), 'plant', 6000)
  await t.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t.mx, y: t.my, button: 'left', clickCount: 1 })
  const feet = (await t.snapshot())['1'].Transform.position,
    bomb = { ...feet, y: feet.y + 0.08 }
  await ct.command(`/move_player_to ${bomb.x + 1.3} ${bomb.y + 0.1} ${bomb.z}`)
  await pause(1200)
  await ct.aimAt(bomb)
  const began = Date.now()
  await ct.key('keyDown', 'e', 'KeyE', 69)
  await ct.until((s) => labels(s).includes('The bomb has been defused!'), 'five-second kit defuse', 8000)
  await ct.key('keyUp', 'e', 'KeyE', 69)
  evidence.kitDefuseMs = Date.now() - began
  assert.ok(evidence.kitDefuseMs >= 4900 && evidence.kitDefuseMs < 7000)
  assert.equal(readHud(await ct.snapshot()).money, ctMoney - 200, 'round payout waits for next spawn')
  await ct.until((s) => labels(s).includes('Prepare to fight!'), 'next freeze', 8000)
  const ctAfterDefuse = ctMoney - 200 + 3250
  const next = await ct.until((s) => readHud(s)?.money === ctAfterDefuse, 'CT receives $3250')
  assert.ok(labels(next).includes('Defuse Kit'), 'surviving CT retains kit')
  await t.until(
    (s) => readHud(s)?.money === 2350 && readHud(s)?.armor === 100,
    'T gets loss+plant bonus and retains armor'
  )
  evidence.checks.push('purchased kit defuses in five seconds; next-round rewards; survivor equipment retained')
  await ct.until((s) => !labels(s).includes('Prepare to fight!') && readHud(s)?.seconds > 100, 'round two live')
  assert.equal((await buy(t, 'Kevlar Vest & Helmet')).money, 2000, 'helmet upgrade costs $350')
  assert.equal((await buy(ct, 'Kevlar Vest & Helmet')).money, ctAfterDefuse - 1000, 'new vest and helmet cost $1000')
  await closeMenu(ct)
  await closeMenu(t)
  await ct.command('/move_player_to 90 11 52')
  await t.command('/move_player_to 94 11 52')
  await pause(1300)
  const target = (await ct.snapshot())['1'].Transform.position
  await t.aimAt({ ...target, y: target.y + 1.1 })
  await t.shoot(70)
  await pause(650)
  const wounded = readHud(await ct.snapshot())
  assert.ok(wounded.health > 40 && wounded.health < 100)
  assert.ok(wounded.armor < 100 && wounded.armor > 80)
  evidence.armoredHit = wounded
  await t.aimAt({ ...target, y: target.y + 1.6 })
  for (let i = 0; i < 6; i++) {
    await t.shoot(100)
    await pause(450)
    if (readHud(await ct.snapshot()).health === 0) break
  }
  await ct.until((s) => readHud(s)?.health === 0, 'CT killed')
  assert.equal(readHud(await t.snapshot()).money, 2300, 'enemy kill pays $300 immediately')
  await t.until((s) => labels(s).includes('Prepare to fight!'), 'round three freeze', 8000)
  await t.until((s) => readHud(s)?.money === 5550, 'T gets elimination reward')
  const respawn = await ct.until((s) => readHud(s)?.money === ctAfterDefuse - 1000 + 1400, 'CT gets first loss bonus')
  assert.equal(readHud(respawn).armor, 0)
  assert.ok(!labels(respawn).includes('Defuse Kit'), 'death removes kit')
  evidence.checks.push(
    'helmet prices; armor absorbs pistol hits; kill reward; death clears equipment; survivor money accumulates'
  )
  await t.until((s) => !labels(s).includes('Prepare to fight!') && readHud(s)?.seconds > 100, 'round three live')
  await key(t, 'f', 'KeyF', 70)
  const reloaded = await t.until(
    (s) => readHud(s)?.clip === 20 && readHud(s)?.reserve < 40,
    'survivor reload uses retained reserve',
    5000
  )
  const refilled = await buy(t, 'Secondary Ammo')
  assert.equal(refilled.reserve, readHud(reloaded).reserve + 30)
  assert.equal(refilled.money, 5530)
  evidence.checks.push('survivor ammo retained; reload and $20 pistol ammo purchase replenish reserve')
  await closeMenu(t)
  await t.command('/move_player_to 104.5 11 40.7')
  await pause(1200)
  await t.evaluate('document.exitPointerLock()')
  assert.ok(!labels(await t.snapshot()).includes('Buy Equipment'), 'buy menu absent outside own zone')
  evidence.checks.push('buy menu restricted to own spawn zone')
  if (process.argv[4]) await writeFile(process.argv[4], JSON.stringify(evidence, null, 2) + '\n')
  console.log('PASS', JSON.stringify(evidence))
} finally {
  for (const c of [ct, t]) {
    if (c.sessionId) await c.key('keyUp', 'e', 'KeyE', 69).catch((e) => console.warn(e.message))
    c.socket.close()
  }
}
