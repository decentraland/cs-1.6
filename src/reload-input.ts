import { canReload, WeaponState, primaryDeadline } from './combat-rules'

export class ReloadInput {
  private retryAt = 0
  private revision = -1
  private round = -1

  reset() {
    this.retryAt = 0
  }

  request(
    weapon: Readonly<WeaponState> & { revision: number },
    input: { held: boolean; firing: boolean; active: boolean; now: number; blockedUntil: number; round: number }
  ): boolean {
    if (weapon.revision !== this.revision || input.round !== this.round) {
      this.reset()
      this.revision = weapon.revision
      this.round = input.round
    }
    if (!input.held || !input.active) {
      this.reset()
      return false
    }
    if (
      input.firing ||
      !canReload(weapon, true) ||
      input.now < (weapon.readyAt ?? 0) ||
      input.now < primaryDeadline(weapon) ||
      input.now < input.blockedUntil ||
      input.now < this.retryAt
    )
      return false
    // Retry a held request while waiting for authoritative reload state, at most four times per second.
    this.retryAt = input.now + 0.25
    return true
  }
}
