import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { compile } from './compile.mjs'
import { humanServer } from './helpers/human-server.mjs'
import { combatClient } from './helpers/combat-client.mjs'
import { sdkRooms, AUTH_SERVER } from './helpers/sdk-room.mjs'
import * as sdk from '@dcl/ecs/dist-cjs/index.js'

const load = compile('bot-combat')
const { GUNS } = load('weapon-profiles')
const { createBotCombat, botShot } = load('bot-combat')
const feet = { x: 95, y: 10.026, z: 52 }
function arm(player, id = 'ak47') {
  const gun = GUNS[id]
  Object.assign(player.weapon(), {
    name: gun.name,
    ammoClip: gun.clip - 1,
    maxAmmoClip: gun.clip,
    ammoReserve: gun.reserve,
    fireRate: gun.fireRate,
    nextPrimaryAt: 0,
    reloadTime: gun.reloadTime
  })
}
const reload = (f, patch = {}) => f.message('playerReload', 'shooter', { round: 1, revision: 1, ...patch })
const cues = (f) => f.sent.filter((event) => event.type === 'weaponReloadSound')

for (const family of ['primary', 'secondary'])
  test(`accepted ${family} magazine reloads notify nearby listeners once with source volume`, () => {
    for (const gun of Object.values(GUNS).filter((gun) => gun.slot === family && !gun.shellReload)) {
      const f = humanServer()
      const shooter = f.addPlayer('shooter', 1, feet)
      f.addPlayer('near', 2, { ...feet, x: feet.x + 6.4 })
      f.addPlayer('same-team', 1, feet)
      f.addPlayer('far', 2, { ...feet, x: feet.x + 12.81 })
      f.addPlayer('disconnected', 2, feet)
      f.match.roster.find((seat) => seat.address === 'disconnected').connected = false
      arm(shooter, gun.id)
      reload(f)
      const events = cues(f)
      assert.equal(events.length, 2, gun.id)
      assert.deepEqual(
        events.map((event) => [event.options.to[0], event.data.volume]),
        [
          ['near', 127],
          ['same-team', 255]
        ]
      )
      assert.ok(events.every((event) => event.data.round === 1))
      reload(f)
      assert.equal(cues(f).length, 2, 'duplicate reload does not replay the cue')
      assert.equal(shooter.weapon().isReloading, true)
      assert.equal(shooter.weapon().ammoClip, gun.clip - 1, 'sound does not transfer ammunition early')
    }
  })

test('rejected reloads and shell reloads do not emit the magazine cue', () => {
  for (const reason of ['full', 'reserve', 'dead', 'draw', 'round', 'revision', 'm3', 'xm1014']) {
    const f = humanServer()
    const shooter = f.addPlayer('shooter', 1, feet)
    f.addPlayer('near', 2, feet)
    arm(shooter, reason === 'm3' || reason === 'xm1014' ? reason : 'ak47')
    const w = shooter.weapon()
    if (reason === 'full') w.ammoClip = w.maxAmmoClip
    if (reason === 'reserve') w.ammoReserve = 0
    if (reason === 'dead') shooter.health().current = 0
    if (reason === 'draw') w.readyAt = 20
    reload(f, reason === 'round' ? { round: 2 } : reason === 'revision' ? { revision: 2 } : {})
    assert.equal(cues(f).length, 0, reason)
  }
})

const systemCode = buildSync({
  entryPoints: ['src/systems.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  write: false,
  external: ['@dcl/sdk/*', './components', './server', './practice', './index']
}).outputFiles[0].text

test('the production empty-magazine auto reload emits the same cue without a reload request', () => {
  const weapon = {
    name: 'M4A1',
    ammoClip: 0,
    ammoReserve: 90,
    maxAmmoClip: 30,
    lastShotTime: 0,
    nextPrimaryAt: 0,
    readyAt: 0,
    fireRate: 0.0875,
    reloadTime: 3.05,
    isReloading: false,
    resumeZoom: 90
  }
  const sent = []
  const modules = {
    '@dcl/sdk/ecs': {
      engine: {
        *getEntitiesWith() {
          yield [512, weapon]
        }
      }
    },
    '@dcl/sdk/network': { isServer: () => true },
    './components': {
      Weapon: { getMutable: () => weapon },
      Dead: { has: () => false },
      PlayerAddress: { getOrNull: () => ({ address: 'shooter' }) }
    },
    './server': { isPlayerTriggerHeld: () => false, resetPlayerAccuracy() {} },
    './practice': {
      getPractice: () => ({
        round: 1,
        roster: [
          { address: 'shooter', connected: true },
          { address: 'near', connected: true }
        ]
      }),
      playerPosition: (id) => (id === 'shooter' ? feet : { ...feet, z: feet.z + 3.2 })
    },
    './index': { room: { send: (type, data, options) => sent.push({ type, data, options }) } }
  }
  const module = { exports: {} }
  runInNewContext(systemCode, { module, Date: { now: () => 10000 }, require: (name) => modules[name] })
  module.exports.weaponSystem()
  assert.equal(weapon.isReloading, true)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].type, 'weaponReloadSound')
  assert.equal(sent[0].data.volume, 191)
  module.exports.weaponSystem()
  assert.equal(sent.length, 1)
})

