import assert from 'node:assert/strict'
import { test } from 'node:test'
import { economyServer } from './helpers/economy-server.mjs'
import { sdkRooms, AUTH_SERVER } from './helpers/sdk-room.mjs'
import { touchUI, buttons, nodes } from './helpers/touch-ui.mjs'

const item = (p, id) => p.inventory().items.find((gun) => gun.id === id)
const carried = (p) =>
  JSON.parse(
    JSON.stringify({ inventory: p.inventory(), equipment: p.equipment(), armor: p.health().armor, money: p.money() })
  )

test('default auto-buy purchases one team rifle, reserve, kit and armor for the original total price', () => {
  for (const [team, id, balance, pistol, pistolReserve] of [
    [2, 'm4a1', 11345, 'usp', 100],
    [1, 'ak47', 12200, 'glock18', 120]
  ]) {
    const f = economyServer(),
      p = f.add('me', team)
    p.buy('autobuy')
    assert.equal(p.weapon().name, team === 2 ? 'M4A1' : 'AK-47')
    assert.equal(item(p, id).reserve, 90)
    assert.equal(item(p, id).clip, 30)
    assert.equal(item(p, pistol).reserve, pistolReserve)
    assert.equal(p.inventory().items.length, 2, 'default file buys no grenades or extra guns')
    assert.equal(p.money(), balance)
    assert.equal(p.health().armor, 100)
    assert.equal(p.equipment().helmet, true)
    assert.equal(p.equipment().defuseKit, team === 2)
    assert.equal(p.equipment().nightVision, false)
    assert.equal(f.drops.length, 0)
    assert.equal(p.notice(), `Auto-bought equipment for $${16000 - balance}.`)
    p.buy('autobuy')
    assert.equal(p.money(), balance, 'full equipment costs nothing on repeat')
    assert.match(p.notice(), /^Nothing bought/)
  }
})

test('auto-buy follows rifle fallback prices and buys only affordable ammo packs before equipment', () => {
  for (const [team, funds, id, reserve, balance] of [
    [2, 3250, 'm4a1', 60, 5],
    [2, 2250, 'famas', 0, 0],
    [2, 2249, 'mp5', 120, 294],
    [2, 1500, 'mp5', 0, 0],
    [1, 2600, 'ak47', 30, 0],
    [1, 2000, 'galil', 0, 0],
    [1, 1999, 'mp5', 120, 439]
  ]) {
    const f = economyServer(),
      p = f.add('me', team)
    p.respawn(funds)
    p.buy('autobuy')
    assert.ok(item(p, id), `${team}/${funds}: ${id}`)
    assert.equal(item(p, id).reserve, reserve, `${team}/${funds}: reserve`)
    assert.equal(p.money(), balance, `${team}/${funds}: balance`)
  }
})

test('pistol-round auto-buy keeps the pistol and honors ammo, CT kit and helmet-to-vest fallback order', () => {
  for (const [team, funds, balance, armor, helmet, kit] of [
    [1, 800, 90, 100, false, false],
    [2, 800, 425, 0, false, true],
    [2, 1025, 0, 100, false, true],
    [1, 1499, 439, 100, true, false]
  ]) {
    const f = economyServer(),
      p = f.add('me', team)
    p.respawn(funds)
    p.buy('autobuy')
    assert.equal(p.inventory().items.length, 1)
    assert.equal(p.inventory().items[0].id, team === 2 ? 'usp' : 'glock18')
    assert.equal(p.money(), balance)
    assert.equal(p.health().armor, armor)
    assert.equal(p.equipment().helmet, helmet)
    assert.equal(p.equipment().defuseKit, kit)
  }
})

