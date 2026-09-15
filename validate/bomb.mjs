import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { Client, pause, labels, readHud, readTeamScore, live, startTeamMatch } from './team-client.mjs'
import { readScoreRows } from './read-scoreboard.mjs'
if (process.argv.length < 4)
  throw new Error('Usage: node validate/bomb.mjs <CT-CDP-websocket> <T-CDP-websocket> [evidence.json] (fresh realm)')
const [ct, t] = process.argv.slice(2, 4).map((endpoint) => new Client(endpoint))
const evidence = { date: new Date().toISOString(), checks: [] }
const hasHumanScore = (state, score, deaths) =>
  readScoreRows(state).some(
    (row) => row.values.at(-3) === String(score) && row.values.at(-2) === String(deaths) && row.values.at(-1) === '-'
  )
async function key(client, key, code, vk, modifiers = 0) {
  await client.key('keyDown', key, code, vk, modifiers)
  await pause(70)
  await client.key('keyUp', key, code, vk, modifiers)
  await pause(200)
}
// Shift+4 drops the C4 (4 alone selects it).
async function dropBomb(client) {
  await client.key('keyDown', 'Shift', 'ShiftLeft', 16)
  await key(client, '4', 'Digit4', 52, 8)
  await client.key('keyUp', 'Shift', 'ShiftLeft', 16)
}
async function plant(position, cancel = false) {
  const initialClip = readHud(await t.snapshot()).clip
  await t.command(`/move_player_to ${position.x} ${position.y} ${position.z}`)
  await pause(1200)
  await t.capture()
  await key(t, '4', 'Digit4', 52)
  await t.until((s) => labels(s).some((v) => v.startsWith('C4 —')), 'C4 selected')
  if (cancel) {
    await t.shoot(800)
    await pause(450)
    assert.ok(!labels(await t.snapshot()).includes('Planting the bomb'), 'release cancels plant')
    assert.ok(!labels(await ct.snapshot()).includes('The bomb has been planted!'))
    evidence.checks.push('release cancels partial plant')
  }
  const started = Date.now()
  await t.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: t.mx, y: t.my, button: 'left', clickCount: 1 })
  await t.until((s) => labels(s).includes('Planting the bomb'), 'plant progress')
  const planted = await t.until((s) => labels(s).includes('The bomb has been planted!'), 'three-second plant', 6000)
  await t.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t.mx, y: t.my, button: 'left', clickCount: 1 })
  const elapsed = Date.now() - started
  assert.ok(elapsed >= 2900 && elapsed < 5000, `plant observation ${elapsed}ms`)
  assert.equal(readHud(planted).clip, initialClip, 'planting does not consume gun ammo')
  await ct.until((s) => labels(s).includes('The bomb has been planted!'), 'other client sees plant')
  const foot = planted['1'].Transform.position
  const bomb = { x: foot.x, y: foot.y + 0.08, z: foot.z }
  evidence.checks.push(`plant observed in ${elapsed}ms`)
  console.log('PLANTED', JSON.stringify({ elapsed, bomb }))
  return bomb
}
try {
  await Promise.all([ct.connect(), t.connect()])
  const warmUp = await startTeamMatch(ct, 2, [[t, 1]])
  evidence.warmUp = warmUp
  await t.until((s) => labels(s).includes('Prepare to fight!'), 'freeze')
  await t.until(live, 'live')
  await t.capture()
  const original = (await t.snapshot())['1'].Transform.position
  await dropBomb(t)
  await t.command(`/move_player_to ${original.x + 2} ${original.y + 0.1} ${original.z}`)
  await pause(1000)
  assert.ok(!labels(await t.snapshot()).some((v) => v.startsWith('C4')), 'dropping removes carrier status')
  await t.command(`/move_player_to ${original.x} ${original.y + 0.1} ${original.z}`)
  await t.until((s) => labels(s).some((v) => v.startsWith('C4')), 'walking over C4 picks it up')
  evidence.checks.push('manual drop and proximity pickup')
  await t.command('/move_player_to 109.4 11 35.8')
  await pause(1200)
  await key(t, '4', 'Digit4', 52)
  await t.shoot(3600)
  await pause(300)
  assert.ok(!labels(await t.snapshot()).includes('The bomb has been planted!'), 'clipped B corner rejects planting')
  evidence.checks.push('original clipped B corner rejects planting')
  const a = await plant({ x: 32.8375, y: 14, z: 46.7017 }, true)
  await ct.command(`/move_player_to ${a.x + 3} ${a.y + 0.1} ${a.z}`)
  await pause(1200)
  await ct.capture()
  const feet = (await t.snapshot())['1'].Transform.position
  await ct.aimAt({ x: feet.x, y: feet.y + 1.6, z: feet.z })
  for (let i = 0; i < 5; i++) {
    await ct.shoot()
    await pause(400)
    if (readHud(await t.snapshot()).health === 0) break
  }
  await t.until((s) => readHud(s)?.health === 0, 'planter dead')
  await pause(1000)
  assert.ok(
    !labels(await ct.snapshot()).includes('Counter-Terrorists Win!'),
    'killing last T does not beat planted bomb'
  )
  evidence.checks.push('plant survives elimination of last Terrorist')
  await ct.command(`/move_player_to ${a.x + 1.3} ${a.y + 0.1} ${a.z}`)
  await pause(800)
  await ct.aimAt(a)
  await ct.key('keyDown', 'e', 'KeyE', 69)
  await ct.until((s) => labels(s).includes('Defusing the bomb'), 'defuse begins')
  await pause(800)
  await ct.key('keyUp', 'e', 'KeyE', 69)
  await pause(600)
  assert.ok(!labels(await ct.snapshot()).includes('Defusing the bomb'), 'release cancels defuse')
  const began = Date.now()
  await ct.key('keyDown', 'e', 'KeyE', 69)
  await ct.until((s) => labels(s).includes('The bomb has been defused!'), 'ten-second defuse', 13000)
  await ct.key('keyUp', 'e', 'KeyE', 69)
  evidence.defuseMs = Date.now() - began
  assert.ok(evidence.defuseMs >= 9900 && evidence.defuseMs < 12500)
  const defuseBoard = await t.scoreboard()
  assert.equal(readTeamScore(defuseBoard, 2), 1, 'shared defuse score')
  assert.ok(
    hasHumanScore(defuseBoard, 4, warmUp.firstDeaths),
    'defuser receives three frags in addition to the planter kill'
  )
  evidence.defuserScore = 4
  evidence.checks.push('cancelled defuse resets progress; full defuse awards CT and three defuser frags')
  console.log('DEFUSED', evidence.defuseMs)
  await t.until((s) => labels(s).includes('Prepare to fight!'), 'next round', 8000)
  await t.until((s) => !labels(s).includes('Prepare to fight!') && readHud(s)?.seconds > 100, 'live second round')
  evidence.checks.push('defuse works at reference hull-center use radius')
  const b = await plant({ x: 104.5175, y: 11, z: 40.7284 })
  await ct.command(`/move_player_to ${b.x + 0.5} ${b.y + 0.1} ${b.z}`)
  await t.command('/move_player_to 85 14 131')
  const fused = Date.now()
  const beepWaves = new Set()
  const exploded = await ct.until(
    (s) => {
      for (const c of Object.values(s))
        if (c.AudioSource?.audioClipUrl?.includes('c4_beep')) beepWaves.add(c.AudioSource.audioClipUrl)
      return labels(s).includes('Target successfully bombed!')
    },
    '45-second fuse',
    49000
  )
  evidence.beepWaves = [...beepWaves]
  assert.equal(beepWaves.size, 5, 'all five C4 beep clips are emitted')
  evidence.fuseMs = Date.now() - fused
  assert.ok(evidence.fuseMs > 42000 && evidence.fuseMs < 47000)
  assert.equal(readHud(exploded).health, 0, 'nearby CT takes lethal blast damage')
  const explosionBoard = await t.scoreboard()
  assert.equal(readTeamScore(explosionBoard, 1), warmUp.tScore + 1, 'shared bomb explosion score')
  assert.ok(hasHumanScore(explosionBoard, 3, 1), 'successful explosion gives its planter three frags')
  evidence.planterScore = 3
  evidence.checks.push('B-site explosion damages nearby players, awards T, and gives the planter three frags')
  if (process.argv[4]) await writeFile(process.argv[4], JSON.stringify(evidence, null, 2) + '\n')
  console.log('PASS', JSON.stringify(evidence))
} finally {
  for (const client of [ct, t]) {
    if (client.sessionId) {
      await client.key('keyUp', 'e', 'KeyE', 69).catch((error) => console.warn(error.message))
      await client.key('keyUp', 'Shift', 'ShiftLeft', 16).catch((error) => console.warn(error.message))
      await client
        .send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: client.mx,
          y: client.my,
          button: 'left',
          clickCount: 1
        })
        .catch((error) => console.warn(error.message))
      await client.evaluate('document.exitPointerLock()').catch((error) => console.warn(error.message))
    }
    client.socket.close()
  }
}
