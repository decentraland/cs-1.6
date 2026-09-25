import assert from 'node:assert/strict'
import { test } from 'node:test'
import { economyServer } from './helpers/economy-server.mjs'
import { sdkRooms, AUTH_SERVER } from './helpers/sdk-room.mjs'
import { touchUI, buttons, nodes } from './helpers/touch-ui.mjs'

function purchaseLoadout(p) {
  for (const item of [
    'weapon:m4a1',
    'ammo',
    'defusekit',
    'assaultsuit',
    'grenade:hegrenade',
    'grenade:flashbang',
    'grenade:flashbang',
    'grenade:smokegrenade',
    'weapon:deagle',
    'secondaryammo',
    'nightvision'
  ])
    p.buy(item)
}
const gun = (p, id) => p.inventory().items.find((item) => item.id === id)
const snapshot = (p) =>
  JSON.parse(
    JSON.stringify({ inventory: p.inventory(), health: p.health(), equipment: p.equipment(), money: p.money() })
  )

test('rebuy restores a saved loadout after death and a new round with real ECS inventory and weapon updates', () => {
  const f = economyServer(),
    p = f.add()
  p.buy('rebuy')
  assert.equal(p.notice(), 'No previous purchase to rebuy.')
  purchaseLoadout(p)
  assert.equal(p.money(), 8420)
  const saved = snapshot(p)
  f.state.round++
  p.respawn()
  p.buy('rebuy')
  assert.deepEqual(snapshot(p), saved)
  assert.equal(p.weapon().name, 'M4A1')
  assert.equal(p.weapon().ammoReserve, 90)
  assert.equal(f.drops.at(-1).gun.id, 'usp')
  assert.match(p.notice(), /Rebought 11 items for \$7580/)
  p.buy('rebuy')
  assert.equal(p.money(), 8420)
  assert.equal(p.notice(), 'You already have the saved equipment.')
})

test('rebuy spends scarce funds in the original priority order and retains the full plan for a later retry', () => {
  const f = economyServer(),
    p = f.add()
  purchaseLoadout(p)
  p.respawn(3480)
  p.buy('rebuy')
  assert.equal(p.money(), 0)
  assert.ok(gun(p, 'm4a1'))
  assert.equal(gun(p, 'm4a1').reserve, 90)
  assert.equal(p.equipment().defuseKit, true)
  assert.equal(p.health().armor, 0)
  assert.equal(gun(p, 'deagle'), undefined)
  assert.match(p.notice(), /Some items could not be bought/)
  f.api.PlayerMoney.getMutable(p.player).amount = 10000
  p.buy('rebuy')
  assert.equal(p.money(), 5900)
  assert.ok(gun(p, 'deagle'))
  assert.equal(p.equipment().nightVision, true)
})

test('rebuy keeps a carried rifle and worn armor, fills reserve only when lower than saved, and replaces the pistol', () => {
  const f = economyServer(),
    p = f.add()
  purchaseLoadout(p)
  p.respawn()
  p.inventory().items.push({ id: 'aug', clip: 8, reserve: 30 })
  p.inventory().active = 'aug'
  f.api.equipActiveWeapon(p.player)
  p.health().armor = 25
  p.equipment().helmet = true
  p.buy('rebuy')
  assert.equal(gun(p, 'm4a1'), undefined)
  assert.equal(gun(p, 'aug').clip, 8)
  assert.equal(gun(p, 'aug').reserve, 90)
  assert.equal(p.health().armor, 25)
  assert.equal(p.equipment().helmet, true)
  assert.ok(gun(p, 'deagle'))
  assert.equal(p.money(), 12580)
  p.health().armor = 0
  p.equipment().helmet = false
  p.buy('rebuy')
  assert.equal(p.health().armor, 100)
  assert.equal(p.money(), 11580)
})

test('rebuy snapshots current ammo at a buy command, fills beyond a partial saved amount, and does not reload clips', () => {
  const f = economyServer(),
    p = f.add()
  p.buy('weapon:m4a1')
  p.weapon().ammoClip = 5
  p.weapon().ammoReserve = 30
  p.buy('kevlar')
  p.weapon().ammoReserve = 10
  p.buy('rebuy')
  assert.equal(p.weapon().ammoReserve, 90)
  assert.equal(p.weapon().ammoClip, 5)
  p.weapon().ammoReserve = 40
  const funds = p.money()
  p.buy('rebuy')
  assert.equal(p.money(), funds)
  assert.equal(p.weapon().ammoReserve, 40)
})

