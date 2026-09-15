import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Client, labels, pause } from './team-client.mjs'
import { isBotRoundLive } from './solo-flow.mjs'

const endpoint = process.argv[2]
if (!endpoint)
  throw new Error('Usage: node validate/solo-bomb.mjs <browser-CDP-websocket> [evidence.json] (fresh realm, joins CT)')

const output = process.argv[3] ?? fileURLToPath(new URL('./game/solo-bomb.json', import.meta.url))
const client = new Client(endpoint)
const bots = (state) =>
  Object.entries(state)
    .filter(([, value]) => value.AvatarShape && value.MeshCollider && value.Transform)
    .map(([id, value]) => ({ id, name: value.AvatarShape.name, position: value.Transform.position }))
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const c4 = (state) =>
  Object.values(state).find(
    (value) =>
      value.MeshRenderer?.mesh?.box &&
      Math.abs((value.Transform?.scale?.y ?? 0) - 0.14) < 0.001 &&
      Math.abs((value.Transform?.scale?.z ?? 0) - 0.23) < 0.001
  )?.Transform.position

try {
  await client.connect()
  await client.until((state) => labels(state).includes('Select a team'), 'fresh team menu', 40000)
  await client.join(2)
  const frozen = await client.until((state) => labels(state).includes('Prepare to fight!'), 'freeze on joining CT')
  const spawned = bots(frozen)
  assert.equal(spawned.length, 3)
  assert.ok(spawned.some((bot) => bot.name === 'BOT Guerilla'))
  // Wait at bomb site A, out of sight of the T route to B, so the carrier plants instead of engaging.
  await client.command('/move_player_to 32.8375 14 46.7017')
  await client.until(isBotRoundLive, 'live bot round')
  const planted = await client.until(
    (state) => labels(state).includes('The bomb has been planted!'),
    'bot plant after crossing from T spawn',
    60000
  )
  const plantedAt = c4(planted)
  assert.ok(plantedAt)
  assert.ok(distance(plantedAt, { x: 104.5, y: 10.026, z: 40.5 }) < 1, 'round one plants at B')
  const atPlant = bots(planted)
  const carrierStart = spawned.find((bot) => bot.name === 'BOT Guerilla')
  const carrierPlant = atPlant.find((bot) => bot.name === 'BOT Guerilla')
  assert.ok(carrierStart && carrierPlant)
  assert.ok(distance(carrierStart.position, carrierPlant.position) > 50, 'carrier crosses Dust2 from T spawn to B')
  await pause(1500)
  const defending = bots(await client.snapshot())
  const defenseMovement = defending.map((bot) => ({
    name: bot.name,
    metres: distance(bot.position, atPlant.find((candidate) => candidate.id === bot.id).position)
  }))
  assert.ok(
    defenseMovement.some((bot) => bot.metres > 0.5),
    'surviving bots move to post-plant defense positions'
  )
  const evidence = {
    date: new Date().toISOString(),
    site: 'B',
    planter: 'BOT Guerilla',
    plantedAt,
    spawned,
    atPlant,
    defenseMovement
  }
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(JSON.stringify(evidence, null, 2))
} finally {
  client.socket.close()
}
