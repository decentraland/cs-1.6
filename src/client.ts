import {
  predictBulletImpacts,
  confirmBulletImpacts,
  rejectBulletImpacts,
  showBulletImpacts,
  updateBulletImpacts
} from './bullet-impacts'
import { canFight, canHandleWeapons } from './round-rules'
import { botBodyHitRegions } from './bot-model'
import { initializeNightVisionView } from './nightvision-client'
import { initializeCsMovement } from './cs-movement'
import { initializeCombatEffects, receivedHit } from './combat-effects'
import { initializePlayerSounds } from './player-sounds'
import { hitboxYaw } from './hit-regions'
import { initializeC4Effects } from './c4-effects'
import { initializeFootsteps, resetFootsteps } from './footsteps'
import { initializeGrenadeViews } from './grenade-view'
import { initializeDroppedWeaponViews } from './dropped-weapon-view'
import { grenadeInput } from './grenade-client'
import { beginBurst, advanceBurst, BurstState, EliteHandPrediction } from './weapon-modes'
import { canInterruptReload } from './combat-rules'
import { ReloadInput } from './reload-input'
import {
  engine,
  Entity,
  Transform,
  inputSystem,
  InputAction,
  PointerEventType,
  PlayerIdentityData,
  PointerLock,
  AvatarModifierArea,
  AvatarModifierType,
  AvatarShape
} from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import { myProfile, isStateSyncronized } from '@dcl/sdk/network'
import { movePlayerTo } from '~system/RestrictedActions'
import {
  PlayerHealth,
  PlayerPose,
  PlayerTeam,
  Team,
  Weapon,
  CrosshairState,
  DamageFeedback,
  PlayerAddress,
  Dead,
  Bot,
  ServerClock
} from './components'
import { delay } from './delaySystem'
import { room } from './index'
import { getPractice, canPlayRound } from './practice'
import { attachWeaponModel, updateWeaponView, predictKnifeAttack, predictWeaponShot } from './weapon-view'
import { bombInputSystem, hasBombSelected, isLocalBombBusy, getLocalDefuseState } from './bomb-client'
import { locomotionSystem, isWalking } from './locomotion'
import { GunProfile, gunProfile, modeStats, profileByName } from './weapon-profiles'
import { spectatorSystem, isSpectating } from './spectator'
import { isBuyMenuVisible } from './buy-client'
import { buyMenuInputSystem } from './buy-ui'
import { hasAimControl, isTouchPlatform } from './platform'
import {
  initializeCombatInput,
  fireInputAction,
  isCombatInputPressed,
  isCombatInputTriggered,
  updateTouchControlContext,
  cancelTouchAction
} from './combat-input'
import { TouchScreenControls } from '@dcl/sdk/ecs'
import { nativeTouchControls } from './touch-actions'
import { isTouchWalking, toggleTouchWalking } from './touch-movement'
import { touchOptions } from './menu-state'
import { HorizontalMotion, updateMovementCrosshair } from './movement-feedback'
import { worldWeaponSystem } from './world-weapons'
import { botAnimationSystem } from './bot-animation'
import { menuClickSystem } from './menu-ui'
import { nextClientShotTime } from './combat-rules'
import {
  syncCameraWeapon,
  fpsCameraSystem,
  fpsCameraInputSystem,
  resetFpsCamera,
  receiveCameraKick,
  receiveDamageKick,
  getFpsAimDirection,
  predictCameraKick,
  spawnedRound,
  rejectCameraKick,
  setCameraTrigger,
  resetCameraAccuracy,
  pendingCameraShots
} from './fps-camera'
import { fadePainDirections, mergePainDirections, painDirections } from './damage-feedback'
import { traceKnife, KnifeAttack, knifeDelays } from './knife-rules'
import { knifeFeedback, isKnifeSound } from './knife-feedback-rules'
import { fireSound, playLocalSound, playWorldSound, playShellReloadSound } from './weapon-sounds'
import { emptyFireInterval, emptyFireSound } from './empty-fire'
import { PLAYER_HIT_REGIONS, ShotPlan, ShotTarget, groundedAt, traceGunShot } from './ballistics'
import { teamMenuInputSystem } from './team-menu-ui'
import { isTeamMenuOpen, spectatorMenu } from './menu-state'

// Player registry: Maps player address to their entity
export const playerEntities = new Map<string, Entity>()

// Store local player entity
let localPlayerEntity: Entity | null = null

// Track if player is initialized and ready
let isPlayerReady = false

// Track if connected to server (for UI notification)
let isConnectedToServer = false
let connectionTime = 0

const localMotion = new HorizontalMotion()
let cursorRequest: Entity | undefined
let cursorReleased = false
let spectatorCapturePending = false

let isMouseButtonDown = false
let isSecondaryActionDown = false
let lastShotRequestTime = 0
let lastShotInterval: number | undefined
let nextShotId = 0
let triggerSequence = 0
let triggerHeld = false
let knifeNextPrimary = 0
let knifeNextSecondary = 0
const knifeRequests = new Map<
  number,
  { at: number; attack: KnifeAttack; round: number; revision: number; contact: boolean; target: boolean }
