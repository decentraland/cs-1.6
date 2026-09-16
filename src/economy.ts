import { throwPlayerGun } from './dropped-weapons'
import { botAccounts, creditBot } from './bot-economy'
import { botAddress, isBotAddress } from './team-rules'
import { engine } from '@dcl/sdk/ecs'
import {
  Dead,
  PlayerAddress,
  PlayerEquipment,
  PlayerHealth,
  PlayerMoney,
  PlayerTeam,
  PlayerInventory,
  Weapon,
  Bot
} from './components'
import { playerEntities } from './server'
import { canPlayRound, getPractice, playerPosition, roundElapsed } from './practice'
import type { StoredGun } from './inventory-rules'
import { buyGun, buyGunAmmo } from './inventory-rules'
import { buyGrenade } from './grenade-rules'
import { gunProfile } from './weapon-profiles'
import { storeActiveGun } from './systems'
import { equipActiveWeapon } from './inventory'
import { room } from './index'
import { inBuyZone } from './buy-zones'
import {
  buyRestriction,
  creditedMoney,
  freshLossHistory,
  purchaseEquipment,
  roundPayments,
  START_MONEY,
  PurchaseSequences,
  playerRoundPayment
} from './economy-rules'

let losses = freshLossHistory()
const pending = new Map<string, number>()
const purchases = new PurchaseSequences()

export function creditPlayer(address: string, amount: number) {
  if (isBotAddress(address)) {
    creditBot(address, amount)
    return
  }
  const player = playerEntities.get(address)
  if (player === undefined) return
  const money = PlayerMoney.getMutable(player)
  money.amount = creditedMoney(money.amount, amount)
}
export function resetEconomy() {
  botAccounts.clear()
  losses = freshLossHistory()
  pending.clear()
  purchases.clear()
  for (const [player] of engine.getEntitiesWith(PlayerAddress)) {
    PlayerMoney.createOrReplace(player, { amount: START_MONEY })
    PlayerHealth.getMutable(player).armor = 0
    PlayerEquipment.createOrReplace(player, { bombSelected: false, defuseKit: false, helmet: false })
  }
}
export function settleRoundEconomy(winner: 'ct' | 't' | 'draw', bombPhase: string, timeout: boolean) {
  const match = getPractice()
  if (!match) return
  const amounts = roundPayments(losses, winner, bombPhase)
  const bots = new Map(Array.from(engine.getEntitiesWith(Bot)).map(([, bot]) => [botAddress(bot.index), bot]))
  for (const seat of match.roster) {
    if (!seat.connected || (seat.team !== 1 && seat.team !== 2) || seat.eligibleRound > match.round) continue
    const player = playerEntities.get(seat.address)
    const bot = bots.get(seat.address)
    if (bot) {
      pending.set(
        seat.address,
        playerRoundPayment(seat.team === 1 ? amounts.t : amounts.ct, seat.team, bot.alive, timeout)
      )
      continue
    }
    if (player === undefined) continue
    pending.set(
      seat.address,
      playerRoundPayment(seat.team === 1 ? amounts.t : amounts.ct, seat.team, !Dead.has(player), timeout)
    )
  }
}
export function payRoundReward(address: string) {
  creditPlayer(address, pending.get(address) ?? 0)
  pending.delete(address)
}
export function discardRoundReward(address: string) {
  pending.delete(address)
}
export function initializeEconomy() {
  room.onMessage('buyEquipment', (data, context) => {
    if (!context) return
    const address = context.from.toLowerCase(),
      player = playerEntities.get(address),
      match = getPractice()
    if (player === undefined || !match || data.round !== match.round) return
    if (!purchases.accept(address, data.sequence)) return
    const health = PlayerHealth.get(player),
      equipment = PlayerEquipment.get(player),
      money = PlayerMoney.get(player),
      weapon = Weapon.get(player)
    const team = PlayerTeam.get(player).team,
      feet = playerPosition(address)
    const buyContext = {
      alive: !Dead.has(player) && health.current > 0,
      eligible: canPlayRound(address),
      team,
      phase: match.phase,
      matchOver: match.matchOver,
      elapsed: roundElapsed(),
      inZone: !!feet && inBuyZone(feet, team)
    }
    if (
      data.item.startsWith('weapon:') ||
      data.item.startsWith('grenade:') ||
      data.item === 'ammo' ||
      data.item === 'secondaryammo'
    ) {
      const restriction = buyRestriction(buyContext)
      if (restriction) {
        room.send('matchNotice', { address, message: restriction })
        return
      }
      storeActiveGun(player)
      const inventory = PlayerInventory.getMutable(player),
        previous = inventory.active
      const result: { money: number; error?: string; dropped?: StoredGun } = data.item.startsWith('weapon:')
        ? buyGun(inventory, data.item.slice(7), team, money.amount)
        : data.item.startsWith('grenade:')
          ? buyGrenade(inventory, data.item.slice(8), money.amount, equipment.bombSelected ? 'c4' : inventory.active)
          : buyGunAmmo(inventory, data.item === 'ammo' ? 'primary' : 'secondary', money.amount)
      if (result.error) {
        room.send('matchNotice', { address, message: result.error })
        return
      }
      if (result.dropped) throwPlayerGun(player, result.dropped)
      PlayerMoney.getMutable(player).amount = result.money
      if (result.dropped || inventory.active !== previous) equipActiveWeapon(player)
      else {
        const active = inventory.items.find((item) => item.id === inventory.active)
        if (active) Weapon.getMutable(player).ammoReserve = active.reserve
      }
      const gun = data.item.startsWith('weapon:') ? gunProfile(data.item.slice(7)) : undefined
      room.send('matchNotice', {
        address,
        message: gun
          ? `Bought ${gun.name}.${inventory.active === gun.id ? '' : ` Press ${gun.slot === 'primary' ? '1' : '2'} to equip.`}`
          : data.item.startsWith('grenade:')
            ? 'Grenade purchased. Shift+3 to select.'
            : 'Ammunition purchased.'
      })
      return
    }
    const account = {
      money: money.amount,
      armor: health.armor,
      helmet: equipment.helmet,
      defuseKit: equipment.defuseKit,
      reserve: weapon.ammoReserve
    }
    const error = purchaseEquipment(account, data.item, buyContext)
    if (error) {
      room.send('matchNotice', { address, message: error })
      return
    }
    PlayerMoney.getMutable(player).amount = account.money
    PlayerHealth.getMutable(player).armor = account.armor
    const bought = PlayerEquipment.getMutable(player)
    bought.helmet = account.helmet
    bought.defuseKit = account.defuseKit
    Weapon.getMutable(player).ammoReserve = account.reserve
    const names: Record<string, string> = {
      kevlar: 'Kevlar',
      assaultsuit: 'Kevlar and helmet',
      defusekit: 'Defusal kit'
    }
    room.send('matchNotice', { address, message: `${names[data.item] ?? 'Equipment'} purchased.` })
  })
}
