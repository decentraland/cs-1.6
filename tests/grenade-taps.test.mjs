import assert from 'node:assert/strict'
import { test } from 'node:test'
import { grenadeServer } from './helpers/grenade-server.mjs'
import { combatClient } from './helpers/combat-client.mjs'
import { nativeInput, InputAction } from './helpers/native-input.mjs'
import { sdkRooms, AUTH_SERVER } from './helpers/sdk-room.mjs'

const ids = ['hegrenade', 'flashbang', 'smokegrenade']
const remaining = (p, id) => p.inventory().items.find((item) => item.id === id)?.reserve ?? 0

test('press and release received between server updates prime and throw each grenade exactly once', () => {
  for (const id of ids) {
    const f = grenadeServer(),
      p = f.add(id, id === 'flashbang' ? 2 : 1)
    f.state.now = 11
    p.use(true)
    f.state.now = 11.016
    p.use(false)
    p.use(true, { sequence: 1 })
    f.tick(11.1)
    assert.equal(p.weapon().mode, 1, id + ' pin is retained after release')
    assert.equal(f.projectiles().length, 0)
    f.tick(11.499)
    assert.equal(f.projectiles().length, 0, 'original minimum pull time')
    f.tick(11.5)
    assert.equal(f.projectiles().length, 1, id + ' actually spawned')
    assert.equal(f.projectiles()[0].kind, id)
    assert.equal(f.projectiles()[0].created, 11.5)
    assert.equal(remaining(p, id), id === 'flashbang' ? 1 : 0)
    f.tick(11.6)
    assert.equal(f.projectiles().length, 1, 'release cannot spawn another grenade')
    f.tick(12.3)
    assert.equal(p.inventory().active, 'usp', 'flash retires even with a second remaining')
  }
})

test('a held grenade still waits for release without cooking, and repeated press messages do not restart the pull', () => {
  const f = grenadeServer(),
    p = f.add('hegrenade')
  f.state.now = 11
  p.use(true)
  f.state.now = 11.4
  p.use(true)
  f.tick(20)
  assert.equal(f.projectiles().length, 0)
  assert.equal(remaining(p, 'hegrenade'), 1)
  p.use(false)
  f.tick(20.01)
  assert.equal(f.projectiles().length, 1)
  assert.equal(f.projectiles()[0].created, 20.01)
})

test('draw-blocked taps are cancelled, while holding through readiness pulls once the gun is ready', () => {
  for (const hold of [false, true]) {
    const f = grenadeServer(),
      p = f.add('hegrenade')
    p.weapon().readyAt = 12
    f.state.now = 11
    p.use(true)
    if (!hold) p.use(false)
    f.tick(12)
    assert.equal(p.weapon().mode, hold ? 1 : 0)
    if (hold) p.use(false)
    f.tick(12.5)
    assert.equal(f.projectiles().length, hold ? 1 : 0)
  }
})

test('stale, invalid and replayed presses cannot prime; death, switching, C4 and freeze cancel throws', () => {
  for (const extra of [{ round: 0 }, { revision: 0 }, { sequence: 0 }, { direction: { x: 0, y: 0, z: 0 } }]) {
    const f = grenadeServer(),
      p = f.add('hegrenade')
    f.state.now = 11
    p.use(true, extra)
    p.use(false)
    f.tick(12)
    assert.equal(p.weapon().mode, 0)
    assert.equal(f.projectiles().length, 0)
  }
  for (const cancel of ['death', 'weapon', 'c4', 'freeze']) {
    const f = grenadeServer(),
      p = f.add('hegrenade')
    f.state.now = 11
    p.use(true)
    p.use(false)
    if (cancel === 'death') f.api.Dead.create(p.player, {})
    if (cancel === 'weapon') {
      p.inventory().active = 'usp'
      f.api.equipActiveWeapon(p.player)
    }
    if (cancel === 'c4') f.api.PlayerEquipment.getMutable(p.player).bombSelected = true
    if (cancel === 'freeze') f.state.phase = 'freeze'
    f.tick(11.5)
    assert.equal(f.projectiles().length, 0, cancel)
  }
})

test('a real SDK native tap reaches the production client and Room server as one thrown grenade even in one packet batch', async () => {
  for (const [id, name] of [
    ['hegrenade', 'HE Grenade'],
    ['flashbang', 'Flashbang'],
    ['smokegrenade', 'Smoke Grenade']
  ]) {
    const rooms = sdkRooms(),
      serverRoom = rooms.add(AUTH_SERVER),
      clientRoom = rooms.add('me')
    const server = grenadeServer(serverRoom),
      p = server.add(id)
    const input = nativeInput()
    const client = combatClient({ input: input.sdk, controls: input.controls, readyToShoot: true, room: clientRoom })
    Object.assign(client.weapon, { ...p.weapon(), readyAt: 0, name })
    input.add(input.engine.RootEntity, InputAction.IA_ACTION_6, true, 1)
    input.add(input.engine.RootEntity, InputAction.IA_ACTION_6, false, 2)
    await input.frame()
    client.step(11)
    await input.frame()
    client.step(11.016)
    assert.deepEqual(
      client.sent.filter((event) => event.type === 'grenadeUse').map((event) => event.data.held),
      [true, false]
    )
    server.state.now = 11.02
    await rooms.deliverFrom('me')
    server.tick(11.1)
    assert.equal(p.weapon().mode, 1, id + ' authoritative pin')
    server.tick(11.521)
    assert.equal(server.projectiles().length, 1, id + ' authoritative projectile')
    assert.equal(remaining(p, id), 0)
    assert.ok(server.synced.length > 0, 'projectile is published to peers')
  }
})
