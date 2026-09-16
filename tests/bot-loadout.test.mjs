import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'

const load = compile('bot-loadout')
const { switchEmptyBotGun, botDeathGun } = load('bot-loadout')
const { createBotCombat, botShot } = load('bot-combat')
const { startingInventory } = load('inventory-rules')
const { GUNS } = load('weapon-profiles')
const account = (primary = 'ak47', team = 1) => ({
  team,
  money: 90,
  armor: 70,
  helmet: false,
  defuseKit: false,
  inventory: startingInventory(team, primary),
  boughtRound: 2
})
const emptyGun = (gun = 'ak47') => {
  const combat = createBotCombat(0, gun, { clip: 0, reserve: 0 })
  combat.visible = true
  combat.weapon.lastShotTime = 10
  return combat
}
const shotOptions = (now) => ({
  feet: { x: 95, y: 10.026, z: 52 },
  target: { x: 88, y: 11.076, z: 52 },
  targets: [],
  speed: 0,
  now,
  alive: true,
  difficulty: 'expert',
  random: () => 0.5
})

test('an exhausted bot draws its carried pistol after the final rifle shot and waits for deployment', () => {
  for (const [primary, team, pistol] of [
    ['ak47', 1, 'glock18'],
    ['m4a1', 2, 'usp']
  ]) {
    const bot = account(primary, team)
    const original = emptyGun(primary)
    const end = 10 + GUNS[primary].fireRate
    assert.equal(switchEmptyBotGun(bot, original, end - 0.001), original)
    const selected = switchEmptyBotGun(bot, original, end)
    assert.equal(selected.gun, pistol)
    assert.equal(bot.inventory.active, pistol)
    assert.equal(selected.weapon.name, GUNS[pistol].name)
    assert.equal(selected.weapon.ammoClip, GUNS[pistol].clip)
    assert.equal(selected.weapon.ammoReserve, GUNS[pistol].clip * 2)
    assert.equal(bot.money, 90)
    assert.equal(bot.armor, 70)
    assert.equal(bot.inventory.items.find((item) => item.id === primary).clip, 0)
    assert.equal(bot.inventory.items.find((item) => item.id === primary).reserve, 0)
    assert.equal(botShot(selected, shotOptions(end + GUNS[pistol].drawTime - 0.001)), undefined)
    assert.ok(botShot(selected, shotOptions(end + GUNS[pistol].drawTime)))
    assert.equal(selected.weapon.ammoClip, GUNS[pistol].clip - 1)
  }
})

test('bots retain a usable primary and reload a dry magazine when reserve ammo remains', () => {
  const bot = account()
  const combat = emptyGun()
  combat.weapon.ammoClip = 1
  assert.equal(switchEmptyBotGun(bot, combat, 11), combat)
  combat.weapon.ammoClip = 0
  combat.weapon.ammoReserve = 2
  assert.equal(switchEmptyBotGun(bot, combat, 11), combat)
  botShot(combat, shotOptions(11))
  assert.equal(combat.weapon.isReloading, true)
  assert.equal(switchEmptyBotGun(bot, combat, 12), combat)
  botShot(combat, { ...shotOptions(11 + GUNS.ak47.reloadTime), target: undefined })
  assert.equal(combat.weapon.ammoClip, 2)
  assert.equal(combat.weapon.ammoReserve, 0)
})

test('MP5 exhaustion empties the shared reserve but preserves the Glock magazine', () => {
  const bot = account('mp5')
  const glock = bot.inventory.items.find((item) => item.id === 'glock18')
  glock.clip = 4
  const selected = switchEmptyBotGun(bot, emptyGun('mp5'), 11)
  assert.equal(selected.gun, 'glock18')
  assert.equal(selected.weapon.ammoClip, 4)
  assert.equal(selected.weapon.ammoReserve, 0)
  assert.ok(bot.inventory.items.every((item) => item.reserve === 0))
})

test('an empty pistol with reserve ammo cannot reload during its draw and uses its own reload duration', () => {
  const bot = account()
  const glock = bot.inventory.items.find((item) => item.id === 'glock18')
  glock.clip = 0
  glock.reserve = 7
  const selected = switchEmptyBotGun(bot, emptyGun(), 11)
  const ready = 11 + GUNS.glock18.drawTime
  botShot(selected, shotOptions(ready - 0.001))
  assert.equal(selected.weapon.isReloading, false)
  botShot(selected, shotOptions(ready))
  assert.equal(selected.weapon.isReloading, true)
  assert.equal(botShot(selected, shotOptions(ready + GUNS.glock18.reloadTime - 0.001)), undefined)
  assert.ok(botShot(selected, shotOptions(ready + GUNS.glock18.reloadTime)))
  assert.equal(selected.weapon.ammoClip, 6)
  assert.equal(selected.weapon.ammoReserve, 0)
})

test('bots with no usable carried gun do not manufacture ammunition or cycle empty weapons', () => {
  const bot = account()
  for (const item of bot.inventory.items) {
    item.clip = 0
    item.reserve = 0
  }
  const combat = emptyGun()
  assert.equal(switchEmptyBotGun(bot, combat, 11), combat)
  assert.equal(switchEmptyBotGun(bot, combat, 20), combat)
  assert.equal(botShot(combat, shotOptions(20)), undefined)
  assert.equal(bot.inventory.active, 'ak47')
})

test('death after switching still drops the carried primary and clears the dead inventory', () => {
  const bot = account()
  const pistol = switchEmptyBotGun(bot, emptyGun(), 11)
  pistol.weapon.ammoClip = 3
  const dropped = botDeathGun(bot, pistol)
  assert.equal(dropped.id, 'ak47')
  assert.equal(dropped.clip, 0)
  assert.equal(dropped.reserve, 0)
  assert.equal(bot.inventory.items.length, 0)
  assert.equal(botDeathGun(bot, pistol), undefined, 'duplicate death cannot drop again')
  const pistolOnly = { ...account(), inventory: startingInventory(1) }
  const used = createBotCombat(0, 'glock18', { clip: 5, reserve: 12 })
  assert.deepEqual(botDeathGun(pistolOnly, used), { id: 'glock18', clip: 5, reserve: 12 })
})
