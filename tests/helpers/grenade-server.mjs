import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { Engine } from '@dcl/ecs/dist-cjs/engine/index.js'
import { Schemas } from '@dcl/ecs/dist-cjs/schemas/index.js'
import { defineTransformComponent } from '@dcl/ecs/dist-cjs/components/manual/Transform.js'

const source = buildSync({
  stdin: {
    contents: `
      export * from './src/grenades'
      export * from './src/components'
      export { spawnInventory, equipActiveWeapon } from './src/inventory'
    `,
    resolveDir: process.cwd()
  },
  bundle: true,
  format: 'cjs',
  platform: 'node',
  write: false,
  external: ['@dcl/sdk/*', './practice', './server', './index', './bomb', './penetration']
}).outputFiles[0].text

export function grenadeServer(room) {
  const systems = [],
    players = new Map(),
    handlers = {},
    feet = new Map(),
    synced = []
  const engine = { ...Engine(), addSystem: (fn) => systems.push(fn) }
  const state = { now: 10, round: 1, phase: 'live', eligible: true, busy: false, matchOver: false }
  const modules = {
    '@dcl/sdk/ecs': { engine, Schemas, Transform: defineTransformComponent(engine) },
    '@dcl/sdk/network': { isServer: () => true, syncEntity: (id) => synced.push(id) },
    '@dcl/sdk/network/message-bus-sync': { AUTH_SERVER_PEER_ID: 'authoritative-server' },
    './index': {
      room: {
        onMessage: (name, fn) => {
          handlers[name] = fn
          room?.onMessage(name, fn)
        },
        send() {}
      }
    },
    './server': {
      playerEntities: players,
      resetPlayerAccuracy() {},
      isPlayerTriggerHeld: () => false,
      avatarForward: () => ({ x: 0, y: 0, z: 1 }),
      playerLookDirection: () => ({ x: 0, y: 0, z: 1 }),
      applyPlayerDamage() {}
    },
    './practice': {
      getPractice: () => state,
      canPlayRound: () => state.eligible,
      playerPosition: (address) => feet.get(address),
      displayName: (address) => address,
      hurtBot() {},
      creditKill() {}
    },
    './bomb': { getBomb: () => undefined, holsterBomb() {}, isBombBusy: () => state.busy },
    './penetration': {
      bulletWorldTrace: (origin, direction, limit) => ({
        distance: limit,
        position: {
          x: origin.x + direction.x * limit,
          y: origin.y + direction.y * limit,
          z: origin.z + direction.z * limit
        },
        solid: false,
        allSolid: false,
        startSolid: false
      })
    }
  }
  const module = { exports: {} }
  runInNewContext(source, {
    module,
    Date: { now: () => state.now * 1000 },
    require: (name) => {
      assert.ok(name in modules, name)
      return modules[name]
    }
  })
  const api = module.exports
  api.initializeGrenades()
  let sequence = 0
  function add(id, count = 1, address = 'me') {
    const player = engine.addEntity()
    players.set(address, player)
    feet.set(address, { x: 0, y: 0, z: 0 })
    api.PlayerAddress.create(player, { address })
    api.PlayerHealth.create(player, { current: 100 })
    api.PlayerTeam.create(player, { team: 2 })
    api.PlayerEquipment.create(player, {})
    api.PlayerInventory.create(player, {
      active: id,
      items: [
        { id: 'usp', clip: 12, reserve: 24 },
        { id, clip: -1, reserve: count }
      ]
    })
    api.equipActiveWeapon(player)
    return {
      player,
      weapon: () => api.Weapon.getMutable(player),
      inventory: () => api.PlayerInventory.getMutable(player),
      use: (held, extra = {}) =>
        handlers.grenadeUse(
          {
            held,
            revision: api.Weapon.get(player).revision,
            round: state.round,
            direction: { x: 0, y: 0, z: 1 },
            sequence: ++sequence,
            ...extra
          },
          { from: address }
        )
    }
  }
  return {
    api,
    state,
    engine,
    synced,
    add,
    handlers,
    tick: (now) => {
      state.now = now
      systems.forEach((fn) => fn(0.016))
    },
    projectiles: () => [...engine.getEntitiesWith(api.GrenadeProjectile)].map(([, data]) => data)
  }
}
