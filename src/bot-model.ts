import { BotBodyPose } from './components'
import { Entity, GltfContainer } from '@dcl/sdk/ecs'
import { BotCombat } from './bot-combat'
import { HitGroup, HitRegion } from './ballistics'
import { BodyPose, bodyHitRegions, bodyPose, deathAnimation, playerBody } from './player-model-rules'

const poses = new Map<Entity, { model: string; pose: BodyPose }>()
export function createBotBody(entity: Entity, team: number, combat: BotCombat, now: number) {
  const model = playerBody(team)
  GltfContainer.create(entity, {
    src: `assets/scene/players/${model}.glb`,
    visibleMeshesCollisionMask: 0,
    invisibleMeshesCollisionMask: 0
  })
  const pose = bodyPose({
    model,
    gun: combat.gun,
    speed: 0,
    now,
    lastShot: -Infinity,
    reloading: false,
    reloadAt: 0,
    reloadTime: combat.weapon.reloadTime,
    planting: false
  })
  poses.set(entity, { model, pose })
  BotBodyPose.createOrReplace(entity, { model, ...pose })
}
export function updateBotBody(entity: Entity, combat: BotCombat, speed: number, now: number, planting: boolean) {
  const state = poses.get(entity)
  if (!state?.pose.lower) return
  const pose = bodyPose(
    {
      model: state.model,
      gun: combat.gun,
      speed,
      now,
      lastShot: combat.weapon.lastShotTime,
      reloading: combat.weapon.isReloading,
      reloadAt: combat.weapon.reloadStartTime,
      reloadTime: combat.weapon.reloadTime,
      planting
    },
    state.pose
  )
  if (pose.upper !== state.pose.upper || pose.lower !== state.pose.lower) {
    state.pose = pose
    BotBodyPose.createOrReplace(entity, { model: state.model, ...pose })
  }
}
export function killBotBody(entity: Entity, group: HitGroup, blast: boolean, now: number) {
  const state = poses.get(entity)
  if (!state?.pose.lower) return
  state.pose = { upper: { clip: blast ? 'back' : deathAnimation(group), at: now, loop: false, rate: 1, revision: 0 } }
  BotBodyPose.createOrReplace(entity, { model: state.model, ...state.pose })
}
export function botBodyHitRegions(entity: Entity, now: number): HitRegion[] {
  const state = BotBodyPose.getOrNull(entity)
  return state ? bodyHitRegions(state.model, state, now) : []
}
export function clearBotBodies() {
  poses.clear()
}
