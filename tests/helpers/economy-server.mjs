import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { Engine } from '@dcl/ecs/dist-cjs/engine/index.js'
import { Schemas } from '@dcl/ecs/dist-cjs/schemas/index.js'

const source = buildSync({
  stdin: {
    contents: `
      export * from './src/economy'
      export * from './src/components'
      export { spawnInventory, equipActiveWeapon } from './src/inventory'
    `,
    resolveDir: process.cwd()
  },
  bundle: true,
  format: 'cjs',
  platform: 'node',
  write: false,
  external: ['@dcl/sdk/*', './practice', './server', './index', './dropped-weapons', './bot-economy', './bomb']
}).outputFiles[0].text

export function economyServer(room) {
  const engine = Engine(),
    players = new Map(),
    handlers = {},
    sent = [],
    drops = []
  const state = { round: 1, phase: 'freeze', elapsed: 0, eligible: true, inZone: true, matchOver: false }
  const modules = {
    '@dcl/sdk/ecs': { engine, Schemas },
    '@dcl/sdk/network': { isServer: () => true },
    './server': {
      playerEntities: players,
      resetPlayerAccuracy() {},
      playerGunAccuracy: () => undefined,
      isPlayerTriggerHeld: () => false
    },
    './index': {
      room: {
        onMessage: (name, fn) => {
          handlers[name] = fn
          room?.onMessage(name, fn)
        },
        send: (name, data) => {
          sent.push({ name, data: structuredClone(data) })
          room?.send(name, data)
        }
      }
    },
    './practice': {
      getPractice: () => state,
      canPlayRound: () => state.eligible,
      roundElapsed: () => state.elapsed,
      playerPosition: (address) =>
        state.inZone
          ? api.PlayerTeam.get(players.get(address)).team === 1
            ? { x: 80, y: 12, z: 132 }
            : { x: 55, y: 7, z: 50 }
          : { x: 0, y: 0, z: 0 }
    },
    './dropped-weapons': { throwPlayerGun: (player, gun) => drops.push({ player, gun: structuredClone(gun) }) },
    './bot-economy': { botAccounts: new Map(), creditBot() {} },
    './bomb': { holsterBomb() {}, isBombBusy: () => false }
  }
  const module = { exports: {} }
  runInNewContext(source, {
    module,
    require: (name) => {
      assert.ok(name in modules, name)
      return modules[name]
    }
  })
  const api = module.exports
  api.initializeEconomy()
  let sequence = 0
  function add(address = 'me', team = 2) {
    const player = engine.addEntity()
    players.set(address, player)
    api.PlayerAddress.create(player, { address })
    api.PlayerTeam.create(player, { team })
    api.PlayerMoney.create(player, { amount: 16000 })
    api.PlayerHealth.create(player, { current: 100, armor: 0 })
    api.PlayerEquipment.create(player, {})
    api.spawnInventory(player, team)
    return {
      player,
      buy: (item, extra = {}) =>
        handlers.buyEquipment({ item, round: state.round, sequence: ++sequence, ...extra }, { from: address }),
      respawn: (funds = 16000) => {
        api.Dead.deleteFrom(player)
        api.PlayerMoney.getMutable(player).amount = funds
        api.PlayerHealth.getMutable(player).armor = 0
        api.PlayerEquipment.createOrReplace(player, {})
        api.spawnInventory(player, api.PlayerTeam.get(player).team)
      },
      inventory: () => api.PlayerInventory.getMutable(player),
      health: () => api.PlayerHealth.getMutable(player),
      equipment: () => api.PlayerEquipment.getMutable(player),
      weapon: () => api.Weapon.getMutable(player),
      money: () => api.PlayerMoney.get(player).amount,
      notice: () =>
        sent.filter((event) => event.name === 'matchNotice' && event.data.address === address).at(-1)?.data.message
    }
  }
  return { add, state, api, handlers, sent, drops }
}
