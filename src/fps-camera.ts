import { engine, Entity, Transform, VirtualCamera, MainCamera, PrimaryPointerInfo, PointerLock } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { AimAngles, moveAim, aimDirection } from './aim'
import { ConfirmedRecoil, RecoilPrediction } from './recoil-prediction'
import { GunId } from './weapon-profiles'
import { mapDistance } from './world-query'
import { chasePosition, deathCameraPose, DEATH_TRANSITION_SECONDS } from './spectator-rules'
import { decayVictimPunch } from './damage-feedback'
import type { VictimPunch } from './damage-feedback'

let camera: Entity | undefined
let wasLocked = false
let spectating = false
let spectatorAnchor: Vector3 | undefined
let deathView: { anchor: Vector3; startedAt: number } | undefined
let damageView: { punch: VictimPunch; startedAt: number } | undefined
let enteredChase = false
let round = 0
let cameraGun: GunId = 'ak47'
let cameraRevision = -1
let recoil = new RecoilPrediction(cameraGun)
export function syncCameraWeapon(gun: GunId, revision: number) {
  if(gun!==cameraGun || revision!==cameraRevision) { cameraGun=gun;cameraRevision=revision;recoil=new RecoilPrediction(gun) }
}
const aim: AimAngles = { yaw: -Math.PI / 2, pitch: 0 }

export function resetFpsCamera(nextRound: number, yaw = -Math.PI / 2) {
  spectating = false
  spectatorAnchor = undefined
  deathView = undefined
  damageView = undefined
  enteredChase = false
  round = nextRound
  wasLocked = false
  recoil = new RecoilPrediction(cameraGun)
  aim.yaw = yaw
  aim.pitch = 0
  if (camera === undefined) {
    camera = engine.addEntity()
    const feet = Transform.get(engine.PlayerEntity).position
    Transform.create(camera, { position: { x: feet.x, y: feet.y + 1.6, z: feet.z } })
    VirtualCamera.create(camera, { defaultTransition: { transitionMode: VirtualCamera.Transition.Time(0) } })
  }
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: camera })
}

export function setSpectatorView(active: boolean, anchor: Vector3 | undefined, nextRound: number, death?: { anchor: Vector3; startedAt: number }) {
  if (active && camera === undefined) resetFpsCamera(nextRound)
  spectating = active
  spectatorAnchor = anchor
  if (!active) {
    deathView = undefined
    enteredChase = false
  } else if (death && death.startedAt !== deathView?.startedAt) {
    deathView = death
    enteredChase = false
  }
}

export function receiveCameraKick(data: { round: number; shotId: number } & ConfirmedRecoil) {
  if (data.round === round) recoil.confirm(data.shotId, data, Date.now() / 1000)
}

export function receiveDamageKick(punch: VictimPunch) {
  damageView = { punch, startedAt: Date.now() / 1000 }
}

export function rejectCameraKick(data: { round: number; shotId: number }) {
  if (data.round === round) recoil.reject(data.shotId, Date.now() / 1000)
}

export function setCameraTrigger(held: boolean) { recoil.trigger(held, Date.now() / 1000) }
export function resetCameraAccuracy() { recoil.reload(Date.now() / 1000) }
export function pendingCameraShots(lastFiredShotId: number) { return recoil.pendingAfter(lastFiredShotId) }

export function predictCameraKick(shotId: number, speed: number) {
  const feet = Transform.get(engine.PlayerEntity).position
  const grounded = mapDistance({ x: feet.x, y: feet.y + 0.1, z: feet.z }, { x: 0, y: -1, z: 0 }, 0.35) < 0.3
  recoil.predict(shotId, Date.now() / 1000, speed, grounded)
}

// Send mouse aim alone: the server applies authoritative punch to the shot once.
export function getFpsAimDirection() { return aimDirection(aim) }

export function fpsCameraInputSystem() {
  if (camera === undefined) return
  const locked = PointerLock.getOrNull(engine.CameraEntity)?.isPointerLocked ?? false
  if (spectating && deathView && Date.now() / 1000 - deathView.startedAt < DEATH_TRANSITION_SECONDS) {
    wasLocked = locked
    return
  }
  if (locked && wasLocked) {
    const delta = PrimaryPointerInfo.getOrNull(engine.RootEntity)?.screenDelta
    if (delta) moveAim(aim, delta.x, delta.y)
  }
  wasLocked = locked
}

export function fpsCameraSystem() {
  if (camera === undefined) return
  const now = Date.now() / 1000
  const direction = aimDirection(aim, spectating ? undefined : recoil.punch(now))
  const pitch = Math.asin(direction.y)
  const yaw = Math.atan2(direction.x, direction.z)
  const pain = spectating || !damageView
    ? { pitch: 0, roll: 0 }
    : decayVictimPunch(damageView.punch, now - damageView.startedAt)
  const player = Transform.get(engine.PlayerEntity)
  const deathPose = deathView ? deathCameraPose(deathView.anchor, now - deathView.startedAt) : undefined
  const transitioning = spectating && deathPose && !deathPose.complete
  if (spectating && !transitioning && spectatorAnchor) enteredChase = true
  const holdingDeathView = spectating && !enteredChase && deathPose
  Transform.createOrReplace(camera, {
    position: spectating
      ? transitioning || holdingDeathView
        ? deathPose.position
        : spectatorAnchor ? chasePosition(spectatorAnchor, direction, mapDistance) : Transform.get(camera).position
      : { x: player.position.x, y: player.position.y + 1.6, z: player.position.z },
    rotation: Quaternion.fromEulerDegrees(
      -pitch * 180 / Math.PI - pain.pitch,
      yaw * 180 / Math.PI,
      transitioning || holdingDeathView ? deathPose.roll : pain.roll
    )
  })
}
