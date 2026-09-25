import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { compile } from './compile.mjs'
import { touchUI, buttons, nodes } from './helpers/touch-ui.mjs'
const { purchaseEquipment } = compile('economy-rules')('economy-rules')
const context = { alive: true, eligible: true, team: 1, phase: 'live', elapsed: 10, inZone: true }
const account = () => ({ money: 16000, armor: 0, helmet: false, defuseKit: false, reserve: 0, nightVision: false })

test('both teams buy nightvision once for $1250, respecting money and normal buy restrictions', () => {
  for (const team of [1, 2]) {
    const a = account()
    assert.equal(purchaseEquipment(a, 'nightvision', { ...context, team }), undefined)
    assert.equal(a.money, 14750)
    assert.equal(a.nightVision, true)
    assert.ok(purchaseEquipment(a, 'nightvision', { ...context, team }))
    assert.equal(a.money, 14750)
  }
  for (const change of [
    { alive: false },
    { eligible: false },
    { inZone: false },
    { elapsed: 91 },
    { matchOver: true },
    { team: 0 }
  ]) {
    const a = account()
    assert.ok(purchaseEquipment(a, 'nightvision', { ...context, ...change }))
    assert.equal(a.money, 16000)
    assert.equal(a.nightVision, false)
  }
  const a = { ...account(), money: 1249 }
  assert.ok(purchaseEquipment(a, 'nightvision', context))
  assert.equal(a.money, 1249)
})

function runtime(name) {
  const output = buildSync({
    entryPoints: [`src/${name}.ts`],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    external: [
      '@dcl/sdk/*',
      './components',
      './server',
      './practice',
      './index',
      './client',
      './buy-client',
      './menu-state'
    ]
  }).outputFiles[0].text
  const state = {
    now: 10,
    dead: false,
    stale: false,
    menu: false,
    eligible: true,
    equipment: { nightVision: true, nightVisionOn: false },
    health: { current: 100 },
    match: {
      round: 1,
      phase: 'live',
      matchOver: false,
      roster: [{ address: 'me', team: 1, connected: true, eligibleRound: 1 }]
    }
  }
  const systems = [],
    sent = [],
    handlers = {},
    lights = new Map(),
    transforms = new Map([[1, { position: { x: 10, y: 2, z: 20 } }]])
  let next = 512
  const component = (values) => ({
    getOrNull: (id) => values.get(id),
    getMutable: (id) => values.get(id),
    create: (id, v) => values.set(id, structuredClone(v))
  })
  const entities = new Map([['me', 12]])
  const modules = {
    '@dcl/sdk/ecs': {
      engine: {
        PlayerEntity: 1,
        addSystem: (fn) => systems.push(fn),
        addEntity: () => next++,
        removeEntity: (id) => {
          lights.delete(id)
          transforms.delete(id)
        }
      },
      LightSource: component(lights),
      Transform: component(transforms)
    },
    '@dcl/sdk/network': { myProfile: { userId: 'me' } },
    './components': {
      Dead: { has: () => state.dead },
      PlayerHealth: { getOrNull: () => state.health },
      PlayerEquipment: { getOrNull: () => state.equipment, getMutable: () => state.equipment }
    },
    './server': { playerEntities: entities },
    './practice': {
      getPractice: () => state.match,
      canPlayRound: () => state.eligible,
      playerPosition: () => ({ x: 10, y: 2, z: 20 })
    },
    './index': {
      room: { onMessage: (name, fn) => (handlers[name] = fn), send: (name, data) => sent.push({ name, data }) }
    },
    './client': { getLocalPlayerEntity: () => 12, isSyncStale: () => state.stale },
    './buy-client': { isBuyMenuVisible: () => state.menu },
    './menu-state': { isTeamMenuOpen: () => false }
  }
  const module = { exports: {} }
  runInNewContext(output, {
    module,
    Date: { now: () => state.now * 1000 },
    require: (name) => {
      assert.ok(modules[name], name)
      return modules[name]
    }
  })
  return {
    api: module.exports,
    state,
    handlers,
    sent,
    lights,
    transforms,
    entities,
    step: () => systems.forEach((fn) => fn())
  }
}

