import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { Client, pause, labels, readHud, startTeamMatch } from './team-client.mjs'
if (process.argv.length < 6)
  throw new Error(
    'Usage: node validate/spectator.mjs <observer-CT-CDP> <CT-CDP> <CT-CDP> <T-CDP> [evidence.json] (fresh realm)'
  )
const [observer, first, second, enemy] = process.argv.slice(2, 6).map((endpoint) => new Client(endpoint))
const clients = [observer, first, second, enemy]
const evidence = { date: new Date().toISOString(), checks: [] }
const position = (state) => state['1'].Transform.position
const camera = (state) => state['2'].Transform.position
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const eye = (feet) => ({ ...feet, y: feet.y + 1.6 })
const spectating = (state) => labels(state).some((label) => label.startsWith('Spectating: '))
async function kill(victim) {
  await victim.command('/move_player_to 90 14 52')
  await enemy.command('/move_player_to 94 14 52')
  await pause(1800)
  const feet = position(await victim.snapshot())
  await enemy.aimAt(eye(feet))
  for (let i = 0; i < 5; i++) {
    await enemy.shoot(70)
    await pause(400)
    if (readHud(await victim.snapshot()).health === 0) break
  }
  await victim.until((state) => readHud(state)?.health === 0, 'victim killed')
}
try {
  await Promise.all(clients.map((client) => client.connect()))
  evidence.warmUp = await startTeamMatch(observer, 2, [
    [first, 2],
    [second, 2],
    [enemy, 1]
  ])
  await observer.until(
    (state) =>
      readHud(state)?.health === 100 && readHud(state)?.seconds > 100 && !labels(state).includes('Prepare to fight!'),
    'live round'
  )
  for (const client of clients) await client.capture()
  await observer.command('/move_player_to 90 11 52')
  await first.command('/move_player_to 90 11 64')
  await second.command('/move_player_to 90 11 78')
  await pause(1400)
  const ammo = readHud(await observer.snapshot()).clip
  await kill(observer)
  const corpse = position(await observer.snapshot()),
    firstEye = eye(position(await first.snapshot())),
    secondEye = eye(position(await second.snapshot()))
  await observer.until(
    (state) => spectating(state) && distance(camera(state), firstEye) < 3.2,
    'camera follows first living teammate'
  )
  evidence.checks.push('death enters teammate chase; enemy is excluded')
  console.log('DEATH / CHASE PASS')
  await observer.shoot(70)
  await observer.until((state) => distance(camera(state), secondEye) < 3.2, 'click cycles to second teammate')
  await pause(300)
  await observer.key('keyDown', 'Shift', 'ShiftLeft', 16)
  await pause(70)
  await observer.shoot(70)
  await observer.key('keyUp', 'Shift', 'ShiftLeft', 16)
  await observer.until((state) => distance(camera(state), firstEye) < 3.2, 'Shift-click cycles backwards')
  await observer.key('keyDown', 'w', 'KeyW', 87)
  await pause(500)
  await observer.key('keyUp', 'w', 'KeyW', 87)
  const frozen = await observer.snapshot()
  assert.ok(distance(position(frozen), corpse) < 0.15, 'spectating cannot move the corpse')
  assert.equal(readHud(frozen).clip, ammo, 'spectator clicks cannot consume ammunition')
  evidence.checks.push('forward/reverse target cycling; dead movement and shooting remain disabled')
  const previousCamera = camera(await observer.snapshot())
  await first.command('/move_player_to 90 14 67')
  await pause(1000)
  const movedEye = eye(position(await first.snapshot()))
  await observer.until(
    (state) => distance(camera(state), movedEye) < 3.2 && distance(camera(state), previousCamera) > 0.5,
    'camera follows moving teammate'
  )
  await kill(first)
  await observer.until(
    (state) => spectating(state) && distance(camera(state), secondEye) < 3.2,
    'target death automatically selects survivor'
  )
  evidence.checks.push('camera follows target movement and selects a new living target after death')
  console.log('CYCLE / TARGET LOSS PASS')
  await kill(second)
  await observer.until((state) => labels(state).includes('Terrorists Win!'), 'team elimination result')
  assert.ok(!spectating(await observer.snapshot()), 'no live teammate means no target label')
  await observer.until(
    (state) => labels(state).includes('Prepare to fight!') && readHud(state)?.health === 100,
    'respawn next round',
    8000
  )
  const respawn = await observer.until(
    (state) => !spectating(state) && distance(camera(state), eye(position(state))) < 0.25,
    'respawn restores own first-person camera'
  )
  assert.equal(readHud(respawn).clip, 12)
  await observer.until(
    (state) => !labels(state).includes('Prepare to fight!') && readHud(state)?.seconds > 100,
    'next live round'
  )
  await observer.capture()
  await observer.shoot(70)
  await observer.until((state) => readHud(state)?.clip === 11, 'respawned player can shoot again')
  evidence.checks.push('no teammate fallback; scored round end; respawn restores own camera and gun input')
  if (process.argv[6]) await writeFile(process.argv[6], JSON.stringify(evidence, null, 2) + '\n')
  console.log('PASS', JSON.stringify(evidence))
} finally {
  for (const client of clients) {
    if (client.sessionId) {
      await client.key('keyUp', 'Shift', 'ShiftLeft', 16).catch((error) => console.warn(error.message))
      await client.key('keyUp', 'w', 'KeyW', 87).catch((error) => console.warn(error.message))
    }
    client.socket.close()
  }
}
