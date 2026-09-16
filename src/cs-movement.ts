import {
  engine,
  EngineInfo,
  Transform,
  inputSystem,
  InputAction,
  Entity,
  Raycast,
  RaycastResult,
  RaycastQueryType,
  ColliderLayer
} from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { AvatarMovement, AvatarMovementInfo } from './bevy-movement'
import { CsMovement } from './cs-movement-rules'
import { supportHeight, nextStepHeight, keepStepLift, GroundPlane } from './movement-ground'
import { getFpsAimDirection } from './fps-camera'
import { hasAimControl, isTouchPlatform } from './platform'
import { getPractice } from './practice'
import { room } from './index'
import type { Point } from './ballistics'

const controller = new CsMovement()
let previous: Point | undefined
let previousAt = 0
let previousRound = -1
let sequence = 0
let requested: Point | undefined
let onGround = false
let stepProbe: Entity | undefined
let lift: { height: number; at: number } | undefined
let ground: GroundPlane | undefined
export function movementState() {
  return { ...controller, grounded: onGround, ground, lift }
}
export function initializeCsMovement() {
  stepProbe = engine.addEntity()
  Transform.create(stepProbe)
  Raycast.create(stepProbe, {
    direction: { $case: 'globalDirection', globalDirection: { x: 0, y: -1, z: 0 } },
    maxDistance: 1.35,
    queryType: RaycastQueryType.RQT_QUERY_ALL,
    continuous: true,
    collisionMask: ColliderLayer.CL_PHYSICS
  })
  Raycast.create(engine.PlayerEntity, {
    originOffset: { x: 0, y: 0.45, z: 0 },
    direction: { $case: 'globalDirection', globalDirection: { x: 0, y: -1, z: 0 } },
    maxDistance: 0.8,
    queryType: RaycastQueryType.RQT_QUERY_ALL,
    continuous: true,
    collisionMask: ColliderLayer.CL_PHYSICS
  })
  room.onMessage('playerFlinch', (data) => {
    const match = getPractice()
    if (
      data.address !== myProfile.userId?.toLowerCase() ||
      data.round !== match?.round ||
      match.phase !== 'live' ||
      data.sequence <= sequence
    )
      return
    sequence = data.sequence
    const feet = Transform.getOrNull(engine.PlayerEntity)?.position
    if (feet) controller.hit(data.large, data.source, feet)
  })
}
export function updateCsMovement(speed: number, frozen: boolean, maxSpeed = speed) {
  const info = AvatarMovementInfo.getOrNull(engine.PlayerEntity),
    now = Date.now() / 1000
  if (isTouchPlatform() || !info || !(info.stepTime > 0)) return false
  const feet = Transform.get(engine.PlayerEntity).position,
    match = getPractice(),
    round = match?.round ?? 0
  const dt = now - previousAt
  const applied = info.requestedVelocity,
    actual = info.actualVelocity
  const appliedSpeed = applied ? Math.hypot(applied.x, applied.z) : 0
  const blocked =
    !!applied &&
    !!actual &&
    appliedSpeed > 0.1 &&
    actual.x * applied.x + actual.z * applied.z < appliedSpeed * appliedSpeed * 0.8
  const reset =
    !previous ||
    dt <= 0 ||
    dt > 0.15 ||
    round !== previousRound ||
    Math.hypot(feet.x - previous.x, feet.y - previous.y, feet.z - previous.z) > 2
  if (reset) {
    controller.reset()
    requested = undefined
    onGround = false
    lift = undefined
  } else if (requested && info.actualVelocity && info.requestedVelocity) {
    const expected = info.requestedVelocity,
      actual = info.actualVelocity
    // Preserve the post-step gravity half while incorporating the renderer's collision response.
    controller.velocity.x += actual.x - expected.x
    if (!onGround) controller.velocity.y += actual.y - expected.y
    controller.velocity.z += actual.z - expected.z
  }
  if (!reset && info.externalVelocity) {
    controller.velocity.x += info.externalVelocity.x
    controller.velocity.y += info.externalVelocity.y
    controller.velocity.z += info.externalVelocity.z
  }
  previous = { ...feet }
  previousAt = now
  previousRound = round
  if (frozen || EngineInfo.getOrNull(engine.RootEntity)?.sceneHidden) {
    controller.reset()
    lift = undefined
    onGround = false
    AvatarMovement.deleteFrom(engine.PlayerEntity)
    requested = undefined
    return true
  }
  const result = RaycastResult.getOrNull(engine.PlayerEntity)
  const surface = result?.hits
    .filter((hit) => hit.position && hit.normalHit && hit.normalHit.y > 0.7 && hit.entityId !== engine.PlayerEntity)
    .sort((a, b) => a.length - b.length)[0]
  ground =
    surface?.position && surface.normalHit ? { position: surface.position, normal: surface.normalHit } : undefined
  // Ray results arrive a frame later; extend the hit plane to the current feet.
  const floorHeight = ground ? supportHeight(ground, feet) : 0
  const gap = feet.y - floorHeight
  let grounded = !!ground && controller.velocity.y < 4.5 && gap > -0.08 && gap < 0.08
  const next =
    stepProbe === undefined
      ? undefined
      : RaycastResult.getOrNull(stepProbe)
          ?.hits.filter((hit) => hit.position && hit.normalHit && hit.normalHit.y > 0.7)
          .sort((a, b) => a.length - b.length)[0]
  const aim = getFpsAimDirection(),
    yaw = Math.atan2(aim.x, aim.z),
    active = hasAimControl()
  const pressed = (action: InputAction) => (active && inputSystem.isPressed(action) ? 1 : 0)
  const jumping = !!pressed(InputAction.IA_JUMP)
  if (lift && !keepStepLift(lift.at, now, lift.height, floorHeight, grounded, jumping)) lift = undefined
  if (!lift && !jumping && grounded && blocked && next?.position && next.normalHit) {
    const height = nextStepHeight(floorHeight, { position: next.position, normal: next.normalHit })
    if (height !== undefined) lift = { height, at: now }
  }
  if (lift) grounded = true
  const velocity = controller.velocity,
    length = Math.hypot(velocity.x, velocity.z)
  const edge = grounded && length > 0 && !next
  requested = controller.step(
    {
      forward: pressed(InputAction.IA_FORWARD) - pressed(InputAction.IA_BACKWARD),
      side: pressed(InputAction.IA_RIGHT) - pressed(InputAction.IA_LEFT),
      jump: jumping,
      yaw,
      speed,
      maxSpeed,
      grounded,
      edge
    },
    reset ? info.stepTime : dt
  )
  onGround = grounded && requested.y === 0
  if (stepProbe !== undefined) {
    const length = Math.hypot(requested.x, requested.z),
      distance = 0.4
    Transform.getMutable(stepProbe).position = {
      x: feet.x + (length ? (requested.x / length) * distance : 0),
      y: feet.y + 0.5,
      z: feet.z + (length ? (requested.z / length) * distance : 0)
    }
  }
  if (onGround && lift) requested.y = (lift.height - feet.y) / Math.max(0.005, info.stepTime)
  else if (onGround && ground) {
    const slope = -(requested.x * ground.normal.x + requested.z * ground.normal.z) / ground.normal.y
    requested.y = slope - Math.max(0, gap - 0.002) / Math.max(0.005, dt)
  }
  AvatarMovement.createOrReplace(engine.PlayerEntity, {
    velocity: requested,
    orientation: (yaw * 180) / Math.PI,
    groundDirection: { x: 0, y: -1, z: 0 }
  })
  return true
}
