import { engine } from '@dcl/sdk/ecs'
import {
  Dead,
  PlayerAddress,
  PlayerEquipment,
  PlayerHealth,
  PlayerMoney,
  PlayerTeam,
  PlayerInventory,
  Weapon
} from './components'
import { playerEntities } from './server'
import { canPlayRound, getPractice, playerPosition, roundElapsed } from './practice'
import { buyGun, buyGunAmmo } from './inventory-rules'
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
  const player = playerEntities.get(address)
  if (player === undefined) return
  const money = PlayerMoney.getMutable(player)
  money.amount = creditedMoney(money.amount, amount)
}
export function resetEconomy() {
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
  for (const seat of match.roster) {
    if (!seat.connected || (seat.team !== 1 && seat.team !== 2) || seat.eligibleRound > match.round) continue
    const player = playerEntities.get(seat.address)
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
      elapsed: roundElapsed(),
      inZone: !!feet && inBuyZone(feet, team)
    }
    if (data.item.startsWith('weapon:') || data.item === 'ammo' || data.item === 'secondaryammo') {
      const restriction = buyRestriction(buyContext)
      if (restriction) {
        room.send('matchNotice', { address, message: restriction })
        return
      }
      storeActiveGun(player)
      const inventory = PlayerInventory.getMutable(player)
      const result = data.item.startsWith('weapon:')
        ? buyGun(inventory, data.item.slice(7), team, money.amount)
        : buyGunAmmo(inventory, data.item === 'ammo' ? 'primary' : 'secondary', money.amount)
      if (result.error) {
        room.send('matchNotice', { address, message: result.error })
        return
      }
      PlayerMoney.getMutable(player).amount = result.money
      if (data.item.startsWith('weapon:')) equipActiveWeapon(player)
      else {
        const active = inventory.items.find((item) => item.id === inventory.active)
        if (active) Weapon.getMutable(player).ammoReserve = active.reserve
      }
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
  })
}
