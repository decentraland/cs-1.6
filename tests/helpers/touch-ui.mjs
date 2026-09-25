import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { InputAction } from '@dcl/ecs/dist-cjs/components/generated/pb/decentraland/sdk/components/common/input_action.gen.js'

export { InputAction }
const external = [
  '@dcl/sdk/*',
  './client',
  './components',
  './buy-client',
  './bomb-client',
  './bomb',
  './practice',
  './menu-state',
  './platform',
  './spectator',
  './combat-input',
  './touch-movement',
  './nightvision-client'
]
const outputs = new Map()
export function touchUI(options = {}) {
  const state = {
    mobile: true,
    walking: false,
    armor: 0,
    helmet: false,
    nightVision: false,
    nightVisionOn: false,
    cursor: undefined,
    buy: false,
    teamMenu: false,
    canBuy: true,
    money: 16000,
    dead: false,
    observing: false,
    stale: false,
    selectedBomb: false,
    defuse: 'none',
    now: 10,
    insets: undefined,
    weapon: { name: 'AK-47', mode: 0, zoom: 90 },
    inventory: { items: [{ id: 'ak47' }, { id: 'usp' }, { id: 'flashbang', reserve: 1 }] },
    bomb: { phase: 'none', carrier: 'me' },
    match: { phase: 'live' }
  }
  const calls = []
  const call =
    (name) =>
    (...args) =>
      calls.push([name, ...args])
  const component = (read) => ({ getOrNull: read })
  const modules = {
    '@dcl/sdk/react-ecs': {
      default: {
        createElement: (kind, props, ...children) => {
          options.onElement?.(kind, props)
          const values = { ...props, children: children.flat(Infinity).filter(Boolean) }
          const node = typeof kind === 'function' ? kind(values) : { kind, props: values }
          if (kind.name === 'BitmapText' && node) node.props.value = values.value
          return node
        }
      },
      Label: 'Label',
      UiEntity: 'UiEntity',
      __esModule: true
    },
    '@dcl/sdk/math': {
      Color4: { create: (r, g, b, a) => ({ r, g, b, a }), White: () => ({ r: 1, g: 1, b: 1, a: 1 }) }
    },
    '@dcl/sdk/ecs': {
      engine: { RootEntity: 0 },
      InputAction,
      UiCanvasInformation: component(() => ({ screenInsetArea: state.insets }))
    },
    '@dcl/sdk/network': { myProfile: { userId: 'me' } },
    './client': {
      getLocalPlayerEntity: () => 1,
      isSyncStale: () => state.stale,
      requestWeaponAlternate: call('alternate')
    },
    './components': {
      Dead: { has: () => state.dead },
      PlayerHealth: component(() => ({ current: state.dead ? 0 : 100, armor: state.armor })),
      PlayerMoney: component(() => ({ amount: state.money })),
      PlayerEquipment: component(() => ({
        helmet: state.helmet,
        defuseKit: false,
        nightVision: state.nightVision,
        nightVisionOn: state.nightVisionOn
      })),
      Weapon: component(() => state.weapon),
      PlayerInventory: component(() => state.inventory),
      PlayerTeam: component(() => ({ team: 2 }))
    },
    './buy-client': {
      canOpenBuyMenu: () => state.canBuy,
      isBuyMenuVisible: () => state.buy,
      openBuyMenu: call('buy'),
      closeBuyMenu: call('closeBuy'),
      buyEquipment: call('purchase')
    },
    './bomb-client': {
      hasBombSelected: () => state.selectedBomb,
      getLocalDefuseState: () => state.defuse,
      selectCombatSlot: call('slot'),
      selectCombatBomb: call('bomb'),
      dropCombatWeapon: call('drop')
    },
    './bomb': { getBomb: () => state.bomb },
    './practice': { getPractice: () => state.match },
    './menu-state': {
      isTeamMenuOpen: () => state.teamMenu,
      getMenuCursor: () => state.cursor,
      spectatorMenu: {},
      touchOptions: { open: false },
      pointInRect: (x, y, r) => x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height
    },
    './platform': { isTouchPlatform: () => state.mobile },
    './combat-input': options.controls ?? { isTouchControlPressed: () => false, setTouchControlPressed: call('held') },
    './touch-movement': {
      isTouchWalking: () => state.walking,
      toggleTouchWalking: () => {
        state.walking = !state.walking
      }
    },
    './nightvision-client': options.nightVision ?? {
      nightVisionStatus: () => ({ available: state.nightVision && !state.dead, on: state.nightVisionOn }),
      nightVisionTint: () => ({ r: 50 / 255, g: 225 / 255, b: 50 / 255, a: 110 / 255 }),
      adjustNightVision: call('nightvisionAdjust'),
      toggleNightVision: call('nightvision')
    },
    './spectator': { isSpectating: () => state.observing, isDeathTransitioning: () => false }
  }
  const loaded = new Map()
  function load(name) {
    if (loaded.has(name)) return loaded.get(name)
    if (!outputs.has(name))
      outputs.set(
        name,
        buildSync({
          entryPoints: [`src/${name}`],
          bundle: true,
          format: 'cjs',
          platform: 'node',
          write: false,
          external
        }).outputFiles[0].text
      )
    const module = { exports: {} }
    runInNewContext(outputs.get(name), {
      module,
      Date: { now: () => state.now * 1000 },
      require: (name) => {
        if (!(name in modules)) throw Error('Unexpected UI dependency: ' + name)
        return modules[name]
      }
    })
    loaded.set(name, module.exports)
    return module.exports
  }
  const controls = load('touch-controls.tsx'),
    menu = load('touch-menu-ui.tsx'),
    frame = load('menu-ui.tsx')
  return {
    state,
    calls,
    load,
    menu,
    frame,
    actionButton: (label, actions) =>
      controls.TouchButton({
        label,
        icon: 'fire',
        actions,
        left: 0,
        top: 0,
        width: 64,
        height: 64
      }),
    openOptions: () => {
      modules['./menu-state'].touchOptions.open = true
    },
    controls: (width = 844, height = 390) =>
      controls.TouchControls({ width, height, scores: false, toggleScores: call('scores') })
  }
}

export function nodes(tree) {
  return tree ? [tree, ...(tree.props.children ?? []).flatMap(nodes)] : []
}
export function buttons(tree) {
  return nodes(tree)
    .filter((node) => node.props.uiInputBinding || node.props.onMouseDown)
    .map((node) => ({
      ...node,
      label: (
        nodes(node).find((child) => typeof child.props.value === 'string')?.props.value ?? node.props.key
      )?.replace(/^\d+ /, '')
    }))
}
