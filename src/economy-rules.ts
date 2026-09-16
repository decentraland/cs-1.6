import type { HitGroup } from './ballistics'
import { armorCovers } from './hit-regions'

export const START_MONEY = 800
export const KILL_REWARD = 300
export const MAX_MONEY = 16000
export const BUY_SECONDS = 90
export interface EquipmentAccount {
  money: number
  armor: number
  helmet: boolean
  defuseKit: boolean
  reserve: number
}
export interface BuyContext {
  alive: boolean
  eligible: boolean
  team: number
  phase: string
  matchOver?: boolean
  elapsed: number
  inZone: boolean
}
export type BuyItem = 'kevlar' | 'assaultsuit' | 'defusekit' | 'ammo'
const BUY_PHASES = ['freeze', 'live', 'won', 'lost', 'draw']
export function buyTimeRemaining(phase: string, elapsed: number, matchOver = false): number {
  if (matchOver || !BUY_PHASES.includes(phase)) return -1
  // Zero is still inside the buy window; -1 closes it after the exact deadline.
  return phase === 'freeze' ? BUY_SECONDS : Math.max(-1, Math.floor(BUY_SECONDS - elapsed))
}
export function buyRestriction(context: BuyContext): string | undefined {
  if (!context.alive || !context.eligible) return 'You must be alive to buy.'
  if (context.matchOver) return 'The match has ended.'
  if (!BUY_PHASES.includes(context.phase)) return 'Buying is unavailable before the round starts.'
  if (!context.inZone) return 'You must be in your buy zone.'
  if (buyTimeRemaining(context.phase, context.elapsed) < 0) return 'The buy time has expired.'
  return undefined
}
export function equipmentPrice(account: EquipmentAccount, item: string, team: number): number | undefined {
  if (item === 'kevlar') return account.armor >= 100 ? undefined : 650
  if (item === 'assaultsuit')
    return account.armor >= 100 ? (account.helmet ? undefined : 350) : account.helmet ? 650 : 1000
  if (item === 'defusekit') return team === 2 && !account.defuseKit ? 200 : undefined
  if (item === 'ammo') return account.reserve < 90 ? 80 : undefined
  return undefined
}
export function purchaseEquipment(account: EquipmentAccount, item: string, context: BuyContext): string | undefined {
  const restriction = buyRestriction(context)
  if (restriction) return restriction
  const price = equipmentPrice(account, item, context.team)
  if (price === undefined) return 'That item is unavailable or already full.'
  if (account.money < price) return 'You have insufficient funds!'
  account.money -= price
  if (item === 'kevlar' || item === 'assaultsuit') account.armor = 100
  if (item === 'assaultsuit') account.helmet = true
  if (item === 'defusekit') account.defuseKit = true
  if (item === 'ammo') account.reserve = Math.min(90, account.reserve + 30)
  return undefined
}
export interface LossHistory {
  ct: number
  t: number
  bonus: number
}
export function freshLossHistory(): LossHistory {
  return { ct: 0, t: 0, bonus: 1400 }
}
export function roundPayments(history: LossHistory, winner: 'ct' | 't' | 'draw', bomb: string) {
  if (winner === 'draw') return { ct: 0, t: 0 }
  const loser = winner === 'ct' ? 't' : 'ct'
  if (history[winner] > 1) history.bonus = 1500
  history[winner] = 0
  history[loser]++
  // The original checks before adding, allowing the first streak to reach 3400.
  if (history[loser] > 1 && history.bonus < 3000) history.bonus += 500
  const win = bomb === 'exploded' ? 3500 : 3250,
    loss = history.bonus + (bomb === 'defused' ? 800 : 0)
  return winner === 'ct' ? { ct: win, t: loss } : { ct: loss, t: win }
}
export function creditedMoney(balance: number, amount: number): number {
  return Math.max(0, Math.min(MAX_MONEY, balance + amount))
}

export function armorDamage(
  damage: number,
  armor: number,
  helmet: boolean,
  group: HitGroup,
  blast = false,
  bulletRatio = 0.775
) {
  if (armor <= 0 || (!blast && !armorCovers(group, armor, helmet))) return { damage, armor }
  const ratio = blast ? 0.5 : bulletRatio
  const absorbed = damage * (1 - ratio) * 0.5
  if (absorbed > armor) return { damage: damage - armor * (blast ? 1 : 2), armor: 0 }
  return { damage: damage * ratio, armor: armor - absorbed }
}

export class PurchaseSequences {
  private latest = new Map<string, number>()
  clear() {
    this.latest.clear()
  }
  accept(address: string, sequence: number) {
    if (!Number.isSafeInteger(sequence) || sequence <= (this.latest.get(address) ?? 0)) return false
    this.latest.set(address, sequence)
    return true
  }
}
export function playerRoundPayment(amount: number, team: number, alive: boolean, timeout: boolean): number {
  return team === 1 && alive && timeout ? 0 : amount
}
