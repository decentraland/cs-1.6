import { AccuracyState, recoverAccuracy, setTrigger } from './accuracy'

import { GunId } from './weapon-profiles'
import { freshGunAccuracy, gunSpread, gunKick } from './gun-accuracy'
import { shotRandom } from './shared-random'

export interface ConfirmedRecoil {
  shots: number
  accuracy: number
  pitch: number
  yaw: number
  right: boolean
}
type RecoilEvent =
  | { kind: 'shot'; at: number; id: number; speed: number; grounded: boolean }
  | { kind: 'trigger'; at: number; held: boolean }
  | { kind: 'reload'; at: number }

export class RecoilPrediction {
  private base: AccuracyState
  private predicted: AccuracyState
  constructor(
    private gun: GunId = 'ak47',
    private seed = 0
  ) {
    this.base = freshGunAccuracy(gun)
    this.predicted = freshGunAccuracy(gun)
  }
  private events: RecoilEvent[] = []
  private acknowledged = 0
  private lastPredicted = 0
  private correction = { pitch: 0, yaw: 0 }
  private renderedAt = 0

  // Copy of the predicted state before the next shot, for planning that shot's ray.
  snapshot(): AccuracyState {
    return { ...this.predicted }
  }

  get pendingShots() {
    return this.pendingAfter(0)
  }
  pendingAfter(id: number) {
    return this.events.filter((event) => event.kind === 'shot' && event.id > id).length
  }

  private apply(state: AccuracyState, event: RecoilEvent) {
    if (event.kind === 'trigger') setTrigger(state, event.held, event.at)
    else if (event.kind === 'reload')
      Object.assign(state, freshGunAccuracy(this.gun), { updatedAt: event.at, held: state.held })
    else {
      gunSpread(state, this.gun, event.at, event.speed, event.grounded)
      // Same shared stream as the server, so the kick direction flips are predicted exactly.
      gunKick(state, this.gun, event.speed, event.grounded, shotRandom(this.seed, event.id))
    }
  }

  private add(event: RecoilEvent) {
    this.apply(this.predicted, event)
    this.events.push(event)
    if (this.pendingShots === 0) {
      this.base = { ...this.predicted }
      this.events.length = 0
    }
  }

  trigger(held: boolean, now: number) {
    if (held !== this.predicted.held) this.add({ kind: 'trigger', held, at: now })
  }

  reload(now: number) {
    this.add({ kind: 'reload', at: now })
  }

  predict(id: number, now: number, speed: number, grounded: boolean): boolean {
    if (id <= this.lastPredicted || this.pendingShots >= 30) return false
    this.lastPredicted = id
    this.punch(now)
    this.add({ kind: 'shot', id, at: now, speed, grounded })
    return true
  }

  private rebuild(now: number) {
    const previous = this.punch(now)
    this.predicted = { ...this.base }
    for (const event of this.events) this.apply(this.predicted, event)
    recoverAccuracy(this.predicted, now)
    this.correction = { pitch: previous.pitch - this.predicted.pitch, yaw: previous.yaw - this.predicted.yaw }
    this.renderedAt = now
  }

  confirm(id: number, recoil: ConfirmedRecoil, now: number): boolean {
    if (id <= this.acknowledged) return false
    const index = this.events.findIndex((event) => event.kind === 'shot' && event.id === id)
    if (index < 0) return false
    const at = this.events[index].at
    this.acknowledged = id
    // Age the acknowledged kick from its local input time, not packet arrival time.
    this.base = { ...freshGunAccuracy(this.gun), ...recoil, updatedAt: at, lastFire: at, held: true }
    this.events.splice(0, index + 1)
    this.rebuild(now)
    return true
  }

  reject(id: number, now: number) {
    const index = this.events.findIndex((event) => event.kind === 'shot' && event.id === id)
    if (index < 0) return
    this.events.splice(index, 1)
    this.rebuild(now)
  }

  punch(now: number) {
    recoverAccuracy(this.predicted, now)
    const factor = Math.exp(-Math.max(0, now - this.renderedAt) / 0.05)
    this.correction.pitch *= factor
    this.correction.yaw *= factor
    this.renderedAt = now
    return { pitch: this.predicted.pitch + this.correction.pitch, yaw: this.predicted.yaw + this.correction.yaw }
  }
}