>()
let lastFacing = { x: 0, y: 0, z: 0 }
let lastFacingSentAt = 0

function updateTrigger(held: boolean) {
  if (held === triggerHeld) return
  triggerHeld = held
  setCameraTrigger(held)
  triggerSequence = Math.max(triggerSequence + 1, Date.now() * 1000)
  room.send('playerTrigger', { held, sequence: triggerSequence })
}

function facingSystem() {
  if (!isStateSyncronized() || !myProfile.userId) return
  const direction = getFpsAimDirection(),
    length = Math.hypot(direction.x, direction.y, direction.z)
  if (!Number.isFinite(length) || length < 0.001) return
  const normalized = { x: direction.x / length, y: direction.y / length, z: direction.z / length },
    now = Date.now() / 1000
  if (
    now - lastFacingSentAt < 1 &&
    normalized.x * lastFacing.x + normalized.y * lastFacing.y + normalized.z * lastFacing.z > 0.9995
  )
    return
  lastFacing = normalized
  lastFacingSentAt = now
  room.send('playerFacing', { direction: normalized })
}

export function getLocalPlayerEntity(): Entity | null {
  return localPlayerEntity
}

export function isLocalPlayerReady(): boolean {
  return isPlayerReady
}

export function capturePointer() {
  if (isTouchPlatform()) return
  if (cursorRequest !== undefined) engine.removeEntity(cursorRequest)
  cursorRequest = engine.addEntity()
  PointerLock.create(cursorRequest, { isPointerLocked: true })
  requestCameraPointerLock()
  cursorReleased = false
}

// Unity only honours PointerLock on the camera entity; Bevy reacts to any changed PointerLock, so a
// short-lived request entity carries the same value.
export function requestCameraPointerLock(locked = true) {
  PointerLock.createOrReplace(engine.CameraEntity, { isPointerLocked: locked })
}
export function requestPointerLock(locked: boolean) {
  const request = engine.addEntity()
  PointerLock.create(request, { isPointerLocked: locked })
  delay(1000, () => engine.removeEntity(request))
  requestCameraPointerLock(locked)
}

export function isConnected(): boolean {
  return isConnectedToServer
}

export function getConnectionTime(): number {
  return connectionTime
}

// Called when we receive our player spawn data from server
export function initializeLocalPlayerData(team: Team) {
  if (!localPlayerEntity) return

  // Mark player as ready
  isPlayerReady = true

  console.log('[CLIENT] Local player initialized with team:', team)

  attachWeaponModel()
}

export function damageFeedbackSystem(dt: number) {
  const player = getLocalPlayerEntity()
  if (!player || !DamageFeedback.has(player)) return
  const feedback = DamageFeedback.getMutable(player)
  const faded = fadePainDirections(feedback, dt)
  feedback.front = faded.front
  feedback.right = faded.right
  feedback.rear = faded.rear
  feedback.left = faded.left
}

export function crosshairSystem(dt: number) {
  const player = getLocalPlayerEntity()
  const position = Transform.getOrNull(engine.PlayerEntity)?.position
  if (player === null || !position || !CrosshairState.has(player)) return
  const crosshair = CrosshairState.getMutable(player)
  const speed = localMotion.sample(position, Date.now() / 1000)
  updateMovementCrosshair(crosshair, speed, isWalking(), dt)
}

function expandCrosshair(player: Entity, amount: number) {
  const crosshair = CrosshairState.getMutableOrNull(player)
  if (!crosshair) return
  crosshair.spread = Math.min(1, crosshair.spread + amount)
  crosshair.lastShotTime = Date.now() / 1000
}

export function requestWeaponAlternate() {
  const player = getLocalPlayerEntity(),
    match = getPractice()
  const weapon = player === null ? undefined : Weapon.getOrNull(player)
  if (
    player === null ||
    !weapon ||
    !match ||
    !canHandleWeapons(match) ||
    Dead.has(player) ||
    isBuyMenuVisible() ||
    isTeamMenuOpen() ||
    hasBombSelected() ||
    isLocalBombBusy()
  )
    return
  const profile = profileByName(weapon.name)
  if (profile.kind === 'gun' && profile.alternate)
    room.send('weaponAlternate', { round: match.round, revision: weapon.revision })
}