test('authoritative nightvision toggles enforce ownership, life, round, sequence and 300 ms cooldown', () => {
  const f = runtime('nightvision')
  f.api.initializeNightVision()
  let sequence = 0
  const toggle = (enabled, extra = {}, from = 'ME') =>
    f.handlers.nightVisionToggle({ enabled, round: 1, sequence: ++sequence, ...extra }, { from })
  toggle(true)
  assert.equal(f.state.equipment.nightVisionOn, true)
  assert.equal(f.sent.at(-1).data.clip, 'nvg_on')
  toggle(false)
  assert.equal(f.state.equipment.nightVisionOn, true)
  f.state.now += 0.301
  toggle(false)
  assert.equal(f.state.equipment.nightVisionOn, false)
  f.state.now += 1
  for (const extra of [{ round: 0 }, { sequence: 1 }, { sequence: Infinity }]) {
    toggle(true, extra)
    assert.equal(f.state.equipment.nightVisionOn, false)
  }
  toggle(true, {}, 'stranger')
  assert.equal(f.state.equipment.nightVisionOn, false)
  for (const name of ['dead', 'ineligible', 'unowned', 'matchOver']) {
    f.state.dead = name === 'dead'
    f.state.eligible = name !== 'ineligible'
    f.state.equipment.nightVision = name !== 'unowned'
    f.state.match.matchOver = name === 'matchOver'
    toggle(true)
    assert.equal(f.state.equipment.nightVisionOn, false, name)
  }
})

test('death or leaving the playing roster clears an active authoritative nightvision effect', () => {
  for (const change of ['death', 'health', 'eligibility', 'matchEnd']) {
    const f = runtime('nightvision')
    f.api.initializeNightVision()
    f.state.equipment.nightVisionOn = true
    if (change === 'death') f.state.dead = true
    if (change === 'health') f.state.health.current = 0
    if (change === 'eligibility') f.state.eligible = false
    if (change === 'matchEnd') f.state.match.matchOver = true
    f.step()
    assert.equal(f.state.equipment.nightVisionOn, false, change)
  }
})

test('nightvision uses one local green light following the player and removes it on death or stale sync', () => {
  const f = runtime('nightvision-client')
  f.api.initializeNightVisionView()
  f.step()
  assert.equal(f.lights.size, 0)
  f.state.equipment.nightVisionOn = true
  f.step()
  assert.equal(f.lights.size, 1)
  const id = [...f.lights.keys()][0],
    light = f.lights.get(id)
  assert.equal(light.color.g, 1)
  assert.ok(light.range >= 18.75 && light.range <= 20)
  f.transforms.get(1).position.x = 30
  f.step()
  assert.equal(f.lights.size, 1)
  assert.equal(f.transforms.get(id).position.x, 30)
  f.state.dead = true
  f.step()
  assert.equal(f.lights.size, 0)
  f.state.dead = false
  f.step()
  assert.equal(f.lights.size, 1)
  f.state.stale = true
  f.step()
  assert.equal(f.lights.size, 0)
})

test('client toggle requests obey ownership, menus and cooldown without modifying synced equipment', () => {
  const f = runtime('nightvision-client')
  f.api.toggleNightVision()
  assert.equal(f.sent.length, 1)
  assert.equal(f.sent[0].data.enabled, true)
  assert.equal(f.state.equipment.nightVisionOn, false)
  f.api.toggleNightVision()
  assert.equal(f.sent.length, 1)
  f.state.now += 1
  f.state.menu = true
  f.api.toggleNightVision()
  assert.equal(f.sent.length, 1)
  f.state.menu = false
  f.state.equipment.nightVision = false
  f.api.toggleNightVision()
  assert.equal(f.sent.length, 1)
})

