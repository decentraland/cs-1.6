import { throwPlayerGun } from './dropped-weapons'
import { botAccounts, creditBot } from './bot-economy'
import { botAddress, isBotAddress } from './team-rules'
import { engine, Entity } from '@dcl/sdk/ecs'
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
import { captureRebuy, rebuyItems, RebuyLoadout } from './rebuy-rules'
import { autoBuyItems } from './autobuy-rules'
import type { BuyContext } from './economy-rules'
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
const rebuyLoadouts = new Map<string, RebuyLoadout>()

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
  rebuyLoadouts.clear()
  for (const [player] of engine.getEntitiesWith(PlayerAddress)) {
    PlayerMoney.createOrReplace(player, { amount: START_MONEY })
    PlayerHealth.getMutable(player).armor = 0
    PlayerEquipment.createOrReplace(player, {
      bombSelected: false,
      defuseKit: false,
      helmet: false,
      nightVision: false,
      nightVisionOn: false
    })
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
      money = PlayerMoney.get(player)
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
    const restriction = buyRestriction(buyContext)
    if (restriction) {
      room.send('matchNotice', { address, message: restriction })
      return
    }
    storeActiveGun(player)
    const readLoadout = () =>
      captureRebuy(PlayerInventory.get(player), {
        armor: PlayerHealth.get(player).armor,
        ...PlayerEquipment.get(player)
      })
    if (data.item === 'autobuy') {
      const balance = money.amount
      for (const item of autoBuyItems(() => readLoadout().primary?.id)) {
        purchaseItem(player, address, item, buyContext)
      }
      rebuyLoadouts.set(address, readLoadout())
      const spent = balance - PlayerMoney.get(player).amount
      room.send('matchNotice', {
        address,
        message:
          spent > 0
            ? `Auto-bought equipment for $${spent}.`
            : 'Nothing bought: equipment is full or funds are insufficient.'
      })
      return
    }
    if (data.item === 'rebuy') {
      const saved = rebuyLoadouts.get(address)
      if (!saved) {
        room.send('matchNotice', { address, message: 'No previous purchase to rebuy.' })
        return
      }
      const balance = money.amount
      let bought = 0
      let failed = 0
      for (const item of rebuyItems(saved, readLoadout)) {
        const result = purchaseItem(player, address, item, buyContext)
        if (result.error) failed++
        else bought++
      }
      const spent = balance - PlayerMoney.get(player).amount
      room.send('matchNotice', {
        address,
        message: bought
          ? `Rebought ${bought} item${bought === 1 ? '' : 's'} for $${spent}.${failed ? ' Some items could not be bought.' : ''}`
          : failed
            ? 'Cannot rebuy: insufficient funds or items unavailable.'
            : 'You already have the saved equipment.'
      })
      return
    }
    const result = purchaseItem(player, address, data.item, buyContext)
    // Buy commands snapshot the carried loadout, including failed purchases; rebuy never overwrites it.
    rebuyLoadouts.set(address, readLoadout())
    room.send('matchNotice', { address, message: result.error ?? result.message ?? 'Equipment purchased.' })
  })
}

function purchaseItem(
  player: Entity,
  address: string,
  item: string,
  buyContext: BuyContext
): { message?: string; error?: string } {
  const health = PlayerHealth.get(player),
    equipment = PlayerEquipment.get(player),
    money = PlayerMoney.get(player),
    weapon = Weapon.get(player),
    team = buyContext.team,
    feet = playerPosition(address)
  if (item.startsWith('weapon:') || item.startsWith('grenade:') || item === 'ammo' || item === 'secondaryammo') {
    storeActiveGun(player)
    const inventory = PlayerInventory.getMutable(player),
      previous = inventory.active
    const result: { money: number; error?: string; dropped?: StoredGun } = item.startsWith('weapon:')
      ? buyGun(inventory, item.slice(7), team, money.amount)
      : item.startsWith('grenade:')
        ? buyGrenade(inventory, item.slice(8), money.amount, equipment.bombSelected ? 'c4' : inventory.active)
        : buyGunAmmo(inventory, item === 'ammo' ? 'primary' : 'secondary', money.amount, true)
    if (result.error) {
      return { error: result.error }
    }
    if (result.dropped) throwPlayerGun(player, result.dropped)
    PlayerMoney.getMutable(player).amount = result.money
    if (result.dropped || inventory.active !== previous) equipActiveWeapon(player)
    else {
      const active = inventory.items.find((item) => item.id === inventory.active)
      if (active) Weapon.getMutable(player).ammoReserve = active.reserve
    }
    const gun = item.startsWith('weapon:') ? gunProfile(item.slice(7)) : undefined
    return {
      message: gun
        ? `Bought ${gun.name}.${inventory.active === gun.id ? '' : ` Press ${gun.slot === 'primary' ? '1' : '2'} to equip.`}`
        : item.startsWith('grenade:')
          ? 'Grenade purchased. Shift+3 to select.'
          : 'Ammunition purchased.'
    }
  }
  const account = {
    money: money.amount,
    armor: health.armor,
    helmet: equipment.helmet,
    defuseKit: equipment.defuseKit,
    nightVision: equipment.nightVision,
    reserve: weapon.ammoReserve
  }
  const error = purchaseEquipment(account, item, buyContext)
  if (error) {
    return { error }
  }
  PlayerMoney.getMutable(player).amount = account.money
  PlayerHealth.getMutable(player).armor = account.armor
  const bought = PlayerEquipment.getMutable(player)
  bought.helmet = account.helmet
  bought.defuseKit = account.defuseKit
  bought.nightVision = account.nightVision
  if (item === 'nightvision' && feet) room.send('playerVoice', { address, position: feet, clip: 'equip_nvg' })
  Weapon.getMutable(player).ammoReserve = account.reserve
  const names: Record<string, string> = {
    kevlar: 'Kevlar',
    assaultsuit: 'Kevlar and helmet',
    defusekit: 'Defusal kit',
    nightvision: 'Nightvision'
  }
  return { message: `${names[item] ?? 'Equipment'} purchased.` }
}