// Global shooting system - shoot while holding mouse button
const reloadInput = new ReloadInput()
const eliteHands = new EliteHandPrediction()
let captureReleased = false
export const isFireInputReady = () => hasAimControl() && !isBuyMenuVisible() && (isTouchPlatform() || captureReleased)
let semiFired = false
let dryFired = false
let firingRevision = -1
let localBurst: (BurstState & { spread: number }) | undefined
export function globalShootingSystem() {
  const player = getLocalPlayerEntity()
  if (!player || !isStateSyncronized()) {
    reloadInput.reset()
    return
  }

  const equipped = Weapon.getOrNull(player)
  if (!equipped) {
    reloadInput.reset()
    return
  }
  const profile = profileByName(equipped.name)
  if (equipped.revision !== firingRevision) {
    reloadInput.reset()
    firingRevision = equipped.revision
    eliteHands.reset()
    localBurst = undefined
    semiFired = false
    dryFired = false
    lastShotRequestTime = 0
    lastShotInterval = undefined
    knifeNextPrimary = equipped.deployedTimers?.primary ?? 0
    knifeNextSecondary = equipped.deployedTimers?.secondary ?? 0
    knifeRequests.clear()
    updateTrigger(false)
  }
  if (isBuyMenuVisible() || isTeamMenuOpen()) {
    if (profile.kind === 'grenade') grenadeInput(player, false)
    captureReleased = false
    isMouseButtonDown = false
    isSecondaryActionDown = false
    reloadInput.reset()
    updateTrigger(false)
    return
  }
  if (!hasAimControl()) {
    if (profile.kind === 'grenade') grenadeInput(player, false)
    captureReleased = false
    const practice = getPractice()
    if (
      (canPlayRound(myProfile.userId?.toLowerCase() ?? '') || isSpectating()) &&
      practice &&
      canHandleWeapons(practice) &&
      inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN)
    ) {
      const request = engine.addEntity()
      PointerLock.create(request, { isPointerLocked: true })
      delay(1000, () => engine.removeEntity(request))
    }
    isMouseButtonDown = false
    isSecondaryActionDown = false
    reloadInput.reset()
    updateTrigger(false)
    return
  }

  if (Dead.has(player)) {
    if (profile.kind === 'grenade') grenadeInput(player, false)
    isMouseButtonDown = false
    isSecondaryActionDown = false
    semiFired = false
    localBurst = undefined
    reloadInput.reset()
    updateTrigger(false)
    return
  }

  // Suppress a held capture click; automatic capture needs no new release event.
  if (!isTouchPlatform() && !captureReleased) {
    if (profile.kind === 'grenade') grenadeInput(player, false)
    captureReleased = !inputSystem.isPressed(InputAction.IA_POINTER)
    isMouseButtonDown = false
    isSecondaryActionDown = false
    reloadInput.reset()
    updateTrigger(false)
    return
  }

  isMouseButtonDown =
    isCombatInputPressed(fireInputAction()) || isCombatInputTriggered(fireInputAction(), PointerEventType.PET_DOWN)

  isSecondaryActionDown =
    isCombatInputPressed(InputAction.IA_SECONDARY) ||
    isCombatInputTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)

  if (
    profile.kind === 'gun' &&
    profile.alternate &&
    !hasBombSelected() &&
    !isLocalBombBusy() &&
    !isTouchPlatform() &&
    inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)
  ) {
    requestWeaponAlternate()
  }

  if (profile.kind === 'grenade') {
    updateTrigger(false)
    grenadeInput(player, !hasBombSelected() && !isLocalBombBusy() && isMouseButtonDown)
    return
  }
  if (profile.kind === 'knife') {
    updateTrigger(false)
    const attack: KnifeAttack | undefined = isSecondaryActionDown ? 'stab' : isMouseButtonDown ? 'swing' : undefined
    if (!attack || !canUseKnife(player)) return
    const now = Date.now() / 1000
    if (now < (attack === 'swing' ? knifeNextPrimary : knifeNextSecondary)) return
    for (const [id, request] of knifeRequests) if (now - request.at > 2) knifeRequests.delete(id)
    const direction = getFpsAimDirection(),
      feet = Transform.get(engine.PlayerEntity).position
    const origin = { x: feet.x, y: feet.y + 1.6, z: feet.z }
    const targets = localShotTargets()
    const trace = traceKnife(origin, direction, targets, attack)
    const observed = trace?.hit && targets.find((target) => target.id === trace.hit!.target)
    const contact = trace?.contact ?? false,
      target = !!trace?.hit
    const delays = knifeDelays(attack, contact)
    knifeNextPrimary = now + delays.primary
    knifeNextSecondary = now + delays.secondary
    nextShotId = Math.max(nextShotId, equipped.lastShotId) + 1
    const round = getPractice()!.round
    knifeRequests.set(nextShotId, { at: now, attack, round, revision: equipped.revision, contact, target })
    predictKnifeAttack(attack, contact)
    const feedback = knifeFeedback(attack, contact, target)
    if (!target) playLocalSound(feedback.sound, 1, feedback.pitch)
    room.send('knifeAttack', {
      round,
      shotId: nextShotId,
      revision: equipped.revision,
      attack,
      direction,
      view: {
        origin,
        speed: localMotion.speed,
        target: observed?.id,
        targetPosition: observed?.center,
        seenAt: serverClock()
      }
    })
    return
  }

  const firing = !hasBombSelected() && !isLocalBombBusy() && isMouseButtonDown
  updateTrigger(firing)
  if (!firing) semiFired = false

  if (!firing) dryFired = false
  // Shoot continuously while the mouse button is held
  const currentTime = Date.now() / 1000
  const match = getPractice()
  if (
    match &&
    reloadInput.request(equipped, {
      held: isSecondaryActionDown,
      firing,
      active:
        !isSyncStale() &&
        !hasBombSelected() &&
        !isLocalBombBusy() &&
        canHandleWeapons(match) &&
        canPlayRound(myProfile.userId?.toLowerCase() ?? ''),
      now: currentTime,
      blockedUntil: Math.max(lastShotRequestTime + (lastShotInterval ?? equipped.fireRate), localBurst?.readyAt ?? 0),
      round: match.round
    })
  )
    room.send('playerReload', { round: match.round, revision: equipped.revision })
  const burstMode = profile.alternate === 'burst' && equipped.mode === 1
  const automatic = modeStats(profile, equipped.mode).automatic
  if (!burstMode || (localBurst && currentTime > localBurst.readyAt + 0.5)) localBurst = undefined
  const continuation = !!localBurst && localBurst.remaining > 0
  if (
    (continuation || (firing && (automatic || !semiFired))) &&
    (!localBurst || currentTime >= (continuation ? localBurst.nextAt : localBurst.readyAt))
  ) {
    const empty = equipped.ammoClip <= 0
    if (!canShoot(player, continuation, !continuation)) return
    if (empty) {
      lastShotRequestTime = nextClientShotTime(lastShotRequestTime, lastShotInterval ?? equipped.fireRate, currentTime)
      lastShotInterval = emptyFireInterval(profile)
      localBurst = undefined
      if (!profile.shellReload || !dryFired) playLocalSound(emptyFireSound(profile), 0.8)
      dryFired = true
      if (!automatic) semiFired = true
      nextShotId = Math.max(nextShotId, equipped.lastShotId) + 1
      const feet = Transform.get(engine.PlayerEntity).position
      room.send('playerShoot', {
        burstIndex: 0,
        shotId: nextShotId,
        revision: equipped.revision,
        direction: getFpsAimDirection(),
        origin: { x: feet.x, y: feet.y + 1.6, z: feet.z },
        speed: localMotion.speed,
        grounded: groundedAt(feet),
        seenAt: serverClock()
      })
      return
    }
    dryFired = false
    if (!continuation) {
      lastShotRequestTime = nextClientShotTime(lastShotRequestTime, lastShotInterval ?? equipped.fireRate, currentTime)
      lastShotInterval = equipped.fireRate
    }
    nextShotId = Math.max(nextShotId, Weapon.get(player).lastShotId) + 1
    const shotId = nextShotId
    expandCrosshair(player, 0.15)
    const feet = Transform.get(engine.PlayerEntity).position
    const burstIndex = continuation ? (localBurst?.index ?? 0) : 0
    const firingMode = profile.id === 'elite' ? eliteHands.fire(equipped, match!.round, shotId) : equipped.mode
    const plan = predictCameraKick(shotId, localMotion.speed, continuation ? localBurst?.spread : undefined, firingMode)
    if (!continuation)
      predictWeaponShot(
        Math.max(0, equipped.ammoClip - pendingCameraShots(equipped.lastFiredShotId)),
        equipped.reloadStartTime,
        firingMode
      )
    playLocalSound(fireSound(profile.id, equipped.mode))
    const claim = plan
      ? predictShotImpact(shotId, plan, {
          gun: profile,
          mode: equipped.mode,
          zoom: equipped.zoom,
          continuation
        })
      : undefined

    if (!automatic) semiFired = true
    // Tell the server what this client saw; it validates each value against recent samples (hit-claims.ts).
    room.send('playerShoot', {
      burstIndex,
      shotId,
      revision: equipped.revision,
      direction: getFpsAimDirection(),
      origin: { x: feet.x, y: feet.y + 1.6, z: feet.z },
      speed: localMotion.speed,
      grounded: groundedAt(feet),
      target: claim?.target,
      targetPosition: claim?.center,
      seenAt: serverClock()
    })
    if (continuation && localBurst) advanceBurst(localBurst, currentTime)
    else if (burstMode) {
      const next = beginBurst(
        profile,
        equipped.mode,
        equipped.ammoClip - pendingCameraShots(equipped.lastFiredShotId) + 1,
        currentTime
      )
      if (next) localBurst = { ...next, spread: profile.id === 'glock18' ? 0.05 : (plan?.spread ?? 0) }
    }
  }
}

