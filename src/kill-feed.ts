import { GUNS } from './weapon-profiles'
import { DEATH_ICONS } from './death-icons'

export interface KillNotice {
  killer: string
  victim: string
  weapon: string
  killerTeam?: number
  victimTeam?: number
  headshot?: boolean
  suicide?: boolean
}
export interface FeedEntry extends KillNotice {
  id: number
  expires: number
}

export function deathIconKey(weapon: string): string {
  const gun = Object.values(GUNS).find((gun) => gun.name === weapon || gun.id === weapon.toLowerCase())
  const id =
    gun?.id === 'mp5'
      ? 'mp5navy'
      : (gun?.id ?? (weapon === 'C4' || weapon === 'HE Grenade' ? 'grenade' : weapon.toLowerCase()))
  return Object.prototype.hasOwnProperty.call(DEATH_ICONS, id) ? id : 'skull'
}

export class KillFeedState {
  private notices: FeedEntry[] = []
  private sequence = 0

  add(notice: KillNotice, now: number) {
    this.notices = [...this.entries(now), { ...notice, id: ++this.sequence, expires: now + 6 }].slice(-4)
  }

  entries(now: number): readonly FeedEntry[] {
    this.notices = this.notices.filter((notice) => notice.expires > now)
    return this.notices
  }
}
