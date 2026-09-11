import {
  engine,
  AvatarAttach,
  AvatarAnchorPointType,
  Entity,
  Transform,
  Material,
  MeshRenderer,
  inputSystem,
  InputAction,
  PointerEventType,
  PlayerIdentityData,
  PointerLock,
  AvatarModifierArea,
  AvatarModifierType,
  AudioSource
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { myProfile, isStateSyncronized } from '@dcl/sdk/network'
import { movePlayerTo } from '~system/RestrictedActions'
import {
  PlayerHealth,
  PlayerTeam,
  Team,
  Weapon,
  DamageIndicator,
  CrosshairState,
  DamageFeedback,
  PlayerAddress,
  Dead
} from './components'
import { delay } from './delaySystem'
import { room } from './index'
import { getPractice, canPlayRound } from './practice'
import { attachWeaponModel, updateWeaponView, predictKnifeAttack, predictWeaponShot } from './weapon-view'
import { bombInputSystem, hasBombSelected, isLocalBombBusy } from './bomb-client'
import { locomotionSystem, isWalking } from './locomotion'
import { profileByName } from './weapon-profiles'
import { syncCameraWeapon } from './fps-camera'
import { spectatorSystem, isSpectating } from './spectator'
import { isBuyMenuVisible } from './buy-client'
import { HorizontalMotion, updateMovementCrosshair } from './movement-feedback'
import { nextClientShotTime } from './combat-rules'
import { fpsCameraSystem, fpsCameraInputSystem, resetFpsCamera, receiveCameraKick, receiveDamageKick, getFpsAimDirection, predictCameraKick, rejectCameraKick, setCameraTrigger, resetCameraAccuracy, pendingCameraShots } from './fps-camera'
import { fadePainDirections, mergePainDirections, painDirections } from './damage-feedback'
import type { KnifeAttack } from './knife-rules'

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
let damageSound: Entity | undefined
let cursorRequest: Entity | undefined
let cursorReleased = false
let spectatorCapturePending = false

// Track if mouse button or E button is held down
let isMouseButtonDown = false
let isPrimaryActionDown = false
let isSecondaryActionDown = false
let lastShotRequestTime = 0
let nextShotId = 0
let triggerSequence = 0
let triggerHeld = false
let knifeNextPrimary = 0
let knifeNextSecondary = 0
const knifeRequests = new Map<number,{at:number;attack:KnifeAttack}>()
let lastFacing={x:0,z:0}
let lastFacingSentAt=0

function updateTrigger(held: boolean) {
  if (held === triggerHeld) return
  triggerHeld = held
  setCameraTrigger(held)
  triggerSequence = Math.max(triggerSequence + 1, Date.now() * 1000)
  room.send('playerTrigger', { held, sequence: triggerSequence })
}

function facingSystem() {
  if(!isStateSyncronized()||!myProfile.userId)return
  const direction=getFpsAimDirection(),length=Math.hypot(direction.x,direction.z)
  if(!Number.isFinite(length)||length<.001)return
  const horizontal={x:direction.x/length,z:direction.z/length},now=Date.now()/1000
  if(now-lastFacingSentAt<1&&horizontal.x*lastFacing.x+horizontal.z*lastFacing.z>.9995)return
  lastFacing=horizontal
  lastFacingSentAt=now
  room.send('playerFacing',{direction:{x:horizontal.x,y:0,z:horizontal.z}})
}

export function getLocalPlayerEntity(): Entity | null {
  return localPlayerEntity
}

export function isLocalPlayerReady(): boolean {
  return isPlayerReady
}

function capturePointer() {
  if (cursorRequest !== undefined) engine.removeEntity(cursorRequest)
  cursorRequest = engine.addEntity()
  PointerLock.create(cursorRequest, { isPointerLocked: true })
  cursorReleased = false
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

// Map to track team markers for each player
const teamMarkers = new Map<string, Entity>()

// Teammate marker system - shows green triangle above teammates and self
export function teammateMarkerSystem() {
  const localPlayer = getLocalPlayerEntity()
  if (!localPlayer || !PlayerTeam.has(localPlayer)) return

  const localTeam = PlayerTeam.get(localPlayer).team
  const myUserId = myProfile.userId?.toLowerCase()

  // Iterate through all player avatars
  for (const [avatarEntity, identityData] of engine.getEntitiesWith(PlayerIdentityData)) {
    const playerAddress = identityData.address.toLowerCase()

    // Check if this is self or teammate
    const isSelf = playerAddress === myUserId

    // Find this player's entity to get their team
    const playerEntity = playerEntities.get(playerAddress)
    if (!playerEntity || !PlayerTeam.has(playerEntity)) continue

    const playerTeam = PlayerTeam.get(playerEntity).team
    const isTeammate = playerTeam === localTeam

    // Check if marker already exists
    const existingMarker = teamMarkers.get(playerAddress)

    // Show marker for self or teammates
    if (isSelf || isTeammate) {
      if (!existingMarker) {
        // Create new green triangle marker entity
        const marker = engine.addEntity()

        // Transform for scale and rotation
        Transform.create(marker, {
          scale: Vector3.create(0.15, 1.15, 0.15),
          rotation: Quaternion.fromEulerDegrees(180, 0, 0) // Point downward
        })

        // Green cone/triangle mesh
        MeshRenderer.setCylinder(marker, 0, 0.5) // Cone shape
        Material.setPbrMaterial(marker, {
          albedoColor: { r: 0, g: 1, b: 0, a: 1 },
          emissiveColor: { r: 0, g: 0.5, b: 0 },
          emissiveIntensity: 2
        })

        // Attach to avatar's head (name anchor point)
        AvatarAttach.create(marker, {
          avatarId: playerAddress,
          anchorPointId: AvatarAnchorPointType.AAPT_NAME_TAG
        })

        teamMarkers.set(playerAddress, marker)
        console.log(`[CLIENT] Created marker for ${isSelf ? 'self' : playerAddress}`)
      }
    } else {
      // Enemy - remove marker if it exists
      if (existingMarker) {
        engine.removeEntity(existingMarker)
        teamMarkers.delete(playerAddress)
        console.log(`[CLIENT] Removed marker from ${playerAddress}`)
      }
    }
  }
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

// Global shooting system - shoot while holding mouse button
let semiFired = false
let firingRevision = -1
export function globalShootingSystem() {
  const player = getLocalPlayerEntity()
  if (!player || !isStateSyncronized()) return

  const equipped=Weapon.getOrNull(player)
  if(!equipped)return
  const profile=profileByName(equipped.name)
  if(equipped.revision!==firingRevision) {
    firingRevision=equipped.revision;semiFired=false;lastShotRequestTime=0;knifeNextPrimary=0;knifeNextSecondary=0;knifeRequests.clear();updateTrigger(false)
  }
  if (isBuyMenuVisible()) {
    isMouseButtonDown = false; isPrimaryActionDown = false; isSecondaryActionDown=false;updateTrigger(false)
    return
  }
  if (!PointerLock.getOrNull(engine.CameraEntity)?.isPointerLocked) {
    const practice = getPractice()
    if ((canPlayRound(myProfile.userId?.toLowerCase() ?? '') || isSpectating()) && practice &&
      (practice.phase === 'live' || practice.phase === 'freeze') &&
      inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN)) {
      const request = engine.addEntity()
      PointerLock.create(request, { isPointerLocked: true })
      delay(1000, () => engine.removeEntity(request))
    }
    isMouseButtonDown = false
    isPrimaryActionDown = false
    isSecondaryActionDown = false
    updateTrigger(false)
    return
  }

  if (Dead.has(player)) {
    isMouseButtonDown = false; isPrimaryActionDown = false; isSecondaryActionDown=false;semiFired = false; updateTrigger(false)
    return
  }

  // Track mouse button state
  if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN)) {
    isMouseButtonDown = true
  }
  if (inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_UP)) {
    isMouseButtonDown = false
  }

  // Track E button (PRIMARY action) state
  if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) {
    isPrimaryActionDown = true
  }
  if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_UP)) {
    isPrimaryActionDown = false
  }

  if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)) {
    isSecondaryActionDown=true
    if(profile.kind==='gun')room.send('playerReload', {})
  }
  if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_UP)) isSecondaryActionDown=false

  if(profile.kind==='knife') {
    updateTrigger(false)
    const attack: KnifeAttack | undefined=isSecondaryActionDown?'stab':isMouseButtonDown?'swing':undefined
    if(!attack||!canUseKnife(player))return
    const now=Date.now()/1000
    if(now<(attack==='swing'?knifeNextPrimary:knifeNextSecondary))return
    for(const [id,request] of knifeRequests)if(now-request.at>2)knifeRequests.delete(id)
    if(attack==='swing') { knifeNextPrimary=now+.35;knifeNextSecondary=now+.5 }
    else { knifeNextPrimary=now+1;knifeNextSecondary=now+1 }
    nextShotId=Math.max(nextShotId,equipped.lastShotId)+1
    knifeRequests.set(nextShotId,{at:now,attack})
    predictKnifeAttack(attack)
    room.send('knifeAttack',{shotId:nextShotId,revision:equipped.revision,attack,direction:getFpsAimDirection()})
    return
  }

  const firing = !hasBombSelected() && !isLocalBombBusy() && (isMouseButtonDown || getPractice()?.mode !== 'teams' && isPrimaryActionDown)
  updateTrigger(firing)
  if(!firing)semiFired=false

  // Shoot continuously while mouse button or E button is held
  if (firing && (profile.automatic || !semiFired)) {
    // Check if can shoot (ammo, reload, fire rate)
    if (!canShoot(player)) return

    const currentTime = Date.now() / 1000
    lastShotRequestTime = nextClientShotTime(lastShotRequestTime, Weapon.get(player).fireRate, currentTime)
    nextShotId = Math.max(nextShotId, Weapon.get(player).lastShotId) + 1
    const shotId = nextShotId
    expandCrosshair(player, 0.15)
    predictCameraKick(shotId, localMotion.speed)
    predictWeaponShot()

    semiFired=true
    room.send('playerShoot', { shotId, revision:equipped.revision, direction: getFpsAimDirection() })
  }
}