function canUseKnife(player: Entity): boolean {
  if (
    !isStateSyncronized() ||
    isSyncStale() ||
    !PlayerPose.getOrNull(player)?.valid ||
    Dead.has(player) ||
    (PlayerHealth.getOrNull(player)?.current ?? 0) <= 0
  )
    return false
  const practice = getPractice(),
    weapon = Weapon.getOrNull(player)
  return (
    canFight(practice) &&
    canPlayRound(myProfile.userId?.toLowerCase() ?? '') &&
    !!weapon &&
    !weapon.isReloading &&
    Date.now() / 1000 >= weapon.readyAt &&
    !hasBombSelected() &&
    !isLocalBombBusy()
  )
}

// Check if player can shoot
function canShoot(player: Entity, continuation = false, allowEmpty = false): boolean {
  if (
    !isStateSyncronized() ||
    isSyncStale() ||
    !PlayerPose.getOrNull(player)?.valid ||
    !Weapon.has(player) ||
    Dead.has(player) ||
    (PlayerHealth.getOrNull(player)?.current ?? 0) <= 0
  )
    return false

  const practice = getPractice()
  if (!canFight(practice) || !canPlayRound(myProfile.userId?.toLowerCase() ?? '')) return false
  const weapon = Weapon.get(player)
  const currentTime = Date.now() / 1000

  // Check if reloading
  if ((weapon.isReloading && !canInterruptReload(weapon, currentTime)) || currentTime < weapon.readyAt) return false

  // Check if no ammo
  if (weapon.ammoClip <= 0) {
    if (!allowEmpty) return false
  } else if (pendingCameraShots(weapon.lastFiredShotId) >= weapon.ammoClip) return false

  if (!continuation && currentTime < (weapon.deployedTimers?.primary ?? 0)) return false

  // Check fire rate cooldown
  if (
    !continuation &&
    currentTime - lastShotRequestTime < (lastShotInterval ?? weapon.fireRate) &&
    !(localBurst && currentTime >= localBurst.readyAt)
  )
    return false

  return true
}

