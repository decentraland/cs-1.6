import { C4_DEPLOY_SECONDS, C4_DROP_AT } from './bomb-rules'

export interface C4Animation {
  selected: boolean
  plantAt: number
  readyAt: number
  clip: string
  clipAt: number
  serial: number
  acknowledged: boolean
}
export const newC4Animation = (): C4Animation => ({
  selected: false,
  plantAt: -1,
  readyAt: 0,
  clip: 'idle1',
  clipAt: 0,
  serial: 0,
  acknowledged: false
})
function play(state: C4Animation, clip: string, now: number) {
  state.clip = clip
  state.clipAt = now
  state.serial++
}
export function advanceC4Animation(
  state: C4Animation,
  input: { selected: boolean; held: boolean; site: boolean; readyAt: number; planting: boolean; now: number }
) {
  const { selected, held, site, planting, now } = input
  if (selected !== state.selected) {
    state.selected = selected
    state.plantAt = -1
    state.acknowledged = false
    if (selected) {
      state.readyAt = now + C4_DEPLOY_SECONDS
      play(state, 'draw', now)
    }
  }
  if (!selected) return
  state.readyAt = Math.max(state.readyAt, input.readyAt)
  if (state.plantAt >= 0) {
    if (planting) state.acknowledged = true
    if (
      !held ||
      !site ||
      (state.acknowledged && !planting) ||
      (!planting && input.readyAt > now && now - state.plantAt > 0.2)
    ) {
      play(state, now - state.plantAt >= C4_DROP_AT ? 'draw' : 'idle1', now)
      state.readyAt = Math.max(state.readyAt, now + (!held ? 1 : 1.5))
      state.plantAt = -1
      state.acknowledged = false
    } else if (now - state.plantAt >= C4_DROP_AT && state.clip !== 'drop') {
      play(state, 'drop', now)
    }
  } else if (held && site && now >= state.readyAt) {
    state.plantAt = now
    state.acknowledged = planting
    play(state, 'pressbutton', now)
  } else if (state.clip === 'draw' && now - state.clipAt >= 0.5) {
    play(state, 'idle1', now)
  }
}
