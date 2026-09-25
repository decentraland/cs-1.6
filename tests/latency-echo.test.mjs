import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sdkRooms, AUTH_SERVER } from './helpers/sdk-room.mjs'
import { combatClient } from './helpers/combat-client.mjs'
import { humanServer } from './helpers/human-server.mjs'

test('SDK Room delivers the real probe/echo round trip so a shot rewinds the moving human', async () => {
  const wire = sdkRooms()
  const serverRoom = wire.add(AUTH_SERVER)
  const client = combatClient({ room: wire.add('me'), readyToShoot: true })
  await wire.deliverFrom('me')
  const game = humanServer({ room: serverRoom })
  const shooter = game.addPlayer('me', 1, { x: 95, y: 10.026, z: 52 })
  const target = game.addPlayer('target', 2, { x: 88, y: 10.026, z: 46 })
  game.tick(10)
  for (let tick = 1; tick <= 60; tick++) {
    const at = 10 + tick / 60
    target.move({ x: 88, y: 10.026, z: 52 + 6 * (at - 10.7) })
    game.tick(at)
    if (tick === 12) await wire.deliverFrom(AUTH_SERVER)
    if (tick === 24) await wire.deliverFrom('me')
  }
  assert.equal(client.sent.filter((event) => event.type === 'latencyEcho').length, 1, 'client replies through SDK Room')
  game.shoot('me')
  assert.equal(target.health().current, 0)
  assert.equal(shooter.weapon().ammoClip, 29)
  assert.equal(game.server.matchStats.get('me').kills, 1)
  assert.ok(game.logs.some((line) => line.includes('humanRtt=400 humanDelay=300ms humanRewind=1.80')))
})

test('SDK Room still rejects a peer probe and unsynchronized clients do not answer a server probe', async () => {
  const wire = sdkRooms()
  const client = combatClient({ room: wire.add('me') })
  const echoes = () => client.sent.filter((event) => event.type === 'latencyEcho')
  await wire.inject('me', 'another-player', 'latencyProbe', { token: 1 })
  assert.equal(echoes().length, 0)
  client.state.synced = false
  await wire.inject('me', AUTH_SERVER, 'latencyProbe', { token: 2 })
  assert.equal(echoes().length, 0)
  client.state.synced = true
  await wire.inject('me', AUTH_SERVER, 'latencyProbe', { token: 3 })
  assert.deepEqual(echoes(), [{ type: 'latencyEcho', data: { token: 3 } }])
})
