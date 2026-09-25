import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'

const outputs = new Map()
function compiledServer(equipment) {
  if (outputs.has(equipment)) return outputs.get(equipment)
  const output = buildSync({
    stdin: {
      contents: `export * from './src/server'; export { initializeInventory } from './src/inventory'; ${equipment ? "export * from './src/systems'; export { equipActiveWeapon } from './src/inventory'" : ''}`,
      resolveDir: process.cwd()
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    external: [
      '@dcl/sdk/*',
      './index',
      './practice',
      './bomb',
      './dropped-weapons',
      './falling',
      ...(equipment ? [] : ['./systems'])
    ]
  }).outputFiles[0].text
  outputs.set(equipment, output)
  return output
}

export function humanServer(options = {}) {
  let now = 10,
    nextEntity = 512
  const components = new Map(),
    systems = [],
    entities = new Set(),
    handlers = new Map(),
    sent = [],
    logs = []
  const component = (name) => {
    if (components.has(name)) return components.get(name)
    const values = new Map()
    const value = {
      componentId: components.size,
      has: (id) => values.has(id),
      get: (id) => {
        if (!values.has(id)) throw Error(`${name} missing on ${id}`)
        return values.get(id)
      },
      getOrNull: (id) => values.get(id),
      getMutable: (id) => value.get(id),
      getMutableOrNull: (id) => values.get(id),
      create: (id, data) => values.set(id, structuredClone(data)),
      createOrReplace: (id, data) => values.set(id, structuredClone(data)),
      deleteFrom: (id) => values.delete(id),
      validateBeforeChange() {}
    }
    components.set(name, value)
    return value
  }
  const engine = {
    defineComponent: component,
    addEntity: () => {
      const id = nextEntity++
      entities.add(id)
      return id
    },
    addSystem: (system) => systems.push(system),
    *getEntitiesWith(...requested) {
      for (const id of entities)
        if (requested.every((item) => item.has(id))) yield [id, ...requested.map((item) => item.get(id))]
    }
  }
  const match = { round: 1, phase: 'live', roster: [] }
  const practice = {
    getPractice: () => match,
    canPlayRound: (address) =>
      match.roster.some(
        (seat) => seat.address === address && seat.connected && seat.team && seat.eligibleRound <= match.round
      ),
    playerPosition: (address) => {
      for (const [, identity, transform] of engine.getEntitiesWith(
        component('PlayerIdentityData'),
        component('Transform')
      ))
        if (identity.address.toLowerCase() === address) return transform.position
      return undefined
    },
    practiceTargets: () => [],
    practiceTargetsAt: () => [],
    rewindDisplacement: () => 0,
    acceptBotObservation: () => 'none',
    isBotAddress: (address) => address.startsWith('bot:'),
    botEntityByAddress: () => undefined,
    botPositionHistory: () => undefined,
    getRoundSeed: () => 1234,
    creditKill: (attacker) => server.recordPracticeStats(attacker.address, 1, 0),
    ...options.practice
  }
  const room = {
    onMessage: (type, callback) => {
      handlers.set(type, callback)
      options.room?.onMessage(type, callback)
    },
    send: (type, data, sendOptions) => {
      sent.push({ type, data: structuredClone(data), options: sendOptions })
      return options.room?.send(type, data, sendOptions)
    }
  }
  const modules = {
    '@dcl/sdk/ecs': {
      engine,
      Transform: component('Transform'),
      PlayerIdentityData: component('PlayerIdentityData'),
      AvatarBase: component('AvatarBase'),
      Schemas: new Proxy({}, { get: () => () => undefined })
    },
    '@dcl/sdk/math': {
      Vector3: {
        length: (p) => Math.hypot(p.x, p.y, p.z),
        distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
      }
    },
    '@dcl/sdk/network': { isServer: () => true, syncEntity() {} },
    '@dcl/sdk/network/message-bus-sync': { AUTH_SERVER_PEER_ID: 'authoritative-server' },
    './index': { room },
    './practice': practice,
    './systems': { giveWeapon() {}, storeActiveGun() {} },
    './bomb': { isBombBusy: options.isBombBusy ?? (() => false) },
    './falling': { resetPlayerFall() {} },
    './dropped-weapons': { dropDeadPlayer() {} }
  }
  const module = { exports: {} }
  runInNewContext(compiledServer(!!options.equipment), {
    module,
    require: (name) => {
      if (!(name in modules)) throw Error(`Unexpected dependency: ${name}`)
      return modules[name]
    },
    Date: { now: () => now * 1000 },
    console: { log: (...args) => logs.push(args.join(' ')) }
  })
  const server = module.exports
  server.setupServerMessageHandlers()
  if (options.inventory) server.initializeInventory()
  const addPlayer = (address, team, position) => {
    const id = engine.addEntity(),
      avatar = engine.addEntity()
    component('PlayerIdentityData').create(avatar, { address })
    component('Transform').create(avatar, { position, rotation: { x: 0, y: 0, z: 0, w: 1 } })
    server.playerEntities.set(address, id)
    server.matchStats.set(address, { kills: 0, deaths: 0, assists: 0, name: address })
    component('PlayerAddress').create(id, { address })
    component('PlayerTeam').create(id, { team })
    component('PlayerHealth').create(id, { current: 100, max: 100, armor: 0 })
    component('PlayerEquipment').create(id, { bombSelected: false, helmet: false })
    component('PlayerStats').create(id, { kills: 0, deaths: 0, assists: 0 })
    component('Weapon').create(id, {
      name: 'AK-47',
      revision: 1,
      mode: 0,
      zoom: 0,
      readyAt: 0,
      damage: 36,
      ammoClip: 30,
      maxAmmoClip: 30,
      ammoReserve: 90,
      fireRate: 0.0955,
      lastShotTime: 0,
      lastShotId: 0,
      isReloading: false,
      reloadTime: 2.45,
      reloadStartTime: 0
    })
    match.roster.push({ address, team, eligibleRound: 1, connected: true })
    return {
      id,
      avatar,
      move: (position) => {
        component('Transform').getMutable(avatar).position = { ...position }
      },
      health: () => component('PlayerHealth').get(id),
      weapon: () => component('Weapon').get(id)
    }
  }
  const message = (type, address, data) => handlers.get(type)?.(data, { from: address })
  const tick = (time) => {
    now = time
    for (const system of systems) system(1 / 60)
  }
  const echo = (address, time) => {
    now = time
    const probe = sent.findLast((event) => event.type === 'latencyProbe' && event.options.to.includes(address))
    if (probe) message('latencyEcho', address, probe.data)
  }
  const shoot = (address, overrides = {}) => {
    message('playerTrigger', address, { held: true, sequence: 1 })
    message('playerShoot', address, {
      shotId: 1,
      revision: 1,
      direction: { x: -1, y: 0, z: 0 },
      origin: { x: 95, y: 11.626, z: 52 },
      speed: 0,
      grounded: true,
      ...overrides
    })
  }
  return {
    server,
    component,
    match,
    sent,
    logs,
    addPlayer,
    message,
    tick,
    echo,
    shoot,
    at: (time) => {
      now = time
    }
  }
}
