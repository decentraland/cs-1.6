import assert from 'node:assert/strict'
import { test } from 'node:test'
import { humanServer } from './helpers/human-server.mjs'
import { combatClient } from './helpers/combat-client.mjs'
import { sdkRooms, AUTH_SERVER } from './helpers/sdk-room.mjs'
import { compile } from './compile.mjs'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import * as sdk from '@dcl/ecs/dist-cjs/index.js'

const load = compile('bot-combat', 'inventory-rules')
const { GUNS } = load('weapon-profiles')
const { startingInventory } = load('inventory-rules')
const { createBotCombat, botShot } = load('bot-combat')
const feet = { x: 95, y: 10.026, z: 52 }
const cues = (f) => f.sent.filter((event) => event.type === 'shellReloadSound')

function fixture(id = 'xm1014', options = {}) {
  const f = humanServer({ equipment: true, inventory: true, ...options })
  const p = f.addPlayer('me', 2, feet)
  f.component('PlayerInventory').create(p.id, startingInventory(2, id))
  f.server.equipActiveWeapon(p.id)
  p.weapon().ammoClip = GUNS[id].clip - 3
  f.at(11)
  return {
    ...f,
    p,
    reload: () => f.message('playerReload', 'me', { round: 1, revision: p.weapon().revision }),
    advance: (time) => {
      f.at(time)
      f.server.weaponSystem()
    }
  }
}

test('XM1014 sounds once at each shell insertion start, before that shell enters the tube', () => {
  const f = fixture()
  f.reload()
  assert.equal(cues(f).length, 0)
  f.advance(11.549)
  assert.equal(cues(f).length, 0)
  for (const [at, count, clip] of [
    [11.55, 1, 4],
    [11.85, 2, 5],
    [12.15, 3, 6],
    [12.45, 3, 7]
  ]) {
    f.advance(at)
    assert.equal(cues(f).length, count)
    assert.equal(f.p.weapon().ammoClip, clip)
    f.advance(at)
    assert.equal(cues(f).length, count, 'same update does not replay a shell')
  }
  assert.equal(f.p.weapon().ammoReserve, 29)
  assert.equal(f.p.weapon().isReloading, false)
  for (const cue of cues(f)) {
    assert.equal(cue.data.owner, 'me')
    assert.equal(cue.data.round, 1)
    assert.deepEqual(cue.data.position, feet)
    assert.ok([1, 3].includes(cue.data.variant))
    assert.ok(Number.isInteger(cue.data.pitch) && cue.data.pitch >= 85 && cue.data.pitch <= 116)
  }
})

test('M3 retains model audio and magazine guns do not acquire XM1014 shell sounds', () => {
  for (const id of ['m3', 'm4a1']) {
    const f = fixture(id)
    f.reload()
    for (const at of [11.55, 12, 12.45, 12.9, 15]) f.advance(at)
    assert.equal(cues(f).length, 0)
  }
})

test('holstering or death before insertion cancels shell audio; late updates do not replay completed insertions', () => {
  for (const action of ['holster', 'death', 'stall']) {
    const f = fixture()
    f.reload()
    if (action === 'holster')
      f.message('weaponSelect', 'me', { round: 1, revision: f.p.weapon().revision, slot: 'melee' })
    if (action === 'death') f.component('Dead').create(f.p.id, {})
    f.advance(action === 'stall' ? 15 : 11.55)
    assert.equal(cues(f).length, 0)
  }
})

test('a shot that advances reload before the weapon system cannot skip or duplicate its shell cue', () => {
  const f = fixture()
  f.reload()
  f.at(11.55)
  f.shoot('me', { revision: f.p.weapon().revision })
  assert.equal(cues(f).length, 1)
  f.advance(11.55)
  assert.equal(cues(f).length, 1)
  assert.equal(f.p.weapon().isReloading, false)
  assert.equal(f.p.weapon().ammoClip, 3)
})