test('auto-buy can replace a carried primary, but stops on an already-owned candidate even when its buy fails', () => {
  const f = economyServer(),
    p = f.add()
  p.buy('weapon:awp')
  p.weapon().ammoClip = 3
  p.buy('autobuy')
  assert.ok(item(p, 'm4a1'))
  assert.equal(item(p, 'awp'), undefined)
  assert.equal(f.drops.at(-1).gun.id, 'awp')
  assert.equal(f.drops.at(-1).gun.clip, 3)
  for (const [id, funds] of [
    ['p90', 2100],
    ['ak47', 2500]
  ]) {
    const game = economyServer(),
      player = game.add()
    player.inventory().items.push({ id, clip: 5, reserve: 20 })
    player.inventory().active = id
    game.api.equipActiveWeapon(player.player)
    game.api.PlayerMoney.getMutable(player.player).amount = funds
    player.buy('autobuy')
    assert.ok(item(player, id))
    assert.equal(item(player, id).clip, 5, 'does not reload a carried gun')
    assert.equal(game.drops.length, 0, 'does not continue to a cheaper primary')
    assert.equal(item(player, 'mp5'), undefined)
    assert.equal(item(player, 'famas'), undefined)
  }
})

test('auto-buy shares MP5/Glock ammo without charging twice and saves the final equipment for rebuy', () => {
  const f = economyServer(),
    p = f.add('me', 1)
  p.respawn(1999)
  p.buy('autobuy')
  assert.equal(p.money(), 439)
  assert.equal(item(p, 'mp5').reserve, 120)
  assert.equal(item(p, 'glock18').reserve, 120)
  f.state.round++
  p.respawn(1999)
  p.buy('rebuy')
  assert.equal(p.money(), 439)
  assert.equal(item(p, 'mp5').reserve, 120)
  assert.equal(item(p, 'glock18').reserve, 120)
})

test('auto-buy restores damaged armor, and neither invalid buy contexts nor a dead player can spend', () => {
  const f = economyServer(),
    p = f.add()
  p.buy('autobuy')
  p.health().armor = 25
  p.buy('autobuy')
  assert.equal(p.money(), 10695)
  assert.equal(p.health().armor, 100)
  p.respawn()
  for (const [key, value] of [
    ['eligible', false],
    ['inZone', false],
    ['matchOver', true],
    ['phase', 'idle']
  ]) {
    const before = carried(p),
      previous = f.state[key]
    f.state[key] = value
    p.buy('autobuy')
    assert.deepEqual(carried(p), before, key)
    f.state[key] = previous
  }
  f.state.phase = 'live'
  f.state.elapsed = 91
  p.buy('autobuy')
  assert.equal(p.money(), 16000)
  f.state.elapsed = 0
  f.api.Dead.create(p.player, {})
  p.buy('autobuy')
  assert.equal(p.money(), 16000)
})

test('SDK Room auto-buy authenticates the buyer and ignores stale-round and replayed requests', async () => {
  const rooms = sdkRooms(),
    server = rooms.add(AUTH_SERVER),
    client = rooms.add('me'),
    stranger = rooms.add('stranger')
  const f = economyServer(server),
    p = f.add()
  const data = { item: 'autobuy', round: 1, sequence: 10 }
  stranger.send('buyEquipment', data)
  await rooms.deliverFrom('stranger')
  assert.equal(p.money(), 16000)
  client.send('buyEquipment', data)
  await rooms.deliverFrom('me')
  assert.equal(p.money(), 11345)
  p.weapon().ammoReserve = 0
  client.send('buyEquipment', data)
  client.send('buyEquipment', { ...data, round: 0, sequence: 11 })
  await rooms.deliverFrom('me')
  assert.equal(p.money(), 11345)
  assert.equal(p.weapon().ammoReserve, 0)
})

test('mobile auto-buy sits beside classic categories and purchases on release', () => {
  const ui = touchUI()
  ui.state.buy = true
  const tree = () => ui.load('buy-ui.tsx').BuyHud({ width: 844, height: 390 })
  const rows = buttons(tree()).filter((node) => node.props.key && !['CLOSE', 'PURCHASE'].includes(node.props.key))
  assert.equal(rows[0].label, 'PISTOLS')
  const auto = rows.find((node) => node.label === 'AUTO BUY')
  const rebuy = rows.find((node) => node.label === 'REBUY')
  assert.ok(auto.props.uiTransform.position.left > rows[0].props.uiTransform.position.left)
  assert.ok(rebuy.props.uiTransform.position.top > auto.props.uiTransform.position.top)
  auto.props.onMouseDown()
  assert.equal(ui.calls.length, 0)
  assert.ok(nodes(tree()).some((node) => node.props.value === 'May replace your current primary weapon.'))
  auto.props.onMouseUp()
  assert.deepEqual(ui.calls, [['purchase', 'autobuy']])
})