test('bot combat reports an accepted auto reload exactly once, including when its enemy is hidden', () => {
  const state = createBotCombat(0, 'ak47', { clip: 0, reserve: 90 })
  const reloads = []
  const options = {
    feet,
    targets: [],
    speed: 0,
    now: 10,
    alive: true,
    onReload: (weapon) => reloads.push({ ...weapon })
  }
  botShot(state, options)
  assert.equal(reloads.length, 1)
  assert.equal(reloads[0].isReloading, true)
  assert.equal(reloads[0].ammoClip, 0)
  botShot(state, { ...options, now: 10.1 })
  assert.equal(reloads.length, 1)
  const dead = createBotCombat(0, 'ak47', { clip: 0, reserve: 90 })
  botShot(dead, { ...options, alive: false })
  assert.equal(reloads.length, 1)
})

test('bot reload audio uses its authoritative position without requiring an avatar identity', () => {
  const source = buildSync({
    entryPoints: ['src/reload-audio.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    external: ['./practice', './index']
  }).outputFiles[0].text
  const sent = []
  const module = { exports: {} }
  const modules = {
    './practice': {
      getPractice: () => ({
        round: 1,
        roster: [
          { address: 'bot:0', connected: true },
          { address: 'near', connected: true },
          { address: 'far', connected: true }
        ]
      }),
      playerPosition: (id) =>
        id === 'near' ? { ...feet, x: feet.x + 6.4 } : id === 'far' ? { ...feet, x: feet.x + 13 } : undefined
    },
    './index': { room: { send: (type, data, options) => sent.push({ type, data, options }) } }
  }
  runInNewContext(source, { module, require: (name) => modules[name] })
  const state = createBotCombat(0, 'ak47', { clip: 0, reserve: 90 })
  botShot(state, {
    feet,
    targets: [],
    speed: 0,
    now: 10,
    alive: true,
    onReload: (weapon) => module.exports.broadcastReloadSound('bot:0', weapon, feet)
  })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].type, 'weaponReloadSound')
  assert.equal(sent[0].options.to[0], 'near')
  assert.equal(sent[0].data.volume, 127)
})

test('SDK Room delivers the private cue to the nearby client, preserving volume and excluding owner/far peers', async () => {
  const wire = sdkRooms(),
    authority = wire.add(AUTH_SERVER)
  const heard = new Map()
  for (const address of ['shooter', 'near', 'far']) {
    const sounds = []
    heard.set(address, sounds)
    combatClient({
      room: wire.add(address),
      modules: {
        './weapon-sounds': { playLocalSound: (name, volume) => sounds.push({ name, volume }) }
      }
    })
  }
  const server = humanServer({ room: authority })
  const shooter = server.addPlayer('shooter', 1, feet)
  server.addPlayer('near', 2, { ...feet, y: feet.y + 6.4 })
  server.addPlayer('far', 2, { ...feet, x: feet.x + 13 })
  arm(shooter)
  reload(server)
  await wire.deliverFrom(AUTH_SERVER)
  assert.deepEqual(heard.get('near'), [{ name: 'reload', volume: 127 / 255 }])
  assert.deepEqual(heard.get('shooter'), [])
  assert.deepEqual(heard.get('far'), [])
  await wire.inject('near', 'far', 'weaponReloadSound', { round: 1, volume: 255 })
  await wire.inject('near', AUTH_SERVER, 'weaponReloadSound', { round: 0, volume: 255 })
  for (const volume of [-1, 0, 256]) await wire.inject('near', AUTH_SERVER, 'weaponReloadSound', { round: 1, volume })
  assert.equal(heard.get('near').length, 1, 'untrusted, old and inaudible/invalid messages stay silent')
})

test('the received cue plays the pinned original clip at the encoded gain on actual SDK AudioSource components', async () => {
  const ids = []
  const module = { exports: {} }
  const source = buildSync({
    entryPoints: ['src/weapon-sounds.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    alias: { '@dcl/sdk/math': '@dcl/ecs-math' },
    external: ['@dcl/sdk/ecs']
  }).outputFiles[0].text
  runInNewContext(source, {
    module,
    require: () => ({
      ...sdk,
      engine: {
        ...sdk.engine,
        addEntity: () => {
          const id = sdk.engine.addEntity()
          ids.push(id)
          return id
        }
      }
    })
  })
  const wire = sdkRooms()
  combatClient({ room: wire.add('listener'), modules: { './weapon-sounds': module.exports } })
  try {
    await wire.inject('listener', AUTH_SERVER, 'weaponReloadSound', { round: 1, volume: 127 })
    const audio = sdk.AudioSource.get(ids[0])
    assert.equal(audio.audioClipUrl, 'assets/sounds/weapons/reload.wav')
    assert.equal(audio.playing, true)
    assert.equal(audio.volume, 127 / 255)
    assert.equal(audio.pitch, 1)
    assert.equal(sdk.Transform.get(ids[0]).parent, sdk.engine.CameraEntity)
    await wire.inject('listener', AUTH_SERVER, 'weaponReloadSound', { round: 1, volume: 255 })
    assert.equal(sdk.AudioSource.get(ids[1]).volume, 1)
    assert.equal(sdk.AudioSource.get(ids[0]).playing, false)
    await wire.inject('listener', AUTH_SERVER, 'weaponReloadSound', { round: 1, volume: 64 })
    assert.equal(ids.length, 2, 'repeated cues reuse the existing local audio pool')
    assert.equal(sdk.AudioSource.get(ids[0]).volume, 64 / 255)
  } finally {
    for (const id of ids) sdk.engine.removeEntity(id)
  }
})
