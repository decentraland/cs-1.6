import { buildSync } from 'esbuild'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import {
  InputAction,
  PointerEventType
} from '@dcl/ecs/dist-cjs/components/generated/pb/decentraland/sdk/components/common/input_action.gen.js'

export { InputAction }
const rules = new Set([
  './round-rules',
  './touch-actions',
  './touch-movement',
  './reload-input',
  './combat-rules',
  './weapon-profiles',
  './grenade-profiles',
  './grenade-client',
  './weapon-modes',
  './empty-fire',
  './knife-rules',
  './knife-feedback-rules',
  './movement-feedback'
])
const source = readFileSync('src/client.ts', 'utf8')
const output = buildSync({
  stdin: {
    contents: source + '\nexport { touchControlsSystem }',
    resolveDir: resolve('src'),
    sourcefile: 'client.ts',
    loader: 'ts'
  },
  bundle: true,
  format: 'cjs',
  platform: 'node',
  write: false,
  external: [...source.matchAll(/from ['\"]([^'\"]+)['\"]/g)]
    .map((match) => match[1])
    .filter((path) => !rules.has(path))
}).outputFiles[0].text

export function combatClient(options = {}) {
  const state = {
    now: 10,
    mobile: true,
    locked: true,
    buy: false,
    menu: false,
    busy: false,
    selectedBomb: false,
    defuse: 'none',
    synced: true,
    touchOptions: { open: false }
  }
  const effects = [],
    sounds = [],
    sent = [],
    systems = [],
    components = new Map(),
    held = new Set(),
    edges = new Set()
  const input = options.input ?? {
    isPressed: (action) => held.has(action),
    isTriggered: (action, event) => edges.has(`${action}:${event}`)
  }
  const entity = 512
  let nextEntity = 600
  const entities = new Set([entity])
  function component(name) {
    if (components.has(name)) return components.get(name)
    const values = new Map()
    const result = {
      has: (id) => values.has(id),
      get: (id) => values.get(id),
      getOrNull: (id) => values.get(id),
      getMutable: (id) => values.get(id),
      getMutableOrNull: (id) => values.get(id),
      create: (id, data) => {
        entities.add(id)
        values.set(id, structuredClone(data))
      },
      createOrReplace: (id, data) => {
        entities.add(id)
        values.set(id, structuredClone(data))
      },
      deleteFrom: (id) => values.delete(id)
    }
    components.set(name, result)
    return result
  }
  const match = { phase: 'live', round: 1, roster: [{ address: 'me', connected: true, team: 1, eligibleRound: 1 }] }
  const engine = {
    RootEntity: 0,
    PlayerEntity: 1,
    CameraEntity: 2,
    addEntity: () => nextEntity++,
    removeEntity: (id) => entities.delete(id),
    addSystem: (system) => systems.push(system),
    *getEntitiesWith(...requested) {
      for (const id of entities)
        if (requested.every((item) => item.has(id))) yield [id, ...requested.map((item) => item.get(id))]
    }
  }
  const weapon = {
    name: 'AK-47',
    revision: 1,
    mode: 0,
    zoom: 90,
    readyAt: 0,
    lastShotTime: 10,
    lastShotId: 0,
    lastFiredShotId: 0,
    fireRate: 0.0955,
    ammoClip: 20,
    maxAmmoClip: 30,
    ammoReserve: 90,
    isReloading: false,
    reloadTime: 2.45,
    reloadStartTime: 0
  }
  component('Weapon').create(entity, weapon)
  component('PlayerAddress').create(entity, { address: 'me' })
  component('PlayerTeam').create(entity, { team: 1 })
  component('PlayerHealth').create(entity, { current: 100 })
  component('PlayerPose').create(entity, { valid: options.readyToShoot ?? false })
  component('Transform').create(engine.PlayerEntity, { position: { x: 0, y: 0, z: 0 } })
  const modules = {
    '@dcl/sdk/ecs': new Proxy(
      {
        engine,
        InputAction,
        PointerEventType,
        inputSystem: input,
        TouchScreenControls: component('TouchScreenControls'),
        MeshRenderer: { setSphere() {} },
        Material: { setPbrMaterial() {} }
      },
      { get: (target, key) => (key in target ? target[key] : component(key)) }
    ),
    '@dcl/sdk/math': { Vector3: { create: (x, y, z) => ({ x, y, z }) } },
    '@dcl/sdk/network': { myProfile: { userId: 'me' }, isStateSyncronized: () => state.synced },
    '@dcl/sdk/network/message-bus-sync': { AUTH_SERVER_PEER_ID: 'authoritative-server' },
    './components': new Proxy({}, { get: (_, name) => component(name) }),
    './index': {
      room: {
        onMessage: (type, callback) => options.room?.onMessage(type, callback),
        send: (type, data, sendOptions) => {
          sent.push({ type, data: structuredClone(data) })
          return options.room?.send(type, data, sendOptions)
        }
      }
    },
    './practice': { getPractice: () => match, canPlayRound: () => match.roster[0].team > 0 },
    './weapon-view': {
      attachWeaponModel() {},
      predictWeaponShot: () => {
        effects.push('weapon')
      },
      predictKnifeAttack() {},
      predictGrenadeAnimation() {}
    },
    './bomb-client': {
      hasBombSelected: () => state.selectedBomb,
      isLocalBombBusy: () => state.busy,
      getLocalDefuseState: () => state.defuse
    },
    './buy-client': { isBuyMenuVisible: () => state.buy },
    './platform': { isTouchPlatform: () => state.mobile, hasAimControl: () => state.mobile || state.locked },
    './combat-input': options.controls ?? {
      fireInputAction: () => (state.mobile ? InputAction.IA_ACTION_6 : InputAction.IA_POINTER),
      isCombatInputPressed: input.isPressed,
      isCombatInputTriggered: input.isTriggered
    },
    './menu-state': {
      isTeamMenuOpen: () => state.menu,
      spectatorMenu: { update() {} },
      touchOptions: state.touchOptions
    },
    './spectator': { isSpectating: () => false },
    './fps-camera': {
      setCameraTrigger() {},
      rejectCameraKick() {},
      pendingCameraShots: () => 0,
      predictCameraKick: (...args) => {
        effects.push('recoil')
        return options.plan?.(...args)
      },
      getFpsAimDirection: () => options.aim ?? { x: 0, y: 0, z: 1 }
    },
    './bullet-impacts': {
      predictBulletImpacts() {},
      confirmBulletImpacts() {},
      rejectBulletImpacts() {},
      showBulletImpacts() {},
      updateBulletImpacts() {}
    },
    './weapon-sounds': {
      playLocalSound: (name, volume, pitch) => sounds.push({ name, volume, pitch, at: state.now }),
      playWorldSound: (name, position, volume, pitch) => sounds.push({ name, position, volume, pitch, at: state.now }),
      fireSound: () => 'ak47'
    },
    './ballistics': { groundedAt: () => true }
  }
  const module = { exports: {} }
  runInNewContext(output, {
    module,
    Date: { now: () => state.now * 1000 },
    console: { log() {} },
    require: (name) => options.modules?.[name] ?? modules[name] ?? {}
  })
  const client = module.exports
  client.setupClientMessageHandlers()
  for (const system of systems) system(0)
  if (options.touchContext) client.touchControlsSystem()
  return {
    state,
    match,
    sent,
    sounds,
    effects,
    systems,
    client,
    component,
    weapon: component('Weapon').get(entity),
    hold(action, down) {
      if (down !== held.has(action))
        edges.add(`${action}:${down ? PointerEventType.PET_DOWN : PointerEventType.PET_UP}`)
      if (down) held.add(action)
      else held.delete(action)
    },
    step(now) {
      state.now = now
      if (options.touchContext) client.touchControlsSystem()
      client.globalShootingSystem()
      edges.clear()
    }
  }
}
