import { nearestOnPath, rewindTo } from './rewind-rules'
import type { Point, RewindSample } from './rewind-rules'

export const HUMAN_MAX_REWIND = 0.5
export const HUMAN_INTERPOLATION = 0.1
export const HUMAN_HISTORY_SECONDS = 1
export const HUMAN_CLAIM_TIME_TOLERANCE = 0.1
export const HUMAN_CLAIM_DISTANCE = 0.35
export const PROBE_INTERVAL = 2
export const PROBE_TIMEOUT = 2
export const LATENCY_MAX_AGE = 10
export const HUMAN_SAMPLE_GAP = 0.25
const TELEPORT_DISTANCE = 3.2

interface PeerLatency {
  pending?: { token: number; sentAt: number }
  nextAt: number
  samples: { at: number; rtt: number }[]
}

export class HumanLatency {
  private peers = new Map<string, PeerLatency>()
  private sequence = 0

  forget(address: string) {
    this.peers.delete(address)
  }

  probe(address: string, now: number): number | undefined {
    if (!Number.isFinite(now)) return undefined
    let peer = this.peers.get(address)
    if (!peer) {
      peer = { nextAt: now, samples: [] }
      this.peers.set(address, peer)
    }
    if (now < peer.nextAt || (peer.pending && now - peer.pending.sentAt < PROBE_TIMEOUT)) return undefined
    const token = ++this.sequence
    peer.pending = { token, sentAt: now }
    peer.nextAt = now + PROBE_INTERVAL
    return token
  }

  acknowledge(address: string, token: number, now: number): boolean {
    const peer = this.peers.get(address)
    if (!peer?.pending || !Number.isSafeInteger(token) || token !== peer.pending.token || !Number.isFinite(now))
      return false
    const rtt = now - peer.pending.sentAt
    if (rtt < 0) return false
    peer.pending = undefined
    if (rtt > PROBE_TIMEOUT) return false
    peer.samples = peer.samples.filter((sample) => now - sample.at <= LATENCY_MAX_AGE)
    peer.samples.push({ at: now, rtt })
    return true
  }

  viewTime(address: string, receivedAt: number): { at: number; rtt?: number; delay: number } {
    const recent = this.peers
      .get(address)
      ?.samples.filter((sample) => sample.at <= receivedAt && receivedAt - sample.at <= LATENCY_MAX_AGE)
    if (!recent?.length) return { at: receivedAt, delay: 0 }
    // A delayed echo must not immediately buy a larger rewind window.
    const rtt = Math.min(...recent.map((sample) => sample.rtt))
    const delay = Math.min(HUMAN_MAX_REWIND, rtt / 2 + HUMAN_INTERPOLATION)
    return { at: receivedAt - delay, rtt, delay }
  }
}

interface HumanTrack {
  life: string
  samples: RewindSample[]
}

export class HumanHistory {
  private tracks = new Map<string, HumanTrack>()

  clear(address: string) {
    this.tracks.delete(address)
  }

  record(address: string, life: string, sample: RewindSample) {
    if (![sample.at, sample.yaw, sample.position.x, sample.position.y, sample.position.z].every(Number.isFinite)) {
      this.clear(address)
      return
    }
    let track = this.tracks.get(address)
    const last = track?.samples[track.samples.length - 1]
    if (last && sample.at <= last.at && track?.life === life) return
    const discontinuity =
      last &&
      (sample.at - last.at > HUMAN_SAMPLE_GAP ||
        Math.hypot(
          sample.position.x - last.position.x,
          sample.position.y - last.position.y,
          sample.position.z - last.position.z
        ) > TELEPORT_DISTANCE)
    if (!track || track.life !== life || discontinuity) {
      track = { life, samples: [] }
      this.tracks.set(address, track)
    }
    track.samples.push({ at: sample.at, position: { ...sample.position }, yaw: sample.yaw })
    while (track.samples.length > 2 && track.samples[1].at < sample.at - HUMAN_HISTORY_SECONDS) track.samples.shift()
  }

  at(address: string, life: string, time: number): RewindSample | undefined {
    const track = this.tracks.get(address)
    if (!track || track.life !== life || !Number.isFinite(time)) return undefined
    const first = track.samples[0],
      last = track.samples[track.samples.length - 1]
    // Clamping before the first sample could let a previous-life shot hit a respawn.
    if (time < first.at || time < last.at - HUMAN_HISTORY_SECONDS || time - last.at > HUMAN_SAMPLE_GAP) return undefined
    const sample = rewindTo(track.samples, time)
    return sample && { ...sample, position: { ...sample.position } }
  }

  observed(
    address: string,
    life: string,
    seenAt: number,
    receivedAt: number,
    position: Point
  ): RewindSample | undefined {
    if (![position.x, position.y, position.z, seenAt, receivedAt].every(Number.isFinite)) return undefined
    const track = this.tracks.get(address)
    if (!track || !this.at(address, life, seenAt)) return undefined
    const from = Math.max(seenAt - HUMAN_CLAIM_TIME_TOLERANCE, receivedAt - HUMAN_MAX_REWIND, track.samples[0].at)
    const to = Math.min(seenAt + HUMAN_CLAIM_TIME_TOLERANCE, receivedAt)
    if (from > to) return undefined
    const first = this.at(address, life, from),
      last = this.at(address, life, to)
    if (!first || !last) return undefined
    const nearest = nearestOnPath(track.samples, from, to, position, HUMAN_CLAIM_DISTANCE)
    return nearest && { ...nearest, position: { ...position } }
  }
}