function canUseKnife(player: Entity): boolean {
  if(!isStateSyncronized()||Dead.has(player)||(PlayerHealth.getOrNull(player)?.current??0)<=0)return false
  const practice=getPractice(),weapon=Weapon.getOrNull(player)
  return practice?.phase==='live'&&canPlayRound(myProfile.userId?.toLowerCase()??'')&&!!weapon&&!weapon.isReloading&&Date.now()/1000>=weapon.readyAt&&!hasBombSelected()&&!isLocalBombBusy()
}

// Check if player can shoot
function canShoot(player: Entity): boolean {
  if (!isStateSyncronized() || !Weapon.has(player) || Dead.has(player) || (PlayerHealth.getOrNull(player)?.current ?? 0) <= 0) return false

  const practice = getPractice()
  if (practice?.phase !== 'live' || !canPlayRound(myProfile.userId?.toLowerCase() ?? '')) return false
  const weapon = Weapon.get(player)
  const currentTime = Date.now() / 1000

  // Check if reloading
  if (weapon.isReloading || currentTime < weapon.readyAt) return false

  // Check if no ammo
  if (weapon.ammoClip <= 0 || pendingCameraShots(weapon.lastFiredShotId) >= weapon.ammoClip) return false

  // Check fire rate cooldown
  if (currentTime - lastShotRequestTime < weapon.fireRate) return false

  return true
}

