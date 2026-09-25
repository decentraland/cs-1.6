import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { compile } from './compile.mjs'
import { humanServer } from './helpers/human-server.mjs'
import { combatClient, InputAction } from './helpers/combat-client.mjs'
import { sdkRooms, AUTH_SERVER } from './helpers/sdk-room.mjs'

const load = compile('ballistics', 'weapon-fire-animation', 'weapon-models', 'bot-loadout')
const { aimShot } = load('ballistics')
const { freshGunAccuracy } = load('gun-accuracy')
const { GUNS } = load('weapon-profiles')
const { chooseFire } = load('weapon-fire-animation')
const { WEAPON_MODELS } = load('weapon-models')
const { startReload, finishReload } = load('combat-rules')
const { createBotCombat, botShot } = load('bot-combat')
const { botDeathGun } = load('bot-loadout')
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)

const equipCode = buildSync({
  entryPoints: ['src/systems.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  external: ['@dcl/sdk/*', './components', './server', './reload-audio']
}).outputFiles[0].text
function equipment() {
  let weapon
  const item = { id: 'elite', clip: 30, reserve: 120, mode: 0 }
  const inventory = { active: 'elite', items: [item] }
  const modules = {
    '@dcl/sdk/ecs': { engine: {} },
    '@dcl/sdk/network': { isServer: () => true },
    './server': { resetPlayerAccuracy() {}, playerGunAccuracy: () => undefined },
    './components': {
      Weapon: {
        getOrNull: () => weapon,
        createOrReplace: (_, data) => {
          weapon = data
        }
      },
      PlayerAddress: { getOrNull: () => ({ address: 'me' }) },
      PlayerInventory: { getMutableOrNull: () => inventory }
    }
  }
  const module = { exports: {} }
  runInNewContext(equipCode, { module, Date: { now: () => 10000 }, require: (name) => modules[name] })
  return { api: module.exports, weapon: () => weapon, item }
}

test('Dual Elites deploy chooses left on even clips and preserves the stored hand on odd clips', () => {
  for (const clip of [30, 29, 2, 1])
    for (const mode of [0, 1]) {
      const f = equipment()
      f.api.equipGun(512, 'elite', clip, 120, mode)
      assert.equal(f.weapon().mode, clip % 2 ? mode : 1)
      f.api.storeActiveGun(512)
      assert.equal(f.item.mode, f.weapon().mode)
    }
})

test('Elites offset the bullet origin by five source units on the firing side, including pitched/recoiling aim', () => {
  for (const aim of [
    { x: 0, y: 0, z: 1 },
    { x: -1, y: 0, z: 0 },
    { x: 0.6, y: 0.8, z: 0 }
  ]) {
    for (const mode of [0, 1]) {
      const accuracy = freshGunAccuracy('elite')
      Object.assign(accuracy, { yaw: 12, pitch: 3, updatedAt: 10 })
      const options = {
        gun: 'elite',
        mode,
        feet: { x: 95, y: 10.026, z: 52 },
        aim,
        accuracy,
        triggerHeld: true,
        speed: 0,
        now: 10,
        grounded: true,
        random: () => 0.5
      }
      const plan = aimShot(options)
      const angle = Math.atan2(aim.x, aim.z) + (12 * Math.PI) / 180
      const sign = mode ? -1 : 1
      near(plan.origin.x, 95 + Math.cos(angle) * 0.125 * sign)
      near(plan.origin.y, 11.626)
      near(plan.origin.z, 52 - Math.sin(angle) * 0.125 * sign)
    }
  }
  for (const id of Object.keys(GUNS).filter((id) => id !== 'elite')) {
    const plan = aimShot({
      gun: id,
      mode: 1,
      feet: { x: 95, y: 10.026, z: 52 },
      aim: { x: 0, y: 0, z: 1 },
      accuracy: freshGunAccuracy(id),
      triggerHeld: true,
      speed: 0,
      now: 10,
      grounded: true,
      random: () => 0.5
    })
    near(plan.origin.x, 95)
    near(plan.origin.y, 11.626)
    near(plan.origin.z, 52)
  }
})

test('Elite animations use the firing hand and elapsed-shot thresholds instead of clip parity or random variants', () => {
  for (const mode of [0, 1])
    for (const [elapsed, variant] of [
      [0.075, 1],
      [0.199, 1],
      [0.2, 2],
      [0.3, 3],
      [0.4, 4],
      [0.5, 5],
      [5, 5]
    ]) {
      const side = mode ? 'left' : 'right'
      for (const remaining of [29, 28, 2, 1])
        assert.equal(
          chooseFire('elite', WEAPON_MODELS.elite, mode, remaining, '', () => 0, elapsed),
          `shoot_${side}${variant}`
        )
      assert.equal(
        chooseFire('elite', WEAPON_MODELS.elite, mode, 0, '', () => 0, elapsed),
        `shoot_${side}last`
      )
    }
})

test('authoritative Elite shots alternate once per accepted round and keep the hand through a partial reload', () => {
  const f = humanServer()
  const shooter = f.addPlayer('me', 1, { x: 95, y: 10.026, z: 52 })
  Object.assign(shooter.weapon(), {
    name: 'Dual Elites',
    mode: 1,
    fireRate: 0.075,
    damage: 36,
    zoom: 90,
    ammoClip: 30,
    maxAmmoClip: 30,
    ammoReserve: 120,
    reloadTime: 4.5
  })
  f.server.resetPlayerAccuracy('me', true)
  const press = (id, time) => {
    f.at(time)
    f.message('playerTrigger', 'me', { held: false, sequence: id * 2 })
    f.message('playerTrigger', 'me', { held: true, sequence: id * 2 + 1 })
    f.shoot('me', { shotId: id })
  }
  press(1, 10)
  const first = f.sent.findLast((event) => event.type === 'practiceShot').data
  near(first.fire.origin.z, 51.875)
  assert.equal(first.fire.mode, 1, 'event identifies the pistol that fired')
  assert.equal(shooter.weapon().mode, 0, 'weapon stores the next firing hand')
  press(2, 10.001)
  assert.equal(shooter.weapon().ammoClip, 29)
  assert.equal(shooter.weapon().mode, 0, 'a rejected early shot cannot advance the hand')
  assert.equal(startReload(shooter.weapon(), 11, true), true)
  assert.equal(finishReload(shooter.weapon(), 15.5), true)
  assert.equal(shooter.weapon().mode, 0, 'reload preserves the right pistol even with a full magazine')
  f.server.resetPlayerAccuracy('me', false, true)
  press(3, 16)
  const second = f.sent.findLast((event) => event.type === 'practiceShot').data
  near(second.fire.origin.z, 52.125)
  assert.equal(second.fire.mode, 0)
  assert.equal(shooter.weapon().mode, 1)
  assert.equal(shooter.weapon().ammoClip, 29)
  f.shoot('me', { shotId: 3 })
  assert.equal(shooter.weapon().mode, 1, 'duplicate requests cannot advance the hand')
})

test('desktop and touch prediction choose hands around pending acknowledgements and send the unshifted eye claim', () => {
  for (const mobile of [false, true]) {
    let pending = 0
    const plans = [],
      animations = []
    const f = combatClient({
      readyToShoot: true,
      modules: {
        './fps-camera': {
          setCameraTrigger() {},
          pendingCameraShots: () => pending,
          getFpsAimDirection: () => ({ x: 0, y: 0, z: 1 }),
          predictCameraKick: (_id, _speed, _spread, mode) => {
            plans.push(mode)
            pending++
            return { origin: { x: mode ? -0.125 : 0.125, y: 1.6, z: 0 }, direction: { x: 0, y: 0, z: 1 }, spread: 0 }
          }
        },
        './ballistics': load('ballistics'),
        './weapon-view': { predictWeaponShot: (...args) => animations.push(args), attachWeaponModel() {} }
      }
    })
    f.state.mobile = mobile
    Object.assign(f.weapon, { name: 'Dual Elites', mode: 1, fireRate: 0.075, ammoClip: 30 })
    f.step(10)
    const fire = mobile ? InputAction.IA_ACTION_6 : InputAction.IA_POINTER
    f.hold(fire, true)
    f.step(11)
    f.hold(fire, false)
    f.step(11.01)
    f.hold(fire, true)
    f.step(11.1)
    assert.deepEqual(plans, [1, 0])
    assert.deepEqual(
      animations.map((args) => args[2]),
      [1, 0]
    )
    const intents = f.sent.filter((event) => event.type === 'playerShoot')
    for (const event of intents) assert.deepEqual(event.data.origin, { x: 0, y: 1.6, z: 0 })
    pending = 1
    Object.assign(f.weapon, { mode: 0, ammoClip: 29, lastFiredShotId: 1 })
    f.hold(fire, false)
    f.step(11.11)
    f.hold(fire, true)
    f.step(11.2)
    assert.equal(plans.at(-1), 1, 'first acknowledgement does not restart alternation')
  }
})

test('bot Elite hands alternate and survive into dropped weapon state', () => {
  const combat = createBotCombat(0, 'elite', { clip: 30, reserve: 120 })
  const account = { inventory: { active: 'elite', items: [{ id: 'elite', clip: 30, reserve: 120 }] } }
  combat.visible = true
  const options = {
    feet: { x: 95, y: 10.026, z: 52 },
    target: { x: 85, y: 11.426, z: 52 },
    targets: [],
    speed: 0,
    now: 10,
    alive: true,
    random: () => 0.5,
    difficulty: 'expert'
  }
  const first = botShot(combat, options)
  near(first.origin.z, 51.875)
  assert.equal(combat.weapon.mode, 0)
  const dropped = botDeathGun(account, combat)
  assert.equal(dropped.mode, 0)
  options.now = 10.2
  const second = botShot(combat, options)
  near(second.origin.z, 52.125)
  assert.equal(combat.weapon.mode, 1)
})

test('hand prediction reconciles acknowledgements, rejection, stale snapshots and new deployments', () => {
  const { EliteHandPrediction } = load('weapon-modes')
  const prediction = new EliteHandPrediction()
  const weapon = { mode: 1, revision: 1, lastFiredShotId: 0 }
  assert.equal(prediction.fire(weapon, 1, 1), 1)
  prediction.confirm(1, 1)
  assert.equal(prediction.fire(weapon, 1, 2), 0, 'reply arrived before the CRDT weapon update')
  prediction.reject(2)
  assert.equal(prediction.fire(weapon, 1, 3), 0, 'rejection does not spend a hand')
  Object.assign(weapon, { mode: 0, lastFiredShotId: 1 })
  assert.equal(prediction.fire(weapon, 1, 4), 1)
  prediction.confirm(4, 1)
  prediction.confirm(3, 0)
  assert.equal(prediction.fire(weapon, 1, 5), 0, 'older confirmations cannot reverse a newer one')
  Object.assign(weapon, { mode: 1, revision: 3, lastFiredShotId: 4 })
  assert.equal(prediction.fire(weapon, 1, 6), 1)
  prediction.confirm(5, 0)
  assert.equal(prediction.fire(weapon, 1, 7), 0, 'old-deployment replies do not change the new hand')
  Object.assign(weapon, { mode: 1, lastFiredShotId: 0 })
  assert.equal(prediction.fire(weapon, 2, 8), 1, 'new round clears the previous sequence')
})

test('left and right Elite origins decide contact with an exposed head near cover', () => {
  const { fireGunShot, PLAYER_HIT_REGIONS } = load('ballistics')
  const shot = (mode) =>
    fireGunShot({
      gun: 'elite',
      mode,
      feet: { x: 95, y: 10.026, z: 52 },
      aim: { x: -1, y: 0, z: 0 },
      accuracy: freshGunAccuracy('elite'),
      triggerHeld: true,
      speed: 0,
      now: 10,
      grounded: true,
      random: () => 0.5,
      damage: 36,
      targets: [{ id: 'head', center: { x: 93, y: 10.026, z: 51.74 }, regions: PLAYER_HIT_REGIONS }]
    })
  assert.equal(shot(1).hit?.group, 'head')
  assert.equal(shot(0).hit, undefined)
})

test('production desktop/touch clients and server keep matching Elite origins through SDK Room before CRDT catches up', async () => {
  for (const mobile of [true, false]) {
    const wire = sdkRooms(),
      authority = wire.add(AUTH_SERVER),
      local = wire.add('me')
    const server = humanServer({ room: authority })
    const feet = { x: 95, y: 10.026, z: 52 }
    const shooter = server.addPlayer('me', 1, feet)
    Object.assign(shooter.weapon(), { name: 'Dual Elites', mode: 1, fireRate: 0.075, damage: 36, zoom: 90 })
    server.server.resetPlayerAccuracy('me', true)
    const plans = [],
      animations = []
    const f = combatClient({
      readyToShoot: true,
      aim: { x: -1, y: 0, z: 0 },
      room: {
        onMessage: (...args) => local.onMessage(...args),
        send: (type, ...args) => (type === 'playerJoin' ? undefined : local.send(type, ...args))
      },
      modules: {
        './ballistics': load('ballistics'),
        './weapon-view': { attachWeaponModel() {}, predictWeaponShot: (...args) => animations.push(args) },
        './fps-camera': {
          setCameraTrigger() {},
          pendingCameraShots: () => 0,
          getFpsAimDirection: () => ({ x: -1, y: 0, z: 0 }),
          receiveCameraKick() {},
          predictCameraKick: (_id, _speed, _spread, mode) => {
            const plan = aimShot({
              gun: 'elite',
              mode,
              feet,
              aim: { x: -1, y: 0, z: 0 },
              accuracy: freshGunAccuracy('elite'),
              triggerHeld: true,
              speed: 0,
              now: 11,
              grounded: true,
              random: () => 0.5
            })
            plans.push(plan)
            return plan
          }
        }
      }
    })
    f.state.mobile = mobile
    Object.assign(f.weapon, { name: 'Dual Elites', mode: 1, ammoClip: 30, fireRate: 0.075 })
    f.component('Transform').getMutable(1).position = feet
    f.step(10.5)
    const fire = mobile ? InputAction.IA_ACTION_6 : InputAction.IA_POINTER
    for (let i = 0; i < 3; i++) {
      server.at(11 + i)
      f.hold(fire, true)
      f.step(11 + i)
      await wire.deliverFrom('me')
      const result = server.sent.findLast((event) => event.type === 'practiceShot').data
      near(result.fire.origin.x, plans[i].origin.x, 1e-5)
      near(result.fire.origin.y, plans[i].origin.y, 1e-5)
      near(result.fire.origin.z, plans[i].origin.z, 1e-5)
      assert.equal(result.fire.mode, i % 2 ? 0 : 1)
      assert.equal(animations[i][2], result.fire.mode)
      await wire.deliverFrom(AUTH_SERVER)
      f.hold(fire, false)
      f.step(11.01 + i)
      await wire.deliverFrom('me')
    }
    assert.equal(shooter.weapon().ammoClip, 27)
    assert.equal(f.weapon.mode, 1, 'fixture deliberately withholds the updated weapon component')
    assert.equal(f.weapon.ammoClip, 30)
  }
})
