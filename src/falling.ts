import { engine, Transform, PlayerIdentityData } from '@dcl/sdk/ecs'
import { Dead, PlayerHealth } from './components'
import { playerEntities, applyFallDamage } from './server'
import { canPlayRound, getPractice } from './practice'
import { room } from './index'
import { bulletWorldTrace } from './penetration'
import {
  FallTracker,
  Landing,
  LandingClaim,
  LANDING_CLAIM_WAIT,
  acceptedLandingSpeed,
  FALL_SAFE_SPEED
} from './fall-rules'

interface FallingPlayer {
  tracker: FallTracker
  pending?: Landing
  claim?: LandingClaim
  sequence: number
}
const players = new Map<string, FallingPlayer>()
let round = -1

export function resetPlayerFall(address: string) {
  players.delete(address)
}

export function initializeFalling() {
  room.onMessage('playerLanding', (data, context) => {
    if (!context || data.round !== getPractice()?.round || getPractice()?.phase !== 'live') return
    const address = context.from.toLowerCase(),
      state = players.get(address)
    if (
      !state ||
      data.sequence <= state.sequence ||
      ![data.sequence, data.speed, data.position.x, data.position.y, data.position.z].every(Number.isFinite) ||
      data.speed < 0 ||
      data.speed > 40
    )
      return
    state.sequence = data.sequence
    state.claim = { sequence: data.sequence, speed: data.speed, position: data.position, at: Date.now() / 1000 }
  })
  engine.addSystem(() => {
    const match = getPractice(),
      now = Date.now() / 1000
    if (!match || match.phase !== 'live' || round !== match.round) {
      players.clear()
      round = match?.round ?? -1
      return
    }
    const seen = new Set<string>()
    for (const [avatar, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
      const address = identity.address.toLowerCase(),
        entity = playerEntities.get(address),
        position = Transform.getOrNull(avatar)?.position
      if (
        entity === undefined ||
        !position ||
        !canPlayRound(address) ||
        Dead.has(entity) ||
        (PlayerHealth.getOrNull(entity)?.current ?? 0) <= 0
      )
        continue
      seen.add(address)
      let state = players.get(address)
      if (!state) {
        state = { tracker: new FallTracker(), sequence: 0 }
        players.set(address, state)
      }
      const floor = bulletWorldTrace({ x: position.x, y: position.y + 0.9, z: position.z }, { x: 0, y: -1, z: 0 }, 1.6)
      const grounded = floor.solid && floor.distance <= 1.02 && (floor.normal?.y ?? 0) > 0.65
      const landing = state.tracker.sample(position, now, grounded)
      if (landing && landing.speed > FALL_SAFE_SPEED - 2) state.pending = landing
      if (state.claim && now - state.claim.at > 0.6) state.claim = undefined
      const pending = state.pending
      if (!pending) continue
      const accepted = acceptedLandingSpeed(pending, state.claim)
      if (accepted === pending.speed && now < pending.at + LANDING_CLAIM_WAIT) continue
      state.pending = state.claim = undefined
      applyFallDamage(entity, accepted, pending.position)
    }
    for (const address of players.keys()) if (!seen.has(address)) players.delete(address)
  })
}
