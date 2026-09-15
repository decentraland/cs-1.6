import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { Client, labels, pause } from './team-client.mjs'
import { isBotRoundLive } from './solo-flow.mjs'

const endpoint = process.argv[2]
if (!endpoint) throw new Error('Usage: node validate/bot-avatars.mjs <browser-CDP-websocket>')

const output = fileURLToPath(new URL('./game/bot-avatars/runtime.json', import.meta.url))
const client = new Client(endpoint)
const bots = (state) =>
  Object.entries(state)
    .filter(([, value]) => value.AvatarShape && value.MeshCollider && value.Transform)
    .map(([id, value]) => ({ id, name: value.AvatarShape.name, position: value.Transform.position }))
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

try {
  await client.connect()
  const ready = await client.until((state) => labels(state).includes('Select a team'), 'team menu', 30000)
  assert.equal(ready['2'].PointerLock?.isPointerLocked, false)
  const [width, height] = await client.evaluate('[innerWidth,innerHeight]')
  await client.click(width * 0.75, height * 0.75)
  await pause(400)
  const recovered = await client.snapshot()
  assert.equal(recovered['2'].PointerLock?.isPointerLocked, false, 'open menu restores the cursor after a canvas click')
  // Joining CT fills the T side with bots and starts the freeze immediately.
  await client.join(2)
  const frozen = await client.until((state) => labels(state).includes('Prepare to fight!'), 'freeze phase')
  const spawned = bots(frozen)
  assert.equal(spawned.length, 3)
  assert.deepEqual(spawned.map((bot) => bot.name).sort(), ['BOT Arctic', 'BOT Guerilla', 'BOT Phoenix'])
  assert.ok(
    spawned.every((bot) => bot.position.z > 125),
    'bots spawn at the original T spawn'
  )
  // Stay at the CT spawn: the bots leave the T spawn for their objective as soon as the round goes live.
  const live = await client.until(isBotRoundLive, 'live round')
  const initial = bots(live)
  await pause(2500)
  const moved = bots(await client.snapshot())
  const movement = moved.map((bot) => ({
    name: bot.name,
    metres: distance(bot.position, initial.find((candidate) => candidate.id === bot.id).position)
  }))
  assert.ok(
    movement.some((bot) => bot.metres > 1),
    'at least one visible avatar follows navigation'
  )
  await writeFile(
    output,
    `${JSON.stringify({ date: new Date().toISOString(), cursorRecovered: true, spawned, movement }, null, 2)}\n`
  )
  console.log(JSON.stringify({ cursorRecovered: true, bots: spawned.map((bot) => bot.name), movement }, null, 2))
} finally {
  client.socket.close()
}