// Create visual feedback when shooting
function createHitMarker(position: Vector3, isHit: boolean) {
  const marker = engine.addEntity()
  Transform.create(marker, {
    position: position,
    scale: Vector3.create(0.1, 0.1, 0.1)
  })
  MeshRenderer.setSphere(marker)

  // Different color for hit vs miss
  if (isHit) {
    // Yellow for hit
    Material.setPbrMaterial(marker, {
      albedoColor: { r: 1, g: 1, b: 0, a: 1 },
      emissiveColor: { r: 1, g: 1, b: 0 },
      emissiveIntensity: 2
    })
  } else {
    // Gray for miss/environment impact
    Material.setPbrMaterial(marker, {
      albedoColor: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
      emissiveColor: { r: 0.3, g: 0.3, b: 0.3 },
      emissiveIntensity: 1
    })
  }

  // Remove after 0.2 seconds using delay system
  delay(200, () => {
    engine.removeEntity(marker)
  })
}

// Client message handlers
export function setupClientMessageHandlers() {
  cursorRequest = engine.addEntity()
  engine.addSystem(() => {
    const match = getPractice()
    const phase = match?.phase ?? 'ready'
    const address = myProfile.userId?.toLowerCase()
    const seat = match?.roster.find(seat => seat.address === address && seat.connected)
    const hasSeat = !!seat
    const menuOpen = !match || match.matchOver || phase === 'ready' || phase === 'waiting' || (match.mode === 'teams' && !hasSeat)
    const locked = PointerLock.getOrNull(engine.CameraEntity)?.isPointerLocked
    if (menuOpen && (!cursorReleased || locked !== false)) {
      PointerLock.createOrReplace(cursorRequest!, { isPointerLocked: false })
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
    movePlayerTo({ newRelativePosition: data.position, cameraTarget: { x: data.position.x + Math.sin(data.yaw) * 10, y: data.position.y + 1.6, z: data.position.z + Math.cos(data.yaw) * 10 } })
    resetFpsCamera(data.round, data.yaw)
    spectatorCapturePending = false
    localMotion.reset()
    capturePointer()
    isMouseButtonDown = false
    isPrimaryActionDown = false
    isSecondaryActionDown = false
    lastFacingSentAt=0
    updateTrigger(false)
  })
  room.onMessage('spectatorStart', data => {
    if (data.playerAddress !== myProfile.userId?.toLowerCase()) return
    spectatorCapturePending = true
    localMotion.reset()
    isMouseButtonDown = false
    isPrimaryActionDown = false
    isSecondaryActionDown = false
    updateTrigger(false)
  })
  room.onMessage('practiceShot', (data) => {
    createHitMarker(data.position, false)
    if (data.owner === myProfile.userId?.toLowerCase()) receiveCameraKick(data)
  })
  room.onMessage('shotRejected', data => {
    if (data.owner === myProfile.userId?.toLowerCase()) rejectCameraKick(data)
  })
  room.onMessage('knifeResult', data => {
    if(data.owner!==myProfile.userId?.toLowerCase())return
    const request=knifeRequests.get(data.shotId)
    if(request) {
      const primary=request.at+(data.attack==='swing'?(data.contact ? .4 : .35):(data.contact?1.1:1))
      const secondary=request.at+(data.attack==='swing' ? .5 : (data.contact?1.1:1))
      knifeNextPrimary=Math.max(knifeNextPrimary,primary)
      knifeNextSecondary=Math.max(knifeNextSecondary,secondary)
      knifeRequests.delete(data.shotId)
    }
    createHitMarker(data.position,data.target)
  })
  room.onMessage('practiceAttack', (data) => {
    createHitMarker(data.origin, true)
    createHitMarker(data.target, false)
  })
  let lastJoinAttempt = 0
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
    for (const [entity, address, health, team] of engine.getEntitiesWith(PlayerAddress, PlayerHealth, PlayerTeam, Weapon)) {
      const playerAddr = address.address.toLowerCase()

      // Check if this is a new entity we haven't seen before
      if (playerEntities.get(playerAddr) !== entity || (localPlayerEntity === null && playerAddr === myProfile.userId?.toLowerCase())) {
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
    console.log('[CLIENT] <<< Received damageConfirmed:', data)

    const targetAddress = data.targetPlayerAddress
    const player = getLocalPlayerEntity()

    // Show damage indicator if it's us
    const myUserId = myProfile.userId?.toLowerCase()
    if (myUserId && targetAddress.toLowerCase() === myUserId && player) {
      const currentTime = Date.now() / 1000
      DamageIndicator.createOrReplace(player, {
        damage: data.damage,
        timestamp: currentTime,
        lifetime: 1.0
      })
      const playerPosition = Transform.get(engine.PlayerEntity).position
      const feedback = DamageFeedback.getMutable(player)
      const next = mergePainDirections(feedback, painDirections(data.origin, playerPosition, getFpsAimDirection()))
      feedback.front = next.front
      feedback.right = next.right
      feedback.rear = next.rear
      feedback.left = next.left
      receiveDamageKick({ pitch: data.punchPitch, roll: data.punchRoll })
      if (damageSound !== undefined) AudioSource.playSound(damageSound, 'assets/sounds/player/damage.wav', true)

      if (data.wasKill) {
        console.log('[CLIENT] You died!')
      }
    }

    // Visual hit marker on target (get position from avatar entity)
    for (const [avatarEntity, identityData] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
      if (identityData.address === targetAddress) {
        const transform = Transform.get(avatarEntity)
        createHitMarker(transform.position, true)
        break
      }
    }
  })


}

// Add client systems to engine
export function addClientSystems() {
  damageSound = engine.addEntity()
  Transform.create(damageSound, { parent: engine.CameraEntity })
  const gameArea = engine.addEntity()
  Transform.create(gameArea, { position: { x: 96, y: 64, z: 96 } })
  AvatarModifierArea.create(gameArea, {
    area: { x: 192, y: 128, z: 192 },
    modifiers: [AvatarModifierType.AMT_DISABLE_PASSPORTS],
    excludeIds: []
  })
  let wasReloading = false
  engine.addSystem(() => {
    if (localPlayerEntity === null) return
    const equipped=Weapon.getOrNull(localPlayerEntity)
    const profile=equipped&&profileByName(equipped.name)
    if(equipped&&profile?.kind==='gun')syncCameraWeapon(profile.id,equipped.revision)
    const reloading = equipped?.isReloading ?? false
    if (reloading && !wasReloading) resetCameraAccuracy()
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
  engine.addSystem(teammateMarkerSystem)
}
