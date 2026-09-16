import {
  engine,
  Entity,
  Transform,
  VirtualCamera,
  MainCamera,
  PrimaryPointerInfo,
  inputSystem,
  InputAction,
  EngineInfo
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { AimAngles, moveAim, aimDirection } from './aim'
import { ConfirmedRecoil, RecoilPrediction } from './recoil-prediction'
import { GunId, GUNS } from './weapon-profiles'
import { mapDistance } from './world-query'
import { chasePosition, deathCameraPose, DEATH_TRANSITION_SECONDS } from './spectator-rules'
import { decayVictimPunch } from './damage-feedback'
import type { VictimPunch } from './damage-feedback'
import { isPointerLocked, isTouchPlatform, pointerScreenDelta } from './platform'
import { aimShot, ShotPlan } from './ballistics'
import { updateScopeCamera } from './scope-camera'
import { shotRandom } from './shared-random'
import { fallDamage } from './fall-rules'
import { ObserverMode, ObserverRoaming } from './observer-roaming'

// Desktop: a scene-driven VirtualCamera is the live view so recoil and pain punch can rotate it like
// CS 1.6; it trails the avatar by one frame, so client.ts hides the local avatar.
// Touch: the explorer never locks the pointer and its screen delta is not a look input, so the live
// view is the engine's first-person camera (CameraModeArea in weapon-view.ts) and aim is read from
// its transform. No VirtualCamera is used on touch at all: the Godot controller only re-enables touch
// look after an uninterrupted transition back from a scene camera, and respawn can interrupt it.
// Workaround for decentraland/godot-explorer#2885; restore the death cam on touch once it is fixed.
// No recoil view punch on touch until the explorer offers a camera offset API: decentraland/sdk#1199.
export const EYE_HEIGHT = 1.6
let camera: Entity | undefined
let spawned = false
let wasLocked = false
let spectating = false
let spectatorAnchor: Vector3 | undefined
let observerMode: ObserverMode = 'chase'
let roamingMoving = false
const roaming = new ObserverRoaming()
let deathView: { anchor: Vector3; startedAt: number } | undefined
let damageView: { punch: VictimPunch; startedAt: number } | undefined
let enteredChase = false
let round = 0
let cameraGun: GunId = 'ak47'
let cameraRevision = -1
let cameraMode = 0
let cameraZoom = 90
let scopeShot: { id: number; revision: number } | undefined
let roundSeed = 0
let recoil = new RecoilPrediction(cameraGun)
const aim: AimAngles = { yaw: -Math.PI / 2, pitch: 0 }

export function spawnedRound() {
  return round
}

export function syncCameraWeapon(gun: GunId, revision: number, mode = 0, zoom = 90, firedShotId = 0) {
  cameraMode = mode
  if (scopeShot && (scopeShot.revision !== revision || firedShotId >= scopeShot.id)) scopeShot = undefined
  cameraZoom = scopeShot ? 90 : zoom
  if (gun !== cameraGun || revision !== cameraRevision) {
    cameraGun = gun
    cameraRevision = revision
    recoil = new RecoilPrediction(gun, roundSeed)
  }
}

function liveVirtualCamera() {
  return !isTouchPlatform()
}

function engineCameraForward(): Vector3 | undefined {
  const transform = Transform.getOrNull(engine.CameraEntity)
  if (!transform) return undefined
  const forward = Vector3.rotate(Vector3.Forward(), transform.rotation)
  const length = Vector3.length(forward)
  if (!Number.isFinite(length) || length < 0.001) return undefined
  return Vector3.scale(forward, 1 / length)
}

function seedAimFromEngineCamera() {
  const forward = engineCameraForward()
  if (!forward) return
  aim.yaw = Math.atan2(forward.x, forward.z)
  aim.pitch = Math.max(-1.55, Math.min(1.55, Math.asin(Math.max(-1, Math.min(1, forward.y)))))
}

function ensureCamera() {
  if (camera === undefined) {
    camera = engine.addEntity()
    const eye = Transform.getOrNull(engine.CameraEntity)?.position
    const feet = Transform.get(engine.PlayerEntity).position
    Transform.create(camera, { position: eye ? { ...eye } : { x: feet.x, y: feet.y + EYE_HEIGHT, z: feet.z } })
    VirtualCamera.create(camera, { defaultTransition: { transitionMode: VirtualCamera.Transition.Time(0) } })
  }
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: camera })
}

