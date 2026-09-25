import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { compile } from './compile.mjs'
import { combatClient } from './helpers/combat-client.mjs'
import { humanServer } from './helpers/human-server.mjs'
import { sdkRooms, AUTH_SERVER } from './helpers/sdk-room.mjs'

const { GUNS } = compile('weapon-profiles')('weapon-profiles')
const soundModule = { exports: {} }
runInNewContext(
  buildSync({
    entryPoints: ['src/weapon-sounds.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    alias: { '@dcl/sdk/math': '@dcl/ecs-math' },
    external: ['@dcl/sdk/ecs']
  }).outputFiles[0].text,
  { module: soundModule, require: () => ({}) }
)
const { fireSound } = soundModule.exports
const origin = { x: 95, y: 11.626, z: 52 }
const shot = (patch = {}) => ({
  owner: 'shooter',
  round: 1,
  shotId: 1,
  pitch: 0,
  yaw: 0,
  shots: 1,
  accuracy: 0.2,
  right: true,
  position: { x: 98, y: 11.626, z: 52 },
  fire: { origin, gun: 'm4a1', mode: 1 },
  ...patch
})
function observer(room) {
  const sounds = [],
    kicks = []
  const f = combatClient({
    room,
    modules: {
      './weapon-sounds': {
        fireSound,
        playLocalSound: (name) => sounds.push({ name, local: true }),
        playWorldSound: (name, position) => sounds.push({ name, position })
      },
      './fps-camera': { setCameraTrigger() {}, receiveCameraKick: (data) => kicks.push(data) }
    }
  })
  return { ...f, sounds, kicks }
}
function remote(f, gun, mode = 0, position = origin) {
  f.client.playerEntities.set('shooter', 650)
  f.component('Weapon').create(650, { name: GUNS[gun].name, mode })
  f.component('PlayerIdentityData').create(651, { address: 'shooter' })
  f.component('Transform').create(651, { position })
}
function arm(player, gun, mode = 0) {
  const p = GUNS[gun]
  Object.assign(player.weapon(), {
    name: p.name,
    mode,
    ammoClip: p.clip,
    maxAmmoClip: p.clip,
    ammoReserve: p.reserve,
    fireRate: p.fireRate,
    damage: p.damage,
    zoom: 90
  })
}
const near = (a, b) => assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-4)

test('other players hear both silenced variants through the production server and SDK Room', async () => {
  for (const gun of ['m4a1', 'usp']) {
    const wire = sdkRooms(),
      authority = wire.add(AUTH_SERVER),
      client = observer(wire.add('listener'))
    const server = humanServer({ room: authority }),
      player = server.addPlayer('shooter', 1, { x: 95, y: 10.026, z: 52 })
    arm(player, gun, 1)
    remote(client, gun, 1)
    server.shoot('shooter', { direction: { x: 1, y: 0, z: 0 } })
    await wire.deliverFrom(AUTH_SERVER)
    assert.equal(client.sounds.length, 1)
    assert.equal(client.sounds[0].name, `${gun}_silenced_fire`)
    near(client.sounds[0].position, origin)
    assert.equal(player.weapon().ammoClip, GUNS[gun].clip - 1)
  }
})

test('queued gunfire retains the weapon, silencer and origin from firing before a switch or movement', async () => {
  const wire = sdkRooms(),
    authority = wire.add(AUTH_SERVER),
    client = observer(wire.add('listener'))
  const server = humanServer({ room: authority }),
    player = server.addPlayer('shooter', 1, { x: 95, y: 10.026, z: 52 })
  arm(player, 'm4a1', 1)
  server.shoot('shooter', { direction: { x: 1, y: 0, z: 0 } })
  const moved = { x: 110, y: 10, z: 60 }
  remote(client, 'deagle', 0, moved)
  arm(player, 'deagle')
  player.move(moved)
  await wire.deliverFrom(AUTH_SERVER)
  assert.equal(client.sounds.length, 1)
  assert.equal(client.sounds[0].name, 'm4a1_silenced_fire')
  near(client.sounds[0].position, origin)
})

test('every firearm supplies sound before its remote avatar or weapon has replicated', async () => {
  for (const gun of Object.keys(GUNS)) {
    const wire = sdkRooms(),
      authority = wire.add(AUTH_SERVER),
      client = observer(wire.add('listener'))
    const server = humanServer({ room: authority }),
      player = server.addPlayer('shooter', 1, { x: 95, y: 10.026, z: 52 })
    arm(player, gun)
    server.shoot('shooter', { direction: { x: 1, y: 0, z: 0 } })
    await wire.deliverFrom(AUTH_SERVER)
    assert.equal(client.sounds.length, 1, gun)
    assert.equal(client.sounds[0].name, `${gun}_fire`)
    near(client.sounds[0].position, gun === 'elite' ? { ...origin, z: origin.z - 0.125 } : origin)
  }
})

test('unsilenced snapshots stay unsilenced and bot events use their declared mode', async () => {
  const wire = sdkRooms(),
    client = observer(wire.add('listener'))
  remote(client, 'm4a1', 1)
  await wire.inject('listener', AUTH_SERVER, 'practiceShot', shot({ fire: { gun: 'm4a1', mode: 0, origin } }))
  assert.equal(client.sounds[0].name, 'm4a1_fire')
  await wire.inject('listener', AUTH_SERVER, 'practiceAttack', {
    round: 1,
    origin,
    target: origin,
    gun: 'usp',
    fire: { gun: 'usp', mode: 1, origin }
  })
  assert.equal(client.sounds[1].name, 'usp_silenced_fire')
})

test('own acknowledgements, wrong rounds, untrusted peers and unknown guns do not emit remote gunfire', async () => {
  const wire = sdkRooms(),
    client = observer(wire.add('listener'))
  remote(client, 'm4a1', 1)
  await wire.inject('listener', AUTH_SERVER, 'practiceShot', shot({ owner: 'me' }))
  assert.equal(client.kicks.length, 1)
  await wire.inject('listener', AUTH_SERVER, 'practiceShot', shot({ round: 0 }))
  await wire.inject('listener', 'intruder', 'practiceShot', shot())
  await wire.inject('listener', AUTH_SERVER, 'practiceShot', shot({ fire: { gun: 'not-a-gun', mode: 1, origin } }))
  await wire.inject('listener', AUTH_SERVER, 'practiceAttack', {
    round: 2,
    origin,
    target: origin,
    gun: 'm4a1',
    fire: { gun: 'm4a1', mode: 1, origin }
  })
  await wire.inject('listener', AUTH_SERVER, 'practiceAttack', {
    round: 1,
    origin,
    target: origin,
    gun: 'not-a-gun',
    fire: { gun: 'not-a-gun', mode: 1, origin }
  })
  assert.equal(client.sounds.length, 0)
})

test('legacy events retain available weapon-mode data without inventing a gun for a missing avatar', async () => {
  const wire = sdkRooms(),
    client = observer(wire.add('listener'))
  remote(client, 'usp', 1)
  await wire.inject('listener', AUTH_SERVER, 'practiceShot', shot({ fire: undefined }))
  assert.equal(client.sounds[0].name, 'usp_silenced_fire')
  client.client.playerEntities.delete('shooter')
  await wire.inject('listener', AUTH_SERVER, 'practiceShot', shot({ fire: undefined }))
  assert.equal(client.sounds.length, 1)
  await wire.inject('listener', AUTH_SERVER, 'practiceAttack', { origin, target: origin, gun: 'm4a1' })
  assert.equal(client.sounds[1].name, 'm4a1_fire')
})