// Practice.timeLeft ticks every second outside the lobby, so a frozen match state means this client
// stopped receiving updates (app suspended, comms hiccup). Ask the server to re-send everything.
const STALE_SECONDS = 8
let matchSignature = ''
let matchChangedAt = 0
let lastResyncAt = 0
let lastTick = 0
let syncStale = false
export function isSyncStale() {
  return syncStale
}
function staleSyncSystem() {
  const now = Date.now() / 1000
  const resumed = lastTick > 0 && now - lastTick > 5
  lastTick = now
  const match = getPractice()
  const signature = match
    ? `${match.phase}:${match.round}:${match.timeLeft}:${match.remaining}:${match.roster.length}`
    : ''
  if (signature !== matchSignature) {
    matchSignature = signature
    matchChangedAt = now
    syncStale = false
  }
  const ticking = !!match && !match.matchOver && !['ready', 'waiting'].includes(match.phase)
  syncStale = ticking && now - matchChangedAt > STALE_SECONDS
  if (!(syncStale || resumed) || !isStateSyncronized() || now - lastResyncAt < 5) return
  lastResyncAt = now
  const player = getLocalPlayerEntity()
  const missedSpawn = !!match && player !== null && !Dead.has(player) && spawnedRound() !== match.round
  room.send('resync', { missedSpawn })
}

// Newest server time applied on this client, i.e. the state the bots are drawn at.
function serverClock(): number | undefined {
  for (const [, clock] of engine.getEntitiesWith(ServerClock)) return clock.now
  return undefined
}

function avatarPositionOf(address: string): Vector3 | undefined {
  for (const [, identity, transform] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
    if (identity.address.toLowerCase() === address) return transform.position
  }
  return undefined
}

function localShotTargets(): ShotTarget<string>[] {
  const targets: ShotTarget<string>[] = []
  for (const [entity, bot] of engine.getEntitiesWith(Bot, Transform)) {
    if (!bot.alive) continue
    targets.push({
      id: `bot:${bot.index}`,
      center: Transform.get(entity).position,
      yaw: hitboxYaw(Transform.get(entity).rotation),
      regions: botBodyHitRegions(entity, Date.now() / 1000)
    })
  }
  const me = myProfile.userId?.toLowerCase()
  for (const [, identity, transform] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
    const address = identity.address.toLowerCase()
    if (address === me) continue
    const player = playerEntities.get(address)
    if (player !== undefined && Dead.has(player)) continue
    targets.push({
      id: address,
      center: transform.position,
      yaw: hitboxYaw(transform.rotation),
      regions: PLAYER_HIT_REGIONS
    })
  }
  return targets
}

function predictShotImpact(
  shotId: number,
  plan: ShotPlan,
  weapon: { gun: GunProfile; mode: number; zoom: number; continuation: boolean }
): { target: string; center: Vector3 } | undefined {
  const targets = localShotTargets()
  const trace = traceGunShot({
    gun: weapon.gun.id,
    plan,
    mode: weapon.mode,
    zoom: weapon.zoom,
    continuation: weapon.continuation,
    damage:
      weapon.continuation && weapon.gun.id === 'famas' ? 30 : modeStats(weapon.gun, weapon.mode, weapon.zoom).damage,
    targets
  })
  predictBulletImpacts(shotId, trace.impacts)
  const hit = trace.impacts.find((impact) => impact.hit && impact.damage > 0)?.hit
  const target = hit && targets.find((target) => target.id === hit.target)
  return target ? { target: target.id, center: target.center } : undefined
}

