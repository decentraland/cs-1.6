import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { Client, pause, labels, readHud, readTeamScore, live, startTeamMatch } from './team-client.mjs'

const endpoints = process.argv.slice(2, 4)
if (endpoints.length !== 2)
  throw new Error('Usage: node validate/teams.mjs <CT-CDP-websocket> <T-CDP-websocket> [evidence.json] (fresh realm)')
const [ct, t] = endpoints.map((endpoint) => new Client(endpoint))
const evidence = { date: new Date().toISOString(), checks: [] }
try {
  await Promise.all([ct.connect(), t.connect()])
  // Picking a team starts at once against bots; the T human joins the second round.
  const warmUp = await startTeamMatch(ct, 2, [[t, 1]])
  evidence.warmUp = warmUp
  await ct.until((s) => labels(s).includes('Prepare to fight!'), 'shared freeze')
  const frozen = await Promise.all([ct.snapshot(), t.snapshot()])
  evidence.spawns = frozen.map((s) => s['1'].Transform.position)
  assert.ok(evidence.spawns[0].z < 60 && evidence.spawns[1].z > 130, 'teams use opposite original Dust2 spawns')
  await ct.key('keyDown', 'w', 'KeyW', 87)
  await pause(450)
  await ct.key('keyUp', 'w', 'KeyW', 87)
  const after = (await ct.snapshot())['1'].Transform.position
  assert.ok(Math.hypot(after.x - evidence.spawns[0].x, after.z - evidence.spawns[0].z) < 0.1, 'freeze blocks movement')
  await ct.until(live, 'live')
  evidence.checks.push('explicit teams, warm-up against bots, shared freeze, original spawns')
  const ctBoard = await ct.scoreboard(),
    tBoard = await t.scoreboard()
  assert.ok(labels(tBoard).includes('Bomb'), 'carrier sees C4 status on own team')
  assert.ok(!labels(ctBoard).includes('Bomb'), 'enemy scoreboard does not reveal C4 carrier')
  for (const board of [ctBoard, tBoard]) {
    assert.ok(labels(board).includes('Terrorists   -   1 player'))
    assert.ok(labels(board).includes('Counter-Terrorists   -   1 player'))
    assert.equal(
      Object.values(board).filter((value) => Math.abs((value.UiBackground?.color?.a ?? 0) - 16 / 255) < 0.001).length,
      1,
      'only the local player row is highlighted'
    )
  }
  evidence.checks.push('team player counts, local row highlight, teammate-only bomb status')
  console.log('TEAMS', JSON.stringify(evidence.spawns))

  async function encounter(shooter, victim, winner, score) {
    await Promise.all([shooter.command('/move_player_to 94 14 52'), victim.command('/move_player_to 90 14 52')])
    await pause(2000)
    await shooter.capture()
    const victimState = await victim.snapshot(),
      feet = victimState['1'].Transform.position
    await shooter.aimAt({ x: feet.x, y: feet.y + 1.6, z: feet.z })
    for (let i = 0; i < 5; i++) {
      await shooter.shoot()
      await pause(450)
      if (readHud(await victim.snapshot())?.health === 0) break
    }
    const dead = await victim.until(
      (s) => readHud(s)?.health === 0 && labels(s).includes(`${winner} Win!`),
      'shared kill/result'
    )
    const result = await shooter.scoreboard(),
      victimBoard = await victim.scoreboard()
    const team = winner === 'Terrorists' ? 1 : 2
    assert.equal(readTeamScore(result, team), score, 'shooter sees shared score')
    assert.equal(readTeamScore(victimBoard, team), score, 'victim agrees on team score')
    const before = dead['1'].Transform.position
    await victim.key('keyDown', 'w', 'KeyW', 87)
    await victim.shoot(300)
    await pause(400)
    await victim.key('keyUp', 'w', 'KeyW', 87)
    const stillDead = await victim.snapshot(),
      pos = stillDead['1'].Transform.position
    assert.equal(readHud(stillDead).health, 0)
    assert.equal(readHud(stillDead).clip, readHud(dead).clip, 'dead player cannot fire')
    assert.ok(Math.hypot(pos.x - before.x, pos.z - before.z) < 0.1, 'dead movement blocked')
    assert.equal(readHud(await shooter.snapshot()).health, 100, 'dead player cannot damage opponent')
    return { shooter: labels(result), victim: labels(victimBoard) }
  }
  evidence.ctWin = await encounter(ct, t, 'Counter-Terrorists', warmUp.ctScore + 1)
  evidence.checks.push('human shot, both clients agree on CT score, dead input blocked')
  await ct.until((s) => labels(s).includes('Prepare to fight!'), 'automatic next round', 8000)
  for (const client of [ct, t])
    assert.equal(readHud(await client.snapshot()).health, 100, 'health restored at round boundary')
  await t.until(live, 'second live round')
  evidence.tWin = await encounter(t, ct, 'Terrorists', warmUp.tScore + 1)
  evidence.checks.push('automatic round respawn and opposing scored win')
  if (process.argv[4]) await writeFile(process.argv[4], JSON.stringify(evidence, null, 2) + '\n')
  console.log('PASS:', evidence.checks.join(' → '))
} finally {
  for (const client of [ct, t]) {
    if (client.sessionId) {
      await client.key('keyUp', 'w', 'KeyW', 87).catch((error) => console.warn(error.message))
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
