import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import * as sdk from '@dcl/ecs/dist-cjs/index.js'
import { Engine } from '@dcl/ecs/dist-cjs/engine/index.js'
import { defineTransformComponent } from '@dcl/ecs/dist-cjs/components/manual/Transform.js'
import * as components from '@dcl/ecs/dist-cjs/components/generated/index.gen.js'
import { compile } from './compile.mjs'
import { combatClient, InputAction } from './helpers/combat-client.mjs'
import { humanServer } from './helpers/human-server.mjs'
import { sdkRooms, AUTH_SERVER } from './helpers/sdk-room.mjs'
const load = compile('knife-feedback-rules', 'ballistics')
const { knifeFeedback } = load('knife-feedback-rules')
const feet = { x: 95, y: 10.026, z: 52 },
  target = { x: 94.4, y: feet.y, z: 52 }
const origin = { x: feet.x, y: feet.y + 1.6, z: feet.z }
const west = { x: -1, y: 0, z: 0 }
function game(options = {}) {
  const animations = []
  const f = combatClient({
    readyToShoot: true,
    room: options.room,
    aim: options.aim ?? west,
    modules: {
      './ballistics': load('ballistics'),
      './hit-regions': load('hit-regions'),
      './weapon-view': { attachWeaponModel() {}, predictKnifeAttack: (...args) => animations.push(args) },
      ...(options.observer
        ? { '@dcl/sdk/network': { myProfile: { userId: 'listener' }, isStateSyncronized: () => true } }
        : {})
    }
  })
  Object.assign(f.weapon, { name: 'Knife', readyAt: 0, lastShotTime: 0 })
  f.component('Transform').getMutable(1).position = options.feet ?? feet
  if (options.target) {
    f.component('PlayerIdentityData').create(700, { address: 'target' })
    f.component('Transform').create(700, { position: options.target, rotation: { x: 0, y: 0, z: 0, w: 1 } })
  }
  f.state.mobile = options.mobile ?? true
  f.step(10.5)
  return {
    ...f,
    animations,
    attack(attack, at = 11) {
      f.hold(
        attack === 'stab'
          ? InputAction.IA_SECONDARY
          : f.state.mobile
            ? InputAction.IA_ACTION_6
            : InputAction.IA_POINTER,
        true
      )
      f.step(at)
      return f.sent.filter((e) => e.type === 'knifeAttack').at(-1)?.data
    }
  }
}
const viewSource = buildSync({
  entryPoints: ['src/weapon-view.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  write: false,
  alias: { '@dcl/sdk/math': '@dcl/ecs-math' },
  external: ['@dcl/sdk/*', './bomb-client', './components', './fps-camera', './weapon-sounds']
}).outputFiles[0].text
function viewFixture() {
  const engine = Engine(),
    sounds = []
  const ecs = { engine, Transform: defineTransformComponent(engine), CameraType: { CT_FIRST_PERSON: 1 } }
  for (const name of ['Animator', 'VisibilityComponent', 'CameraModeArea', 'GltfContainer'])
    ecs[name] = components[name](engine)
  const weapon = { name: 'Knife', revision: 1, mode: 0, ammoClip: 0, isReloading: false }
  const modules = {
    '@dcl/sdk/ecs': ecs,
    './components': { Weapon: { getOrNull: () => weapon }, Dead: { has: () => false } },
    './fps-camera': {
      getCameraZoom: () => 90,
      getViewPunch: () => ({ pitch: 0, yaw: 0 }),
      getPainPunch: () => ({ pitch: 0, roll: 0 })
    },
    './bomb-client': { hasBombSelected: () => false },
    './weapon-sounds': { playModelSound() {}, playLocalSound: (...args) => sounds.push(args) }
  }
  const module = { exports: {} }
  runInNewContext(viewSource, { module, Date: { now: () => 10000 }, require: (name) => modules[name] })
  const update = () => module.exports.updateWeaponView(512)
  update()
  return {
    view: module.exports,
    weapon,
    sounds,
    update,
    clip: () =>
      [...engine.getEntitiesWith(ecs.Animator, ecs.VisibilityComponent)]
        .filter(([, , v]) => v.visible)
        .flatMap(([, a]) => a.states.filter((c) => c.playing))
        .map((c) => c.clip)[0]
  }
}
const response = (request, patch = {}) => ({
  owner: 'me',
  round: 1,
  shotId: request.shotId,
  attack: request.attack,
  position: origin,
  contact: false,
  target: false,
  feedback: { sound: 'knife_slash2', pitch: 0.94, origin },
  ...patch
})

test('knife cues distinguish misses, flesh, stabs and walls with original sound pitch', () => {
  for (const attack of ['swing', 'stab']) {
    assert.equal(knifeFeedback(attack, false, false, () => 0).sound, 'knife_slash2')
    assert.equal(knifeFeedback(attack, false, false, () => 0.9).sound, 'knife_swing')
    assert.equal(knifeFeedback(attack, false, false, () => 0).pitch, 0.94)
    for (let i = 0; i < 4; i++) {
      assert.equal(knifeFeedback(attack, true, false, () => i / 4).sound, 'knife_hitwall1')
      assert.equal(knifeFeedback(attack, true, false, () => i / 4).pitch, (98 + i) / 100)
      assert.equal(knifeFeedback('swing', true, true, () => i / 4).sound, i === 0 ? 'knife_hit' : `knife_hit${i + 1}`)
    }
  }
  assert.equal(knifeFeedback('stab', true, true).sound, 'knife_stab')
})

test('the original knife Animator selects stab-hit and restarts slash order only on deployment', () => {
  const f = viewFixture()
  f.view.predictKnifeAttack('stab', true)
  assert.equal(f.clip(), 'fixed_v_knife stab')
  f.view.predictKnifeAttack('swing', false)
  assert.equal(f.clip(), 'fixed_v_knife midslash1')
  f.view.predictKnifeAttack('stab', false)
  assert.equal(f.clip(), 'fixed_v_knife stab_miss')
  f.view.predictKnifeAttack('swing', true)
  assert.equal(f.clip(), 'fixed_v_knife midslash2')
  f.weapon.name = 'USP'
  f.weapon.revision++
  f.update()
  f.weapon.name = 'Knife'
  f.weapon.revision++
  f.update()
  f.view.predictKnifeAttack('swing', true)
  assert.equal(f.clip(), 'fixed_v_knife midslash1')
  assert.equal(f.sounds.length, 2)
  assert.ok(f.sounds.every(([name, volume]) => name === 'knife_deploy1' && volume === 0.3))
})

test('desktop and touch predict a contacted stab immediately and wait its 1.1-second cooldown', () => {
  for (const mobile of [true, false]) {
    const f = game({ target, mobile }),
      request = f.attack('stab')
    assert.ok(request)
    assert.equal(request.round, 1)
    assert.deepEqual(f.animations[0], ['stab', true])
    assert.equal(f.sounds.length, 0, 'flesh sound waits for authoritative contact')
    f.step(12.01)
    assert.equal(f.sent.filter((e) => e.type === 'knifeAttack').length, 1)
    f.step(12.11)
    assert.equal(f.sent.filter((e) => e.type === 'knifeAttack').length, 2)
  }
})

test('a clear miss and a nearby actual Dust2 wall choose different local knife feedback', () => {
  const miss = game(),
    wall = game({ feet: { x: 98.3, y: feet.y, z: 52 }, aim: { x: 1, y: 0, z: 0 } })
  miss.attack('stab')
  wall.attack('stab')
  assert.deepEqual(miss.animations[0], ['stab', false])
  assert.ok(['knife_swing', 'knife_slash2'].includes(miss.sounds.at(-1).name))
  assert.equal(miss.sounds.at(-1).pitch, 0.94)
  assert.deepEqual(wall.animations[0], ['stab', true])
  assert.equal(wall.sounds.at(-1).name, 'knife_hitwall1')
})

test('a real knife intent crosses SDK Room, damages once, sounds on both clients and keeps the local animation', async () => {
  const wire = sdkRooms(),
    authority = wire.add(AUTH_SERVER),
    local = wire.add('me')
  const server = humanServer({ room: authority }),
    shooter = server.addPlayer('me', 1, feet),
    victim = server.addPlayer('target', 2, target)
  shooter.weapon().name = 'Knife'
  server.at(11)
  const remote = game({ room: wire.add('listener'), observer: true })
  const f = game({
    target,
    room: {
      onMessage: (...args) => local.onMessage(...args),
      send: (type, ...args) => (type === 'playerJoin' ? undefined : local.send(type, ...args))
    }
  })
  const request = f.attack('stab')
  assert.equal(f.sounds.length, 0)
  await wire.deliverFrom('me')
  assert.ok(victim.health().current < 100)
  await wire.deliverFrom(AUTH_SERVER)
  assert.equal(remote.sounds.length, 1)
  assert.equal(remote.sounds[0].name, 'knife_stab')
  assert.equal(f.sounds.length, 1, 'authoritative contact produces one flesh cue')
  assert.equal(f.sounds[0].name, 'knife_stab')
  assert.equal(f.animations.length, 1, 'no delayed animation replay')
  const health = victim.health().current
  local.send('knifeAttack', request)
  await wire.deliverFrom('me')
  assert.equal(victim.health().current, health)
})

test('correction sounds once, while old-round, expired and replaced-weapon acknowledgements stay silent', async () => {
  for (const guard of ['none', 'round', 'expired', 'weapon']) {
    const wire = sdkRooms(),
      f = game({ room: wire.add('me') }),
      request = f.attack('stab')
    if (guard === 'round') f.match.round++
    if (guard === 'expired') f.state.now = 14
    if (guard === 'weapon') {
      f.weapon.name = 'USP'
      f.weapon.revision++
    }
    const hit = response(request, {
      contact: true,
      target: false,
      feedback: { sound: 'knife_hitwall1', pitch: 0.99, origin }
    })
    await wire.inject('me', AUTH_SERVER, 'knifeResult', hit)
    await wire.inject('me', AUTH_SERVER, 'knifeResult', hit)
    assert.equal(f.sounds.length, guard === 'none' ? 2 : 1, guard)
    assert.equal(f.animations.length, 1)
  }
})

test('the server rejects a previous-round knife request before claiming its sequence', () => {
  const f = humanServer(),
    shooter = f.addPlayer('me', 1, feet),
    victim = f.addPlayer('target', 2, target)
  shooter.weapon().name = 'Knife'
  const request = { round: 0, revision: 1, shotId: 1, attack: 'stab', direction: west }
  f.message('knifeAttack', 'me', request)
  assert.equal(victim.health().current, 100)
  assert.equal(f.sent.filter((e) => e.type === 'knifeResult').length, 0)
  f.message('knifeAttack', 'me', { ...request, round: 1 })
  assert.ok(victim.health().current < 100)
})

test('actual SDK audio sources carry knife pitch and reset it when their pooled emitter plays another sound', () => {
  const ids = []
  const module = { exports: {} }
  const source = buildSync({
    entryPoints: ['src/weapon-sounds.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
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
  try {
    const sounds = module.exports
    sounds.playLocalSound('knife_swing', 1, 0.94)
    assert.equal(sdk.AudioSource.get(ids[0]).pitch, 0.94)
    sounds.playLocalSound('knife_swing')
    sounds.playLocalSound('knife_swing')
    assert.equal(sdk.AudioSource.get(ids[0]).pitch, 1)
    sounds.playWorldSound('knife_hitwall1', origin, 1, 0.99)
    const world = ids.at(-1)
    assert.equal(sdk.AudioSource.get(world).pitch, 0.99)
    for (let i = 0; i < 6; i++) sounds.playWorldSound('ak47_fire', origin)
    assert.equal(sdk.AudioSource.get(world).pitch, 1)
  } finally {
    for (const id of ids) sdk.engine.removeEntity(id)
  }
})