// Client message handlers
export function setupClientMessageHandlers() {
  engine.addSystem(() => updateBulletImpacts(getPractice()?.round ?? 0))
  room.onMessage('latencyProbe', (data) => {
    // Room authenticates server messages before invoking client callbacks without context.
    if (!isStateSyncronized()) return
    room.send('latencyEcho', { token: data.token })
  })
  cursorRequest = engine.addEntity()
  engine.addSystem(() => {
    if (isTouchPlatform()) return
    const match = getPractice()
    const address = myProfile.userId?.toLowerCase()
    const seat = match?.roster.find((seat) => seat.address === address && seat.connected)
    const locked = PointerLock.getOrNull(engine.CameraEntity)?.isPointerLocked
    const observer =
      !!seat &&
      (seat.team === 0 || (isSpectating() && !(match?.phase === 'freeze' && seat.eligibleRound <= match.round)))
    spectatorMenu.update(
      observer &&
        !match?.matchOver &&
        !!match &&
        (seat?.team === 0 || ['freeze', 'live', 'won', 'lost', 'draw'].includes(match.phase)),
      locked === true
    )
    const menuOpen = isTeamMenuOpen() || isBuyMenuVisible()
    if (menuOpen && (!cursorReleased || locked !== false)) {
      PointerLock.createOrReplace(cursorRequest!, { isPointerLocked: false })
      requestCameraPointerLock(false)
      cursorReleased = true
    } else if (!menuOpen) {
      if (spectatorCapturePending && seat?.team === 0) {
        capturePointer()
        spectatorCapturePending = false
      } else cursorReleased = false
    }
  })
  room.onMessage('practiceSpawn', (data) => {
    if (data.playerAddress !== myProfile.userId?.toLowerCase()) return
    movePlayerTo({
      newRelativePosition: data.position,
      cameraTarget: {
        x: data.position.x + Math.sin(data.yaw) * 10,
        y: data.position.y + 1.6,
        z: data.position.z + Math.cos(data.yaw) * 10
      }
    })
    resetFpsCamera(data.round, data.yaw, data.seed)
    spectatorCapturePending = false
    localMotion.reset()
    resetFootsteps()
    capturePointer()
    isMouseButtonDown = false
    isSecondaryActionDown = false
    lastFacingSentAt = 0
    updateTrigger(false)
  })
  room.onMessage('spectatorStart', (data) => {
    if (data.playerAddress !== myProfile.userId?.toLowerCase()) return
    spectatorCapturePending = true
    localMotion.reset()
    resetFootsteps()
    isMouseButtonDown = false
    isSecondaryActionDown = false
    updateTrigger(false)
  })
  room.onMessage('practiceShot', (data) => {
    if (data.round !== getPractice()?.round) return
    const mine = data.owner === myProfile.userId?.toLowerCase()
    if (mine) {
      if (data.impacts) confirmBulletImpacts(data.shotId, data.impacts)
      receiveCameraKick(data)
      if (data.fire?.gun === 'elite') eliteHands.confirm(data.shotId, data.fire.mode)
    } else {
      if (data.impacts) showBulletImpacts(data.impacts)
      const entity = playerEntities.get(data.owner)
      const weapon = entity === undefined ? undefined : Weapon.getOrNull(entity)
      const gun = data.fire ? gunProfile(data.fire.gun) : weapon && profileByName(weapon.name)
      const origin = data.fire?.origin ?? avatarPositionOf(data.owner)
      if (origin && gun?.kind === 'gun') playWorldSound(fireSound(gun.id, data.fire?.mode ?? weapon?.mode ?? 0), origin)
    }
  })
  room.onMessage('weaponReloadSound', (data) => {
    if (data.round !== getPractice()?.round || !Number.isInteger(data.volume) || data.volume <= 0 || data.volume > 255)
      return
    playLocalSound('reload', data.volume / 255)
  })
  room.onMessage('shellReloadSound', (data) => {
    if (
      data.round !== getPractice()?.round ||
      (data.variant !== 1 && data.variant !== 3) ||
      !Number.isInteger(data.pitch) ||
      data.pitch < 85 ||
      data.pitch > 116 ||
      ![data.position.x, data.position.y, data.position.z].every(Number.isFinite)
    )
      return
    playShellReloadSound(
      data.owner,
      data.variant,
      data.position,
      data.owner === myProfile.userId?.toLowerCase(),
      data.pitch / 100
    )
  })
  room.onMessage('weaponDryFire', (data) => {
    if (data.owner === myProfile.userId?.toLowerCase() || data.round !== getPractice()?.round) return
    const gun = gunProfile(data.gun)
    if (gun) playWorldSound(emptyFireSound(gun), data.position, 0.8)
  })
  room.onMessage('shotRejected', (data) => {
    if (data.owner === myProfile.userId?.toLowerCase()) {
      rejectCameraKick(data)
      if (data.round === getPractice()?.round) {
        rejectBulletImpacts(data.shotId)
        eliteHands.reject(data.shotId)
      }
    }
  })
  room.onMessage('knifeResult', (data) => {
    if (data.round !== getPractice()?.round || (data.attack !== 'swing' && data.attack !== 'stab')) return
    const feedback = data.feedback
    if (feedback && !isKnifeSound(feedback.sound)) return
    if (data.owner !== myProfile.userId?.toLowerCase()) {
      if (feedback && isKnifeSound(feedback.sound)) playWorldSound(feedback.sound, feedback.origin, 1, feedback.pitch)
      return
    }
    const request = knifeRequests.get(data.shotId)
    if (!request) return
    knifeRequests.delete(data.shotId)
    const player = getLocalPlayerEntity(),
      weapon = player === null ? undefined : Weapon.getOrNull(player)
    if (
      player === null ||
      Dead.has(player) ||
      weapon?.name !== 'Knife' ||
      weapon.revision !== request.revision ||
      request.round !== data.round ||
      request.attack !== data.attack ||
      Date.now() / 1000 - request.at > 2
    )
      return
    const delays = knifeDelays(data.attack, data.contact)
    knifeNextPrimary = Math.max(knifeNextPrimary, request.at + delays.primary)
    knifeNextSecondary = Math.max(knifeNextSecondary, request.at + delays.secondary)
    if (request.target || request.contact !== data.contact || request.target !== data.target) {
      const corrected = feedback ?? knifeFeedback(data.attack, data.contact, data.target)
      if (isKnifeSound(corrected.sound)) playLocalSound(corrected.sound, 1, corrected.pitch)
    }
  })
  room.onMessage('practiceAttack', (data) => {
    if (data.round !== undefined && data.round !== getPractice()?.round) return
    const gun = gunProfile(data.fire?.gun ?? data.gun ?? 'ak47')
    if (gun) playWorldSound(fireSound(gun.id, data.fire?.mode ?? 0), data.fire?.origin ?? data.origin)
    if (data.impacts) showBulletImpacts(data.impacts)
  })
  let lastJoinAttempt = 0
  engine.addSystem(staleSyncSystem)
  engine.addSystem(() => {
    if (!isStateSyncronized() || !myProfile.userId) return
    const hasPlayer = localPlayerEntity !== null && PlayerAddress.has(localPlayerEntity)
    if (!hasPlayer) {
      localPlayerEntity = null
      isPlayerReady = false
      isConnectedToServer = false
    }
    const now = Date.now()
    if (now - lastJoinAttempt < (hasPlayer ? 5000 : 2000)) return
    lastJoinAttempt = now
    room.send('playerJoin', {})
  })

  // CLIENT: System to detect synced player entities and identify ourselves
  engine.addSystem(() => {
    // Look for player entities that have been synced from server
    for (const [entity, address, health, team] of engine.getEntitiesWith(
      PlayerAddress,
      PlayerHealth,
      PlayerTeam,
      Weapon
    )) {
      const playerAddr = address.address.toLowerCase()

      // Check if this is a new entity we haven't seen before
      if (
        playerEntities.get(playerAddr) !== entity ||
        (localPlayerEntity === null && playerAddr === myProfile.userId?.toLowerCase())
      ) {
        playerEntities.set(playerAddr, entity)
        console.log('[CLIENT] Detected synced player entity:', playerAddr)

        // Check if this is our own entity by comparing with our actual userId
        const myUserId = myProfile.userId?.toLowerCase() // Ensure lowercase

        if (myUserId && playerAddr.toLowerCase() === myUserId) {
          // This is our local player!
          localPlayerEntity = entity

          // Mark as connected to server
          isConnectedToServer = true
          connectionTime = Date.now() / 1000

          console.log('[CLIENT] Connected to server! This is our player:', playerAddr)

          // Initialize weapon based on team
          initializeLocalPlayerData(team.team)

          // Add client-only components
          CrosshairState.create(entity, {
            spread: 0,
            baseSpread: 0,
            maxSpread: 1,
            lastShotTime: 0,
            isMoving: false,
            consecutiveShots: 0,
            movementIntensity: 0
          })

          DamageFeedback.create(entity, {
            front: 0,
            right: 0,
            rear: 0,
            left: 0
          })
        } else if (myUserId && playerAddr.toLowerCase() !== myUserId) {
          // This is a remote player
          // Note: Player avatars are already rendered by Decentraland
          console.log('[CLIENT] Detected remote player')
        }
      }
    }
  })

  // CLIENT: Listen for damage confirmations
  room.onMessage('damageConfirmed', (data) => {
    if (data.kind === 'fall') return
    console.log('[CLIENT] <<< Received damageConfirmed:', data)

    const targetAddress = data.targetPlayerAddress
    const player = getLocalPlayerEntity()

    // Show damage indicator if it's us
    const myUserId = myProfile.userId?.toLowerCase()
    if (myUserId && targetAddress.toLowerCase() === myUserId && player) {
      receivedHit()
      const playerPosition = Transform.get(engine.PlayerEntity).position
      const feedback = DamageFeedback.getMutable(player)
      const next = mergePainDirections(feedback, painDirections(data.origin, playerPosition, getFpsAimDirection()))
      feedback.front = next.front
      feedback.right = next.right
      feedback.rear = next.rear
      feedback.left = next.left
      if (data.punchPitch || data.punchRoll) receiveDamageKick({ pitch: data.punchPitch, roll: data.punchRoll })

      if (data.wasKill) {
        console.log('[CLIENT] You died!')
      }
    }
  })
}

