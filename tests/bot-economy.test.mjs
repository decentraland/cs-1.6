import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'

const load = compile('bot-economy', 'bot-combat')
const { botAccount, botAccounts, creditBot, buyBotRound, storeBotAmmo, botArmorHit } = load('bot-economy')
const { createBotCombat } = load('bot-combat')
const { GUNS, gunProfile } = load('weapon-profiles')
const { freshLossHistory, roundPayments, playerRoundPayment } = load('economy-rules')
const context = (team) => ({ team, alive: true, eligible: true, phase: 'freeze', elapsed: 0, inZone: true })
const fresh = (team) => {
  botAccounts.clear()
  return botAccount('bot:0', team)
}

test('bots start the pistol round with $800, paid armor/ammo and no free rifle', () => {
  for (const [team, gun, money, reserve] of [
    [1, 'glock18', 90, 120],
    [2, 'usp', 0, 96]
  ]) {
    const bot = fresh(team)
    assert.equal(bot.money, 800)
    assert.equal(bot.inventory.active, gun)
    buyBotRound(bot, 1, false, context(team))
    assert.equal(bot.inventory.active, gun)
    assert.equal(bot.inventory.items.length, 1)
    assert.equal(bot.armor, 100)
    assert.equal(bot.helmet, false)
    assert.equal(bot.money, money)
    assert.equal(bot.inventory.items[0].reserve, reserve)
    assert.equal(bot.inventory.items[0].clip, GUNS[gun].clip)
  }
})
test('loss/win income permits affordable upgrades and never creates free ammunition', () => {
  const bot = fresh(1)
  buyBotRound(bot, 1, false, context(1))
  const payment = roundPayments(freshLossHistory(), 'ct', 'none')
  creditBot('bot:0', playerRoundPayment(payment.t, 1, false, false))
  assert.equal(bot.money, 1490)
  buyBotRound(bot, 2, false, context(1))
  assert.equal(bot.inventory.active, 'glock18', 'cannot afford even MP5 plus one pack')
  creditBot('bot:0', 3250)
  buyBotRound(bot, 3, false, context(1))
  assert.equal(bot.inventory.active, 'ak47')
  assert.ok(bot.money >= 0)
  const rifle = bot.inventory.items.find((item) => item.id === 'ak47')
  assert.equal(rifle.clip, 30)
  assert.ok(rifle.reserve >= GUNS.ak47.ammoPack)
  assert.ok(rifle.reserve <= GUNS.ak47.reserve)
})
test('survivors retain magazines and armor, duplicate round setup does not buy twice, deaths lose gear', () => {
  const bot = fresh(2)
  creditBot('bot:0', 9000)
  buyBotRound(bot, 1, false, context(2))
  assert.equal(bot.inventory.active, 'm4a1')
  assert.equal(bot.helmet, true)
  assert.equal(bot.defuseKit, true)
  storeBotAmmo(bot, 'm4a1', 7, 18)
  bot.armor = 43
  bot.money = 0
  buyBotRound(bot, 2, true, context(2))
  assert.equal(bot.inventory.items.find((item) => item.id === 'm4a1').clip, 7)
  assert.equal(bot.inventory.items.find((item) => item.id === 'm4a1').reserve, 18)
  assert.equal(bot.armor, 43)
  const snapshot = JSON.stringify(bot)
  buyBotRound(bot, 2, false, context(2))
  assert.equal(JSON.stringify(bot), snapshot)
  buyBotRound(bot, 3, false, context(2))
  assert.equal(bot.inventory.active, 'usp')
  assert.equal(bot.armor, 0)
  assert.equal(bot.helmet, false)
  assert.equal(bot.defuseKit, false)
})
test('bot credits share the money cap and a surviving T gets no timeout reward', () => {
  const bot = fresh(1)
  creditBot('bot:0', 300)
  assert.equal(bot.money, 1100)
  creditBot('bot:0', playerRoundPayment(3400, 1, true, true))
  assert.equal(bot.money, 1100)
  creditBot('bot:0', 50000)
  assert.equal(bot.money, 16000)
})
test('bot buying respects the spawn buy zone and gun state starts with the actual stored ammunition', () => {
  const bot = fresh(1)
  buyBotRound(bot, 1, false, { ...context(1), inZone: false })
  assert.equal(bot.money, 800)
  assert.equal(bot.armor, 0)
  assert.equal(bot.inventory.items[0].reserve, 40)
  const combat = createBotCombat(10, 'glock18', { clip: 4, reserve: 7 })
  assert.equal(combat.weapon.ammoClip, 4)
  assert.equal(combat.weapon.ammoReserve, 7)
  assert.equal(combat.weapon.name, 'Glock-18')
  assert.equal(combat.weapon.fireRate, GUNS.glock18.fireRate)
})
test('bot Kevlar and helmets use the attacking gun armor ratio; legs and depleted armor remain vulnerable', () => {
  const bot = fresh(2)
  bot.armor = 100
  let hit = botArmorHit(bot, 19 * 1.25, 'stomach', GUNS.ak47.armorRatio, false)
  assert.equal(hit.damage, 18)
  assert.equal(hit.protectedByArmor, true)
  assert.ok(bot.armor < 100)
  hit = botArmorHit(bot, 100, 'head', GUNS.glock18.armorRatio, false)
  assert.equal(hit.damage, 100)
  assert.equal(hit.protectedByArmor, false)
  bot.helmet = true
  hit = botArmorHit(bot, 100, 'head', GUNS.glock18.armorRatio, false)
  assert.ok(hit.damage < 100)
  assert.equal(hit.protectedByArmor, true)
  assert.equal(botArmorHit(bot, 30, 'legs', GUNS.ak47.armorRatio, false).damage, 30)
  bot.armor = 1
  botArmorHit(bot, 100, 'body', GUNS.glock18.armorRatio, false)
  assert.equal(bot.armor, 0)
  assert.equal(bot.helmet, false)
})
test('replacing a surviving cheap primary drops its actual magazine without copying reserve ammo', () => {
  const bot = fresh(1)
  bot.money = 1700
  buyBotRound(bot, 1, false, context(1))
  assert.equal(bot.inventory.active, 'mp5')
  storeBotAmmo(bot, 'mp5', 9, 20)
  creditBot('bot:0', 5000)
  const drops = buyBotRound(bot, 2, true, context(1))
  assert.equal(bot.inventory.active, 'ak47')
  assert.deepEqual(
    drops.map((item) => [item.id, item.clip, item.reserve]),
    [['mp5', 9, 0]]
  )
  assert.ok(bot.inventory.items.every((item) => gunProfile(item.id)?.team !== 2))
})