function releaseEngineCamera() {
  if (MainCamera.has(engine.CameraEntity)) MainCamera.deleteFrom(engine.CameraEntity)
}

export function resetFpsCamera(nextRound: number, yaw = -Math.PI / 2, seed = roundSeed) {
  spawned = true
  scopeShot = undefined
  roundSeed = seed
  spectating = false
  spectatorAnchor = undefined
  observerMode = 'chase'
  roamingMoving = false
  roaming.reset()
  deathView = undefined
  damageView = undefined
  enteredChase = false
  round = nextRound
  wasLocked = false
  recoil = new RecoilPrediction(cameraGun, roundSeed)
  aim.yaw = yaw
  aim.pitch = 0
  if (liveVirtualCamera()) ensureCamera()
  else releaseEngineCamera()
}

export function setSpectatorView(
  active: boolean,
  anchor: Vector3 | undefined,
  nextRound: number,
  death?: { anchor: Vector3; startedAt: number },
  observer?: { mode: ObserverMode; moving: boolean; jumpToTarget: boolean }
) {
  if (active && !spectating) {
    if (!spawned) resetFpsCamera(nextRound)
    if (liveVirtualCamera()) ensureCamera()
    else seedAimFromEngineCamera()
  }
  spectating = active
  spectatorAnchor = anchor
  const nextMode = active ? (observer?.mode ?? 'chase') : 'chase'
  if (nextMode === 'roaming' && (observerMode !== 'roaming' || observer?.jumpToTarget)) {
    const pose = camera === undefined ? Transform.get(engine.CameraEntity) : Transform.get(camera)
    roaming.reset(observer?.jumpToTarget && anchor ? { ...anchor, y: anchor.y + EYE_HEIGHT } : pose.position)
  }
  observerMode = nextMode
  roamingMoving = !!observer?.moving
  if (!active) {
    deathView = undefined
    enteredChase = false
    if (!liveVirtualCamera()) releaseEngineCamera()
  } else if (death && death.startedAt !== deathView?.startedAt) {
    deathView = death
    enteredChase = false
  } else if (!death) {
    deathView = undefined
  }
}

export function receiveCameraKick(data: { round: number; shotId: number } & ConfirmedRecoil) {
  if (data.round === round) recoil.confirm(data.shotId, data, Date.now() / 1000)
}

export function receiveDamageKick(punch: VictimPunch) {
  damageView = { punch, startedAt: Date.now() / 1000 }
}

export function receiveLandingKick(speed: number) {
  const now = Date.now() / 1000
  const pitch = fallDamage(speed) > 0 ? 0 : getPainPunch(now).pitch
  damageView = { punch: { pitch, roll: (speed / 0.025) * 0.013 }, startedAt: now }
  if (fallDamage(speed) > 0) recoil.clearPitch(now)
}

export function getCameraZoom() {
  return spectating ? 90 : cameraZoom
}

export function rejectCameraKick(data: { round: number; shotId: number }) {
  if (scopeShot?.id === data.shotId) scopeShot = undefined
  if (data.round === round) recoil.reject(data.shotId, Date.now() / 1000)
}

export function setCameraTrigger(held: boolean) {
  recoil.trigger(held, Date.now() / 1000)
}
export function resetCameraAccuracy() {
  recoil.reload(Date.now() / 1000)
}
export function pendingCameraShots(lastFiredShotId: number) {
  return recoil.pendingAfter(lastFiredShotId)
}

// Applies the shot to the predicted recoil and returns where the bullet should land, using the same
// shared random stream as the server so the impact marker matches the confirmation.
export function predictCameraKick(shotId: number, speed: number, continuationSpread?: number): ShotPlan | undefined {
  const feet = Transform.get(engine.PlayerEntity).position
  const now = Date.now() / 1000
  const grounded = mapDistance({ x: feet.x, y: feet.y + 0.1, z: feet.z }, { x: 0, y: -1, z: 0 }, 0.35) < 0.3
  const plan = aimShot({
    gun: cameraGun,
    mode: cameraMode,
    zoom: cameraZoom,
    continuationSpread,
    feet,
    aim: getFpsAimDirection(),
    accuracy: recoil.snapshot(),
    triggerHeld: true,
    speed,
    now,
    random: shotRandom(roundSeed, shotId)
  })
  recoil.predict(shotId, now, speed, grounded, cameraMode, cameraZoom, continuationSpread !== undefined)
  if ((cameraGun === 'awp' || cameraGun === 'scout') && cameraZoom !== 90) {
    scopeShot = { id: shotId, revision: cameraRevision }
    cameraZoom = 90
  }
  return plan
}

