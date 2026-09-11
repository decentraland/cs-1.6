import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Client, labels, pause } from './team-client.mjs'
import { practiceButtonPoint } from './menu-layout.mjs'

const endpoint = process.argv[2]
if (!endpoint) throw new Error('Usage: node validate/solo-bomb.mjs <browser-CDP-websocket> [evidence.json]')

const output = process.argv[3] ?? fileURLToPath(new URL('./game/solo-bomb.json', import.meta.url))
const client = new Client(endpoint)
const bots = state => Object.entries(state)
  .filter(([, value]) => value.AvatarShape && value.MeshCollider && value.Transform)
  .map(([id, value]) => ({ id, name: value.AvatarShape.name, position: value.Transform.position }))
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const c4 = state => Object.values(state).find(value => value.MeshRenderer?.mesh?.box && Math.abs((value.Transform?.scale?.y ?? 0) - 0.14) < 0.001 && Math.abs((value.Transform?.scale?.z ?? 0) - 0.23) < 0.001)?.Transform.position

try {
  await client.connect()
  await client.until(state => labels(state).includes('Start game'), 'fresh solo menu', 40000)
  const [width, height] = await client.evaluate('[innerWidth,innerHeight]')
  const point = practiceButtonPoint(width, height)
  await client.click(point.x, point.y)
  const frozen = await client.until(state => labels(state).includes('Prepare to fight!'), 'solo freeze')
  const spawned = bots(frozen)
  assert.equal(spawned.length, 3)
  assert.ok(spawned.some(bot => bot.name === 'BOT Guerilla'))
  await client.command('/move_player_to 85.74417 14.5 131.18173')
  await client.until(state => labels(state).includes('Enemies left: 3') && !labels(state).includes('Prepare to fight!'), 'solo live round')
  const planted = await client.until(state => labels(state).includes('The bomb has been planted!'), 'solo bot plant', 20000)
  const plantedAt = c4(planted)
  assert.ok(plantedAt)
  assert.ok(distance(plantedAt, { x: 104.5, y: 10.026, z: 40.5 }) < 1, 'round one plants at B')
  const atPlant = bots(planted)
  const carrierStart = spawned.find(bot => bot.name === 'BOT Guerilla')
  const carrierPlant = atPlant.find(bot => bot.name === 'BOT Guerilla')
  assert.ok(carrierStart && carrierPlant)
  assert.ok(distance(carrierStart.position, carrierPlant.position) > 10, 'carrier traverses Dust2 before planting')
  await pause(1500)
  const defending = bots(await client.snapshot())
  const defenseMovement = defending.map(bot => ({
    name: bot.name,
    metres: distance(bot.position, atPlant.find(candidate => candidate.id === bot.id).position)
  }))
  assert.ok(defenseMovement.some(bot => bot.metres > 0.5), 'surviving bots move to post-plant defense positions')
  const evidence = { date: new Date().toISOString(), site: 'B', planter: 'BOT Guerilla', plantedAt, spawned, atPlant, defenseMovement }
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(JSON.stringify(evidence, null, 2))
} finally {
  client.socket.close()
}
