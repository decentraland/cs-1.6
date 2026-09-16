import { Animator, engine, Entity } from '@dcl/sdk/ecs'
import { Bot, BotBodyPose } from './components'
import type { BodyLayer } from './player-model-rules'

interface AppliedLayer {
  layer: BodyLayer
  clip: string
}
interface Applied {
  upper: AppliedLayer
  lower?: AppliedLayer
  used: Set<string>
}
const applied = new Map<Entity, Applied>()

function sameLayer(a: BodyLayer | undefined, b: BodyLayer | undefined) {
  return a?.clip === b?.clip && a?.revision === b?.revision && a?.loop === b?.loop && a?.rate === b?.rate
}
function clipName(before: AppliedLayer | undefined, layer: BodyLayer) {
  if (before?.layer.clip !== layer.clip) return layer.clip
  if (before.layer.revision === layer.revision) return before.clip
  // Retriggering the same clip needs a different name; the models carry a `__repeat` copy of every clip.
  return before.clip.endsWith('__repeat') ? layer.clip : layer.clip + '__repeat'
}

// The Animator is client-local: Unity writes `playing: false` back when a non-looping clip ends, and a synced
// server-owned Animator rejects that write and re-sends the finished clip, replaying every death forever.
// Clips that left the pose stay listed as stopped because Unity keeps playing anything it is not told to stop.
export function botAnimationSystem() {
  for (const [entity, , pose] of engine.getEntitiesWith(Bot, BotBodyPose)) {
    const prior = applied.get(entity)
    if (prior && sameLayer(prior.upper.layer, pose.upper) && sameLayer(prior.lower?.layer, pose.lower)) continue
    const upper = { layer: pose.upper, clip: clipName(prior?.upper, pose.upper) }
    const lower = pose.lower ? { layer: pose.lower, clip: clipName(prior?.lower, pose.lower) } : undefined
    const used = prior?.used ?? new Set<string>()
    const active = [upper, ...(lower ? [lower] : [])]
    for (const { clip } of active) used.add(clip)
    Animator.createOrReplace(entity, {
      states: [
        ...active.map(({ clip, layer }) => ({
          clip,
          playing: true,
          loop: layer.loop,
          speed: layer.rate,
          weight: 1,
          shouldReset: false
        })),
        ...[...used]
          .filter((clip) => !active.some((state) => state.clip === clip))
          .map((clip) => ({ clip, playing: false, loop: false, speed: 1, weight: 1, shouldReset: false }))
      ]
    })
    applied.set(entity, { upper, lower, used })
  }
  for (const entity of applied.keys()) if (!Bot.has(entity)) applied.delete(entity)
}