// Add client systems to engine
export function addClientSystems() {
  initializeCombatInput()
  initializeCombatEffects()
  initializeDroppedWeaponViews()
  initializeGrenadeViews()
  initializeC4Effects()
  initializeFootsteps()
  engine.addSystem(touchControlsSystem)
  initializePlayerSounds()
  initializeNightVisionView()
  initializeCsMovement()
  const gameArea = engine.addEntity()
  Transform.create(gameArea, { position: { x: 96, y: 64, z: 96 } })
  AvatarModifierArea.create(gameArea, {
    area: { x: 192, y: 128, z: 192 },
    modifiers: [AvatarModifierType.AMT_DISABLE_PASSPORTS],
    excludeIds: []
  })
  // The live VirtualCamera trails the avatar by a frame, so hide only our own avatar (client-local entity).
  const selfArea = engine.addEntity()
  Transform.create(selfArea, { parent: engine.PlayerEntity, position: { x: 0, y: 1, z: 0 } })
  AvatarModifierArea.create(selfArea, {
    area: { x: 1, y: 2.5, z: 1 },
    modifiers: [AvatarModifierType.AMT_HIDE_AVATARS, AvatarModifierType.AMT_HIDE_NAMETAGS],
    excludeIds: []
  })
  let excluded = ''
  engine.addSystem(() => {
    const me = myProfile.userId?.toLowerCase()
    const others: string[] = []
    for (const [, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
      if (identity.address.toLowerCase() !== me) others.push(identity.address)
    }
    for (const [, avatar] of engine.getEntitiesWith(AvatarShape)) if (avatar.id) others.push(avatar.id)
    const key = others.join(',')
    if (key === excluded) return
    excluded = key
    AvatarModifierArea.getMutable(selfArea).excludeIds = others
  })
  let wasReloading = false
  engine.addSystem(() => {
    if (localPlayerEntity === null) return
    const equipped = Weapon.getOrNull(localPlayerEntity)
    const profile = equipped && profileByName(equipped.name)
    if (equipped)
      syncCameraWeapon(
        profile?.kind === 'gun' && !hasBombSelected() ? profile.id : 'ak47',
        equipped.revision,
        equipped.mode,
        hasBombSelected() ? 90 : equipped.zoom,
        equipped.lastFiredShotId,
        equipped.deployedAccuracy
      )
    const reloading = equipped?.isReloading ?? false
    if (reloading && !wasReloading) {
      resetCameraAccuracy()
    }
    wasReloading = reloading
    updateWeaponView(localPlayerEntity)
  })
  engine.addSystem(fpsCameraInputSystem)
  engine.addSystem(facingSystem)
  engine.addSystem(spectatorSystem)
  engine.addSystem(bombInputSystem)
  engine.addSystem(locomotionSystem)
  engine.addSystem(damageFeedbackSystem)
  engine.addSystem(crosshairSystem)
  engine.addSystem(globalShootingSystem)
  engine.addSystem(fpsCameraSystem)
  engine.addSystem(worldWeaponSystem)
  engine.addSystem(botAnimationSystem)
  engine.addSystem(menuClickSystem)
  engine.addSystem(teamMenuInputSystem)
  engine.addSystem(buyMenuInputSystem)
}

let touchControlsApplied = ''
function touchControlsSystem() {
  if (!isTouchPlatform()) return
  const player = getLocalPlayerEntity(),
    match = getPractice(),
    weapon = player === null ? undefined : Weapon.getOrNull(player)
  const controls = hasBombSelected() ? 'c4' : weapon ? profileByName(weapon.name).kind : 'none'
  updateTouchControlContext(
    `${match?.round}:${canFight(match) ? 'combat' : match?.matchOver ? 'finished' : match?.phase}:${player === null || Dead.has(player)}:${isBuyMenuVisible()}:${isTeamMenuOpen()}:${!isStateSyncronized() || isSyncStale()}:${controls}:${touchOptions.open}`
  )
  const enabled =
    player !== null &&
    !!weapon &&
    !Dead.has(player) &&
    (PlayerHealth.getOrNull(player)?.current ?? 0) > 0 &&
    !!match &&
    canHandleWeapons(match) &&
    !isBuyMenuVisible() &&
    !isTeamMenuOpen() &&
    !touchOptions.open &&
    isStateSyncronized() &&
    !isSyncStale()
  if (enabled) {
    if (isCombatInputTriggered(InputAction.IA_ACTION_3, PointerEventType.PET_DOWN)) toggleTouchWalking()
    if (isCombatInputTriggered(InputAction.IA_ACTION_4, PointerEventType.PET_DOWN)) requestWeaponAlternate()
  }
  if (getLocalDefuseState() === 'none') cancelTouchAction(InputAction.IA_PRIMARY)
  const config = nativeTouchControls(enabled, weapon, hasBombSelected(), isTouchWalking())
  const key = JSON.stringify(config)
  if (key === touchControlsApplied) return
  touchControlsApplied = key
  TouchScreenControls.createOrReplace(engine.RootEntity, config)
}