test('bot auto reload reports shell starts even without a target and stops once dead', () => {
  const combat = createBotCombat(0, 'xm1014', { clip: 0, reserve: 3 })
  const heard = []
  const options = { feet, targets: [], speed: 0, alive: true, onShellReload: (w) => heard.push(w.ammoClip) }
  botShot(combat, { ...options, now: 10 })
  assert.deepEqual(heard, [])
  botShot(combat, { ...options, now: 10.55 })
  botShot(combat, { ...options, now: 10.55 })
  botShot(combat, { ...options, now: 10.85 })
  assert.deepEqual(heard, [0, 1])
  botShot(combat, { ...options, now: 11.15, alive: false })
  assert.deepEqual(heard, [0, 1])
})

test('SDK Room routes source shell audio locally for the owner and positionally for others, rejecting forged or invalid cues', async () => {
  const wire = sdkRooms(),
    authority = wire.add(AUTH_SERVER)
  const ownerSounds = [],
    otherSounds = []
  combatClient({
    room: wire.add('me'),
    modules: { './weapon-sounds': { playShellReloadSound: (...args) => ownerSounds.push(args) } }
  })
  combatClient({
    room: wire.add('other'),
    modules: {
      '@dcl/sdk/network': { myProfile: { userId: 'other' }, isStateSyncronized: () => true },
      './weapon-sounds': { playShellReloadSound: (...args) => otherSounds.push(args) }
    }
  })
  const f = fixture('xm1014', { room: authority })
  f.reload()
  f.advance(11.55)
  await wire.deliverFrom(AUTH_SERVER)
  assert.equal(ownerSounds.length, 1)
  assert.equal(otherSounds.length, 1)
  assert.equal(ownerSounds[0][1], otherSounds[0][1])
  assert.equal(ownerSounds[0][3], true)
  assert.equal(otherSounds[0][3], false)
  assert.deepEqual(otherSounds[0][2], { x: Math.fround(feet.x), y: Math.fround(feet.y), z: Math.fround(feet.z) })
  assert.equal(ownerSounds[0][4], cues(f)[0].data.pitch / 100)
  const valid = { owner: 'me', round: 1, position: feet, variant: 1, pitch: 100 }
  await wire.inject('other', 'me', 'shellReloadSound', valid)
  for (const patch of [
    { round: 0 },
    { variant: 2 },
    { pitch: 84 },
    { pitch: 117 },
    { position: { x: NaN, y: 0, z: 0 } }
  ]) {
    await wire.inject('other', AUTH_SERVER, 'shellReloadSound', { ...valid, ...patch })
  }
  assert.equal(otherSounds.length, 1)
})

test('actual SDK audio replaces the previous shell variant on one item channel and bounds concurrent reloaders', () => {
  const ids = [],
    module = { exports: {} }
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
  const play = module.exports.playShellReloadSound
  try {
    play('me', 3, feet, true, 0.85)
    assert.equal(sdk.AudioSource.get(ids[0]).audioClipUrl, 'assets/sounds/weapons/shell_reload3.wav')
    assert.equal(sdk.AudioSource.get(ids[0]).pitch, 0.85)
    assert.equal(sdk.Transform.get(ids[0]).parent, sdk.engine.CameraEntity)
    play('me', 1, feet, true, 1.16)
    assert.equal(sdk.AudioSource.get(ids[0]).playing, false)
    assert.equal(sdk.AudioSource.get(ids[1]).playing, true)
    assert.equal(sdk.AudioSource.get(ids[1]).pitch, 1.16)
    play('other', 1, feet, false, 1)
    assert.deepEqual({ ...sdk.Transform.get(ids[2]).position }, feet)
    assert.equal(sdk.Transform.get(ids[2]).parent, sdk.engine.RootEntity)
    assert.equal(sdk.AudioSource.get(ids[1]).playing, true, 'other reloaders have independent channels')
    for (let n = 0; n < 20; n++) play('other:' + n, 3, feet, false, 1)
    assert.equal(ids.length, 20, 'ten two-source channels are recycled')
  } finally {
    for (const id of ids) sdk.engine.removeEntity(id)
  }
})