// Predicted recoil punch in degrees (pitch up positive); the camera and the viewmodel both use it.
export function getViewPunch(now: number): { pitch: number; yaw: number } {
  return spectating ? { pitch: 0, yaw: 0 } : recoil.punch(now)
}

export function getPainPunch(now: number): VictimPunch {
  return spectating || !damageView
    ? { pitch: 0, roll: 0 }
    : decayVictimPunch(damageView.punch, now - damageView.startedAt)
}

// Send mouse aim alone: the server applies authoritative punch to the shot once.
export function getFpsAimDirection() {
  if (!spectating && !liveVirtualCamera()) return engineCameraForward() ?? aimDirection(aim)
  return aimDirection(aim)
}

export function fpsCameraInputSystem() {
  if (!spawned) return
  // Touch look is handled by the explorer; its screen delta also moves with the joystick.
  if (isTouchPlatform()) return
  const locked = isPointerLocked()
  if (spectating && deathView && Date.now() / 1000 - deathView.startedAt < DEATH_TRANSITION_SECONDS) {
    wasLocked = locked
    return
  }
  if (locked && wasLocked) {
    const delta = PrimaryPointerInfo.getOrNull(engine.RootEntity)?.screenDelta
    if (delta) {
      const { x, y } = pointerScreenDelta(delta)
      const sensitivity = cameraZoom === 90 || spectating ? 1 : (cameraZoom / 90) * 1.2
      moveAim(aim, x * sensitivity, y * sensitivity)
    }
  }
  wasLocked = locked
}

export function fpsCameraSystem(dt: number) {
  if (!spawned) return
  if (!liveVirtualCamera()) {
    releaseEngineCamera()
    if (!spectating) seedAimFromEngineCamera()
    return
  }
  if (camera === undefined) return
  const now = Date.now() / 1000
  VirtualCamera.getMutable(camera).fov = spectating
    ? 60
    : (2 * Math.atan(Math.tan((cameraZoom * Math.PI) / 360) * 0.75) * 180) / Math.PI
  const direction = aimDirection(aim, getViewPunch(now))
  const pitch = Math.asin(direction.y)
  const yaw = Math.atan2(direction.x, direction.z)
  const pain = getPainPunch(now)
  const player = Transform.get(engine.PlayerEntity)
  const deathPose = deathView ? deathCameraPose(deathView.anchor, now - deathView.startedAt) : undefined
  const transitioning = spectating && deathPose && !deathPose.complete
  if (spectating && !transitioning && spectatorAnchor) enteredChase = true
  const holdingDeathView = spectating && observerMode === 'chase' && !enteredChase && deathPose
  const pressed = (key: InputAction) => (inputSystem.isPressed(key) ? 1 : 0)
  const roamingPosition =
    spectating && observerMode === 'roaming'
      ? roaming.advance(
          direction,
          pressed(InputAction.IA_FORWARD) - pressed(InputAction.IA_BACKWARD),
          pressed(InputAction.IA_RIGHT) - pressed(InputAction.IA_LEFT),
          !!pressed(InputAction.IA_MODIFIER),
          dt,
          roamingMoving && !EngineInfo.getOrNull(engine.RootEntity)?.sceneHidden
        )
      : undefined
  Transform.createOrReplace(camera, {
    position: spectating
      ? transitioning || holdingDeathView
        ? deathPose.position
        : (roamingPosition ??
          (spectatorAnchor ? chasePosition(spectatorAnchor, direction, mapDistance) : Transform.get(camera).position))
      : { x: player.position.x, y: player.position.y + EYE_HEIGHT, z: player.position.z },
    rotation: Quaternion.fromEulerDegrees(
      (-pitch * 180) / Math.PI - pain.pitch,
      (yaw * 180) / Math.PI,
      transitioning || holdingDeathView ? deathPose.roll : pain.roll
    )
  })
  updateScopeCamera(camera, spectating ? 90 : cameraZoom, spectating ? 90 : (GUNS[cameraGun].zoomLevels?.[0] ?? 90))
}