test('single buys replace the saved snapshot, failed affordable checks still snapshot, and match reset clears it', () => {
  const f = economyServer(),
    p = f.add()
  p.buy('weapon:m4a1')
  p.inventory().items = p.inventory().items.filter((item) => item.id !== 'm4a1')
  p.inventory().active = 'usp'
  f.api.equipActiveWeapon(p.player)
  f.api.PlayerMoney.getMutable(p.player).amount = 0
  p.buy('weapon:awp')
  p.respawn()
  p.buy('rebuy')
  assert.equal(gun(p, 'm4a1'), undefined)
  assert.equal(gun(p, 'awp'), undefined)
  p.buy('weapon:aug')
  p.respawn()
  p.buy('rebuy')
  assert.ok(gun(p, 'aug'))
  f.api.resetEconomy()
  p.buy('rebuy')
  assert.equal(p.notice(), 'No previous purchase to rebuy.')
})

test('rebuy enforces life, eligibility, buy zone, time and team restrictions without losing the saved plan', () => {
  const f = economyServer(),
    p = f.add()
  purchaseLoadout(p)
  p.respawn()
  for (const [key, value] of [
    ['eligible', false],
    ['inZone', false],
    ['matchOver', true],
    ['phase', 'idle']
  ]) {
    const previous = f.state[key],
      before = snapshot(p)
    f.state[key] = value
    p.buy('rebuy')
    assert.deepEqual(snapshot(p), before, key)
    f.state[key] = previous
  }
  f.state.phase = 'live'
  f.state.elapsed = 91
  p.buy('rebuy')
  assert.equal(p.money(), 16000)
  f.state.elapsed = 0
  f.api.Dead.create(p.player, {})
  p.buy('rebuy')
  assert.equal(p.money(), 16000)
  f.api.Dead.deleteFrom(p.player)
  p.health().current = 0
  p.buy('rebuy')
  assert.equal(p.money(), 16000)
  p.health().current = 100
  f.api.PlayerTeam.getMutable(p.player).team = 1
  p.buy('rebuy')
  assert.equal(gun(p, 'm4a1'), undefined)
  assert.equal(p.equipment().defuseKit, false)
  assert.ok(gun(p, 'deagle'))
})

test('SDK Room rebuy commands use the authenticated player and reject duplicate or stale-round spending', async () => {
  const rooms = sdkRooms(),
    server = rooms.add(AUTH_SERVER),
    client = rooms.add('me'),
    stranger = rooms.add('stranger')
  const f = economyServer(server),
    p = f.add(),
    other = f.add('stranger')
  purchaseLoadout(p)
  p.respawn()
  const data = { item: 'rebuy', round: 1, sequence: 100 }
  client.send('buyEquipment', data)
  await rooms.deliverFrom('me')
  assert.equal(p.money(), 8420)
  const before = snapshot(p)
  p.weapon().ammoReserve = 0
  client.send('buyEquipment', data)
  client.send('buyEquipment', { ...data, round: 0, sequence: 101 })
  await rooms.deliverFrom('me')
  assert.equal(p.money(), before.money)
  assert.equal(p.weapon().ammoReserve, 0)
  stranger.send('buyEquipment', { ...data, sequence: 200 })
  await rooms.deliverFrom('stranger')
  assert.equal(other.money(), 16000)
  assert.equal(other.notice(), 'No previous purchase to rebuy.')
})

test('touch rebuy is a single completed tap and shows the desktop description', () => {
  const ui = touchUI()
  ui.state.buy = true
  const tree = () => ui.load('buy-ui.tsx').BuyHud({ width: 844, height: 390 })
  const row = buttons(tree()).find((node) => node.label === 'REBUY')
  assert.ok(row, 'REBUY is available in the root buy menu')
  row.props.onMouseDown()
  assert.equal(ui.calls.length, 0)
  assert.ok(nodes(tree()).some((node) => node.props.value === 'Restore the equipment from your last purchase.'))
  row.props.onMouseUp()
  assert.deepEqual(ui.calls, [['purchase', 'rebuy']])
})
