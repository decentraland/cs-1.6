import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { Client, pause, labels, readHud } from './team-client.mjs'
if (process.argv.length < 5)
  throw new Error(
    'Usage: node validate/team-admission.mjs <CT-CDP> <T-CDP> <late-CDP> [evidence.json] [--resume] (CT and T already live)'
  )
const [ct, t, late] = process.argv.slice(2, 5).map((endpoint) => new Client(endpoint))
const evidence = { date: new Date().toISOString(), checks: [] }
try {
  await Promise.all([ct.connect(), t.connect(), late.connect()])
  if (!process.argv.includes('--resume')) {
    await ct.until(
      (s) => readHud(s)?.seconds > 50 && !labels(s).includes('Prepare to fight!'),
      'live round with time for disconnect',
      130000
    )
    await late.until((s) => labels(s).includes('Select a team'), 'late guest menu', 45000)
    await late.join(1, false)
    const joined = await late.until((s) => labels(s).includes('Waiting for the next round'), 'late admission')
    assert.equal(readHud(joined).health, 0)
    await late.shoot(300)
    assert.equal(readHud(await late.snapshot()).clip, readHud(joined).clip, 'late join cannot consume ammo')
    evidence.checks.push('live late join remains dead and cannot fire')
    console.log('LATE JOIN PASS')
    const targets = await t.send('Target.getTargets')
    const target = targets.targetInfos.find((target) => target.type === 'page' && target.url.includes('127.0.0.1:8123'))
    await t.send('Target.closeTarget', { targetId: target.targetId })
    t.sessionId = undefined
    await ct.until(
      (s) => labels(s).includes('Counter-Terrorists Win!'),
      'disconnected final opponent ends round',
      30000
    )
    assert.equal(readHud(await late.snapshot()).health, 0, 'queued late join cannot prolong the old round')
    evidence.checks.push('disconnect ends round after heartbeat expiry')
    await late.until(
      (s) => labels(s).includes('Prepare to fight!') && readHud(s)?.health === 100,
      'queued player spawns at next round',
      8000
    )
    evidence.checks.push('queued late join spawns on automatic round boundary')
    console.log('DISCONNECT / ROUND PASS')
    const created = await t.send('Target.createTarget', { url: target.url })
    t.sessionId = (await t.send('Target.attachToTarget', { targetId: created.targetId, flatten: true })).sessionId
    await t.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  } else evidence.checks.push('resumed after verified late admission, disconnect result, and queued spawn')
  const readyDeadline = Date.now() + 60000
  let ready = false
  while (Date.now() < readyDeadline) {
    try {
      ready = await t.evaluate("typeof window.engine_console_command === 'function'")
    } catch (error) {
      if (!error.message.includes('Cannot find default execution context')) throw error
    }
    if (ready) break
    await pause(200)
  }
  assert.ok(ready, 'new tab has an engine console')
  await t.until((s) => labels(s).includes('Select a team'), 'reconnected guest menu', 60000)
  await t.join(1, false)
  await t.until((s) => labels(s).includes('Waiting for the next round'), 'rejoin waits instead of resurrecting')
  assert.equal(readHud(await t.snapshot()).health, 0)
  evidence.checks.push('new guest requires explicit admission and waits for next round')
  await ct.command('/move_player_to 95 10.1 52')
  await late.command('/move_player_to 90 10.1 52')
  await pause(2000)
  await ct.capture()
  const feet = (await late.snapshot())['1'].Transform.position
  await ct.aimAt({ x: feet.x, y: feet.y + 1.6, z: feet.z })
  for (let i = 0; i < 5; i++) {
    await ct.shoot()
    await pause(450)
    if (readHud(await late.snapshot()).health === 0) break
  }
  await t.until((s) => labels(s).includes('Counter-Terrorists Win!'), 'queued reconnect observes result')
  await t.until(
    (s) => labels(s).includes('Prepare to fight!') && readHud(s)?.health === 100,
    'reconnected player spawns with next round',
    8000
  )
  evidence.checks.push('new guest receives next-round spawn')
  if (process.argv[5]) await writeFile(process.argv[5], JSON.stringify(evidence, null, 2) + '\n')
  console.log('PASS:', evidence.checks.join(' → '))
} finally {
  for (const client of [ct, t, late]) {
    if (client.sessionId)
      await client.evaluate('document.exitPointerLock()').catch((error) => console.warn(error.message))
    client.socket.close()
  }
}