test('brightness controls change the rendered tint locally and retain it through toggles and respawn', () => {
  const f = runtime('nightvision-client')
  const ui = touchUI({ nightVision: f.api })
  f.state.equipment.nightVisionOn = true
  ui.openOptions()
  const view = ui.load('nightvision-ui.tsx')
  const alpha = () => view.NightVisionOverlay({ width: 844, height: 390 }).props.uiBackground.color.a * 255
  const click = (name) => {
    const button = buttons(ui.controls()).find((button) => button.label === name)
    assert.ok(button, name)
    assert.equal(button.props.uiInputBinding, undefined, 'brightness never binds a combat action')
    button.props.onMouseDown()
  }
  assert.equal(alpha(), 110)
  click('NIGHTVISION UP')
  assert.equal(alpha(), 130)
  click('NIGHTVISION DOWN')
  assert.equal(alpha(), 110)
  for (let i = 0; i < 20; i++) click('NIGHTVISION UP')
  assert.equal(alpha(), 220)
  f.state.equipment.nightVisionOn = false
  assert.ok(!buttons(ui.controls()).some((button) => button.label === 'NIGHTVISION UP'))
  f.state.dead = true
  f.state.equipment.nightVision = false
  f.state.equipment.nightVision = true
  f.state.dead = false
  f.state.equipment.nightVisionOn = true
  assert.equal(alpha(), 220, 'the client preference survives a new life')
  for (let i = 0; i < 20; i++) click('NIGHTVISION DOWN')
  assert.equal(alpha(), 30)
  assert.equal(f.sent.length, 0, 'brightness does not send toggles or weapon messages')
  assert.deepEqual(f.state.equipment, { nightVision: true, nightVisionOn: true })
  ui.state.mobile = false
  const desktop = view.NightVisionButton({ width: 1280 })
  const up = buttons(desktop).find((button) => button.label === 'NIGHTVISION UP')
  assert.ok(up)
  up.props.onMouseDown()
  assert.equal(alpha(), 50)
  assert.ok(
    nodes(desktop).every((node) => node.kind !== 'Label'),
    'adjustments use icons'
  )
})

test('nightvision adjustment cannot act through an open menu, death or loss of ownership', () => {
  const f = runtime('nightvision-client')
  f.state.equipment.nightVisionOn = true
  for (const change of ['menu', 'dead', 'stale', 'unowned', 'off']) {
    f.state.menu = change === 'menu'
    f.state.dead = change === 'dead'
    f.state.stale = change === 'stale'
    f.state.equipment.nightVision = change !== 'unowned'
    f.state.equipment.nightVisionOn = change !== 'off'
    f.api.adjustNightVision(1)
    assert.equal(f.api.nightVisionTint().a * 255, 110, change)
  }
})

test('equipment menu buys nightvision and owned goggles expose a separate icon without any fire binding', () => {
  const ui = touchUI(),
    buy = ui.load('buy-ui.tsx')
  ui.state.buy = true
  const render = () => buy.BuyHud({ width: 1280, height: 720 })
  const tap = (name) => {
    const b = buttons(render()).find((x) => x.label === name)
    b.props.onMouseDown()
    b.props.onMouseUp()
  }
  tap('EQUIPMENT')
  tap('NIGHTVISION')
  assert.deepEqual(ui.calls, [['purchase', 'nightvision']])
  ui.state.nightVision = true
  tap('NIGHTVISION')
  assert.equal(ui.calls.length, 1)
  ui.state.buy = false
  ui.openOptions()
  const goggles = buttons(ui.controls()).find((x) => x.label === 'NIGHTVISION')
  assert.ok(goggles)
  assert.equal(goggles.props.uiInputBinding.actions.length, 0)
  goggles.props.onMouseDown()
  assert.deepEqual(ui.calls.at(-1), ['nightvision'])
  ui.state.dead = true
  assert.ok(!buttons(ui.controls()).some((x) => x.label === 'NIGHTVISION'))
})

test('desktop armor details quote the actual $350 helmet upgrade and $650 vest replacement', () => {
  const lines = []
  const ui = touchUI({
    onElement: (kind, props) => {
      if (kind === 'Label') lines.push(props.value)
    }
  })
  const buy = ui.load('buy-ui.tsx')
  ui.state.buy = true
  const render = () => buy.BuyHud({ width: 1280, height: 720 })
  const equipment = buttons(render()).find((x) => x.label === 'EQUIPMENT')
  equipment.props.onMouseDown()
  equipment.props.onMouseUp()
  ui.state.mobile = false
  const layout = ui.frame.menuLayout(1280, 720)
  ui.state.cursor = { x: layout.x(80), y: layout.y(146) }
  for (const [armor, helmet, price] of [
    [100, false, 350],
    [50, true, 650],
    [0, false, 1000]
  ]) {
    ui.state.armor = armor
    ui.state.helmet = helmet
    lines.length = 0
    render()
    assert.ok(lines.includes(`Price: $${price}`), lines.join(';'))
  }
})
