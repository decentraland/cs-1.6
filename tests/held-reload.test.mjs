import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'
import { combatClient, InputAction } from './helpers/combat-client.mjs'
import { humanServer } from './helpers/human-server.mjs'

const load = compile('reload-input')
const { ReloadInput } = load('reload-input')
const { GUNS } = load('weapon-profiles')
const input = (now, extra = {}) => ({
  now,
  held: true,
  active: true,
  firing: false,
  blockedUntil: 0,
  round: 1,
  ...extra
})
const weapon = (id) => ({
  ...GUNS[id],
  name: GUNS[id].name,
  revision: 1,
  ammoClip: GUNS[id].clip - 1,
  maxAmmoClip: GUNS[id].clip,
  ammoReserve: GUNS[id].reserve,
  isReloading: false,
  lastShotTime: 10,
  lastShotId: 1,
  reloadStartTime: 0,
  readyAt: 0
})
const requests = (game) => game.sent.filter((event) => event.type === 'playerReload')

test('holding reload waits for each gun cooldown and caps retries while state is in flight', () => {
  for (const id of Object.keys(GUNS)) {
    const reload = new ReloadInput(),
      gun = weapon(id),
      ready = 10 + gun.fireRate
    assert.equal(reload.request(gun, input(ready - 0.001)), false, id)
    assert.equal(reload.request(gun, input(ready)), true, id)
    assert.equal(reload.request(gun, input(ready + 0.1)), false, id)
    assert.equal(reload.request(gun, input(ready + 0.25)), true, id)
    gun.isReloading = true
    assert.equal(reload.request(gun, input(ready + 0.5)), false, id)
  }
})

test('reload waits for draw, silencer and locally predicted burst deadlines and does not override fire', () => {
  const reload = new ReloadInput(),
    gun = weapon('famas')
  gun.readyAt = 11.5
  assert.equal(reload.request(gun, input(11)), false)
  assert.equal(reload.request(gun, input(11.5, { blockedUntil: 11.55 })), false)
  assert.equal(reload.request(gun, input(11.55, { firing: true })), false)
  assert.equal(reload.request(gun, input(11.56)), true)
})

test('releasing reload cancels a waiting request; menus and weapon changes do not inherit its retry timer', () => {
  const reload = new ReloadInput(),
    gun = weapon('ak47')
  assert.equal(reload.request(gun, input(10)), false)
  assert.equal(reload.request(gun, input(10.2, { held: false })), false)
  assert.equal(reload.request(gun, input(10.3, { active: false })), false)
  assert.equal(reload.request(gun, input(10.31)), true)
  gun.revision++
  assert.equal(reload.request(gun, input(10.32)), true)
  assert.equal(reload.request(gun, input(10.33, { round: 2 })), true)
  gun.ammoClip = gun.maxAmmoClip
  assert.equal(reload.request(gun, input(11)), false)
  gun.ammoClip--
  gun.ammoReserve = 0
  assert.equal(reload.request(gun, input(11)), false)
})

test('actual desktop and touch client input reloads when cooldown ends without another press', () => {
  for (const mobile of [true, false]) {
    const game = combatClient()
    game.state.mobile = mobile
    game.step(9.9)
    game.hold(InputAction.IA_SECONDARY, true)
    game.step(10)
    assert.equal(requests(game).length, 0)
    game.step(10.096)
    assert.deepEqual(requests(game), [{ type: 'playerReload', data: { round: 1, revision: 1 } }])
    game.step(10.1)
    assert.equal(requests(game).length, 1)
    game.hold(InputAction.IA_SECONDARY, false)
    game.step(10.5)
    assert.equal(requests(game).length, 1)
  }
})

test('actual client gates reload behind menus, firing, C4 and current match eligibility', () => {
  for (const blocked of ['menu', 'buy', 'busy', 'selectedBomb', 'firing', 'match-over', 'spectator']) {
    const game = combatClient()
    if (blocked === 'firing') game.hold(InputAction.IA_ACTION_6, true)
    else if (blocked === 'match-over') Object.assign(game.match, { phase: 'won', matchOver: true })
    else if (blocked === 'spectator') game.match.roster[0].team = 0
    else game.state[blocked] = true
    game.hold(InputAction.IA_SECONDARY, true)
    game.step(11)
    assert.equal(requests(game).length, 0, blocked)
  }
})

function server(options) {
  const game = humanServer(options),
    player = game.addPlayer('shooter', 1, { x: 95, y: 10.026, z: 52 })
  player.weapon().ammoClip = 20
  game.tick(11)
  return { game, player }
}

test('actual server rejects stale reload requests and requests while C4 or match state forbids them', () => {
  for (const invalid of ['round', 'revision', 'missing', 'bomb', 'objective', 'match-over', 'spectator', 'dead']) {
    const { game, player } = server({ isBombBusy: () => invalid === 'objective' }),
      payload = { round: 1, revision: 1 }
    if (invalid === 'round') payload.round = 0
    if (invalid === 'revision') payload.revision = 0
    if (invalid === 'bomb') game.component('PlayerEquipment').getMutable(player.id).bombSelected = true
    if (invalid === 'match-over') Object.assign(game.match, { phase: 'won', matchOver: true })
    if (invalid === 'spectator') game.match.roster[0].team = 0
    if (invalid === 'dead') game.component('Dead').create(player.id, { deathTime: 10 })
    game.message('playerReload', 'shooter', invalid === 'missing' ? {} : payload)
    assert.equal(player.weapon().isReloading, false, invalid)
  }
})

test('valid reload works during freeze, combat and results without duplicates restarting it', () => {
  for (const phase of ['freeze', 'live', 'won', 'lost', 'draw']) {
    const { game, player } = server()
    game.match.phase = phase
    game.message('playerReload', 'shooter', { round: 1, revision: 1 })
    assert.equal(player.weapon().isReloading, true)
    assert.equal(player.weapon().reloadStartTime, 11)
    game.tick(11.3)
    game.message('playerReload', 'shooter', { round: 1, revision: 1 })
    assert.equal(player.weapon().reloadStartTime, 11)
    assert.equal(player.weapon().ammoClip, 20)
    assert.equal(player.weapon().ammoReserve, 90)
  }
})
