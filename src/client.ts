import {
  engine,
  Entity,
  Transform,
  Material,
  MeshRenderer,
  MeshCollider,
  inputSystem,
  InputAction,
  PointerEventType,
  raycastSystem,
  RaycastQueryType,
  PlayerIdentityData,
  GltfContainer,
  AvatarAttach,
  AvatarAnchorPointType,
  Animator,
  AvatarModifierArea,
  AvatarModifierType,
  ColliderLayer
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { myProfile } from '@dcl/sdk/network'
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
  PlayerCollider
} from './components'
import { reload, giveWeapon, weaponSystem } from './systems'
import { delay } from './delaySystem'
import { room } from './index'

// Player registry: Maps player address to their entity
export const playerEntities = new Map<string, Entity>()

// Store local player entity
let localPlayerEntity: Entity | null = null

// Track if player is initialized and ready
let isPlayerReady = false

// Track if connected to server (for UI notification)
let isConnectedToServer = false
let connectionTime = 0

// Track player position for movement detection
let lastPlayerPosition: Vector3 | null = null

// Track if mouse button or E button is held down
let isMouseButtonDown = false
let isPrimaryActionDown = false

export function getLocalPlayerEntity(): Entity | null {
  return localPlayerEntity
}

export function isLocalPlayerReady(): boolean {
  return isPlayerReady
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

  // Give starting weapon based on team
  if (team === Team.TERRORIST) {
    giveWeapon(localPlayerEntity, 'AK47')
  } else {
    giveWeapon(localPlayerEntity, 'M4A4')
  }

  // Mark player as ready
  isPlayerReady = true

  console.log('[CLIENT] Local player initialized with team:', team)

  // Attach weapon model to left hand
  attachWeaponModel()
}

// Hide all player name tags/passports
export function hidePlayerPassports() {
  // Create an area that covers the entire scene (12x12 parcels = 192x192 meters)
  const modifierArea = engine.addEntity()

  // 12 parcels × 16 meters/parcel = 192 meters
  const sceneSize = 12 * 16
  const areaSize = Vector3.create(sceneSize, 40, sceneSize)

  Transform.create(modifierArea, {
    position: Vector3.create(8, 0, 8), // Center: (96, 25, 96)
    scale: areaSize // 192×50×192
  })

  // Hide passports (not entire avatars) for all players in this area
  AvatarModifierArea.create(modifierArea, {
    area: areaSize, // Exactly match scene size: 192×50×192
    modifiers: [AvatarModifierType.AMT_HIDE_AVATARS],
    excludeIds: [] // Don't exclude anyone
  })

  // Debug: visualize the modifier area
  MeshRenderer.setBox(modifierArea)
  Material.setPbrMaterial(modifierArea, {
    albedoColor: Color4.Green(), // Green transparent
  })

  console.log(`[CLIENT] Created passport modifier area at (96, 25, 96) with size ${sceneSize}×50×${sceneSize}`)
}

// Attach weapon model to player's left hand
export function attachWeaponModel() {
  const myUserId = myProfile.userId?.toLowerCase()
  if (!myUserId) return

  // Create weapon model entity
  const weaponModelEntity = engine.addEntity()

  // Load the M4A1 GLB model
  GltfContainer.create(weaponModelEntity, {
    src: 'assets/scene/m4a1.glb'
  })

  // Add animator with the animation clip
  // Note: Animation names in GLB often follow pattern: armatureName_animationName
  // Animator.create(weaponModelEntity, {
  //   states: [
  //     {
  //       clip: 'firstperson_reload',
  //       playing: true,
  //       loop: true
  //     },
  //     {
  //       clip: 'firstperson_idle',
  //       playing: true,
  //       loop: true
  //     }
  //   ]
  // })

  // Attach to left shoulder
  AvatarAttach.create(weaponModelEntity, {
    avatarId: myUserId,
    anchorPointId: AvatarAnchorPointType.AAPT_LEFT_HAND_INDEX
  })

  console.log('[CLIENT] Attached weapon model to left shoulder with animation')
}

// Predefined spawn points
const SPAWN_POINTS = [
  Vector3.create(57, 7, 52),
  Vector3.create(96, 15, 44),
  Vector3.create(118, 11, 33),
  Vector3.create(106, 11, 106),
  Vector3.create(81, 15, 132),
  Vector3.create(69, 12, 96),
  Vector3.create(52, 11, 67)
]

// Client-side respawn handler (called when server says to respawn)
export function handleClientRespawn() {
  const player = getLocalPlayerEntity()
  if (!player || !PlayerTeam.has(player)) return

  console.log('[CLIENT] Handling respawn - teleporting and re-equipping')

  // Pick a random spawn point
  const randomIndex = Math.floor(Math.random() * SPAWN_POINTS.length)
  const spawnPosition = SPAWN_POINTS[randomIndex]

  movePlayerTo({
    newRelativePosition: spawnPosition
  })

  // Give starting weapon based on team
  const team = PlayerTeam.get(player)
  if (team.team === Team.TERRORIST) {
    giveWeapon(player, 'AK47')
  } else {
    giveWeapon(player, 'M4A4')
  }

  console.log(`[CLIENT] Respawned at spawn point ${randomIndex}: (${spawnPosition.x}, ${spawnPosition.y}, ${spawnPosition.z})`)
}

// Map to track collider entities for each player
const playerColliderEntities = new Map<string, Entity>()

// Client-side collider creation system
// Creates separate invisible entities attached to player avatars for collision detection
export function clientColliderSystem() {
  // Iterate over all player avatars (Reserved Entities with PlayerIdentityData)
  for (const [avatarEntity, identityData] of engine.getEntitiesWith(PlayerIdentityData)) {
    const playerAddress = identityData.address
    if (!myProfile || playerAddress === myProfile.userId) continue

    // Check if we've already created a collider entity for this player
    if (playerColliderEntities.has(playerAddress)) {
      continue
    }

    // Create a new invisible entity for the collider
    const colliderEntity = engine.addEntity()

    // Add transform (size of player hitbox)
    Transform.create(colliderEntity, {
      scale: Vector3.create(0.5, 1.8, 0.5) // Player-sized hitbox
    })

    // Add collider for raycasting
    MeshCollider.setBox(colliderEntity)

    // Mark this entity with player address for identification
    PlayerCollider.create(colliderEntity, {
      playerAddress: playerAddress
    })

    // Attach to player avatar at their position
    AvatarAttach.create(colliderEntity, {
      avatarId: playerAddress,
      anchorPointId: AvatarAnchorPointType.AAPT_HIP
    })

    playerColliderEntities.set(playerAddress, colliderEntity)
    console.log(`[CLIENT] Created collider entity for avatar: ${playerAddress}`)
  }
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

// Damage feedback system - visual feedback when taking damage
export function damageFeedbackSystem(dt: number) {
  const player = getLocalPlayerEntity()
  if (!player || !PlayerHealth.has(player) || !DamageFeedback.has(player)) return

  const health = PlayerHealth.get(player)
  const feedback = DamageFeedback.getMutable(player)
  const currentTime = Date.now() / 1000

  // Detect if damage was taken
  if (health.current < feedback.previousHealth) {
    const damageTaken = feedback.previousHealth - health.current
    // Increase intensity based on damage (capped at 1.0)
    feedback.intensity = Math.min(1.0, feedback.intensity + damageTaken / 100)
    feedback.lastDamageTime = currentTime
  }

  // Update previous health
  feedback.previousHealth = health.current

  // Fade out the red overlay over time
  const fadeSpeed = 1.5 // How fast the red fades (higher = faster)
  if (feedback.intensity > 0) {
    feedback.intensity = Math.max(0, feedback.intensity - fadeSpeed * dt)
  }
}

// Crosshair dynamics system
export function crosshairSystem(dt: number) {
  const player = getLocalPlayerEntity()
  if (!player) return

  const crosshair = CrosshairState.getOrNull(player)
  if (!crosshair) return

  const currentTime = Date.now() / 1000

  // Detect player movement by checking avatar position changes
  if (Transform.has(engine.PlayerEntity)) {
    const avatarTransform = Transform.get(engine.PlayerEntity)
    const currentPos = avatarTransform.position

    if (lastPlayerPosition) {
      const moveDistance = Vector3.distance(currentPos, lastPlayerPosition)
      const isMoving = moveDistance > 0.005 // Movement threshold (more sensitive)

      if (isMoving) {
        // Calculate movement vector
        const movementVector = Vector3.subtract(currentPos, lastPlayerPosition)

        // Get camera forward direction for comparison
        let cameraForward = Vector3.Forward()
        if (Transform.has(engine.CameraEntity)) {
          const cameraTransform = Transform.get(engine.CameraEntity)
          cameraForward = Vector3.rotate(Vector3.Forward(), cameraTransform.rotation)
          // Flatten to XZ plane for horizontal movement comparison
          cameraForward.y = 0
          cameraForward = Vector3.normalize(cameraForward)
        }

        // Flatten movement vector to XZ plane
        const flatMovement = Vector3.create(movementVector.x, 0, movementVector.z)
        const flatMovementNormalized = Vector3.normalize(flatMovement)

        // Calculate dot product to determine movement direction
        // dot = 1: moving forward, -1: moving backward, 0: moving sideways
        const dot = Vector3.dot(flatMovementNormalized, cameraForward)
        const absDot = Math.abs(dot)

        // Calculate movement intensity based on direction
        // Forward/backward movement (absDot close to 1): high intensity (1.0)
        // Strafe movement (absDot close to 0): low intensity (0.3)
        const movementIntensity = 0.3 + absDot * 0.7 // Range: 0.3 (strafe) to 1.0 (forward/back)

        // Player is moving - expand crosshair based on movement intensity
        const mutableCrosshair = CrosshairState.getMutable(player)
        const expansionRate = 3.0 * movementIntensity // Strafe expands slower than forward/back
        mutableCrosshair.spread = Math.min(crosshair.maxSpread, crosshair.spread + expansionRate * dt)
        mutableCrosshair.isMoving = true
        mutableCrosshair.movementIntensity = movementIntensity
      } else {
        const mutableCrosshair = CrosshairState.getMutable(player)
        mutableCrosshair.isMoving = false
        mutableCrosshair.movementIntensity = 0
      }
    }

    lastPlayerPosition = currentPos
  }

  // Decay spread over time (return to base spread)
  const timeSinceShot = currentTime - crosshair.lastShotTime
  const decayRate = 2.0 // How fast crosshair returns to normal

  if (timeSinceShot > 0.1 && !crosshair.isMoving) {
    // Smoothly decay spread back to base when not shooting or moving
    const mutableCrosshair = CrosshairState.getMutable(player)
    mutableCrosshair.spread = Math.max(crosshair.baseSpread, crosshair.spread - decayRate * dt)
  }
}

// Expand crosshair when shooting
function expandCrosshair(player: Entity, amount: number) {
  if (!CrosshairState.has(player)) return

  const crosshair = CrosshairState.getMutable(player)
  crosshair.spread = Math.min(crosshair.maxSpread, crosshair.spread + amount)
  crosshair.lastShotTime = Date.now() / 1000
}

// Apply random spread to shooting direction based on crosshair spread (like CS)
function applySpread(direction: Vector3, spreadAmount: number): Vector3 {
  // Convert spread (0-1) to degrees (0-5 degrees max deviation, less aggressive)
  const maxSpreadDegrees = 5
  const spreadDegrees = spreadAmount * maxSpreadDegrees

  // Random angles in radians
  const randomPitch = (Math.random() - 0.5) * 2 * (spreadDegrees * Math.PI / 180)
  const randomYaw = (Math.random() - 0.5) * 2 * (spreadDegrees * Math.PI / 180)

  // Create rotation quaternion for the spread
  const pitchRotation = Quaternion.fromEulerDegrees(randomPitch * 180 / Math.PI, 0, 0)
  const yawRotation = Quaternion.fromEulerDegrees(0, randomYaw * 180 / Math.PI, 0)
  const spreadRotation = Quaternion.multiply(yawRotation, pitchRotation)

  // Apply spread to direction
  return Vector3.rotate(direction, spreadRotation)
}

// Global shooting system - shoot while holding mouse button
export function globalShootingSystem() {
  const player = getLocalPlayerEntity()
  if (!player) return

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

  // Handle reload with F key (secondary action)
  if (inputSystem.isTriggered(InputAction.IA_SECONDARY, PointerEventType.PET_DOWN)) {
    reload(player)
  }

  // Shoot continuously while mouse button or E button is held
  if (isMouseButtonDown || isPrimaryActionDown) {
    // Check if can shoot (ammo, reload, fire rate)
    if (!canShoot(player)) return

    // Handle burst fire tracking
    const currentTime = Date.now() / 1000
    const BURST_RESET_TIME = 0.3 // Reset burst counter if >0.3s between shots

    if (CrosshairState.has(player)) {
      const crosshair = CrosshairState.getMutable(player)

      // Reset burst counter if too much time has passed
      if (currentTime - crosshair.lastShotTime > BURST_RESET_TIME) {
        crosshair.consecutiveShots = 0
      }

      // Increment burst counter
      crosshair.consecutiveShots++
    }

    // Consume ammo first (regardless of hit or miss)
    consumeAmmo(player)

    // Expand crosshair when shooting (less aggressive for sustained fire)
    if (CrosshairState.has(player)) {
      const crosshair = CrosshairState.get(player)
      // Reduce expansion amount as consecutive shots increase
      const expansionAmount = crosshair.consecutiveShots <= 3 ? 0.15 : 0.08
      expandCrosshair(player, expansionAmount)
    }

    // Get camera direction
    let cameraDirection = Vector3.Forward()
    if (Transform.has(engine.CameraEntity)) {
      const cameraTransform = Transform.get(engine.CameraEntity)
      // Calculate forward direction from camera rotation
      cameraDirection = Vector3.rotate(Vector3.Forward(), cameraTransform.rotation)
    }

    // Apply bullet spread based on crosshair state and burst count (like CS)
    let shootDirection = cameraDirection
    if (CrosshairState.has(player)) {
      const crosshair = CrosshairState.get(player)

      // First 3 shots are accurate (burst fire), then spread increases
      if (crosshair.consecutiveShots > 3) {
        // Apply spread for sustained fire (4th shot onwards)
        shootDirection = applySpread(cameraDirection, crosshair.spread)
      }
      // else: first 3 shots go exactly where aimed (no spread)
    }

    // Perform raycast from camera with spread applied
    raycastSystem.registerGlobalDirectionRaycast(
      engine.CameraEntity,
      (result) => {
        console.log(JSON.stringify(result))
        // Send shoot message to server regardless of hit/miss
        const shootMessage = {
          direction: cameraDirection,
          targetPlayerAddress: undefined as string | undefined,
          hitPosition: undefined as Vector3 | undefined,
          timestamp: Date.now()
        }

        if (result.hits && result.hits.length > 0) {
          const hit = result.hits[0]

          // Check if we hit a player collider (attached to avatar)
          if (hit.entityId && PlayerCollider.has(hit.entityId as Entity)) {
            const collider = PlayerCollider.get(hit.entityId as Entity)
            const targetAddress = collider.playerAddress

            // Client detected a hit on a player - send to server for validation
            shootMessage.targetPlayerAddress = targetAddress
            shootMessage.hitPosition = hit.position

            // Show instant hit marker (optimistic, before server confirms)
            if (hit.position) {
              createHitMarker(hit.position, true)
            }

            console.log('[CLIENT] Hit detected on player collider:', targetAddress)
          } else {
            // Missed or hit environment - show bullet impact
            if (hit.position) {
              createHitMarker(hit.position, false)
            }
          }
        }

        // Send shoot message to server
        const shootData = {
          direction: shootMessage.direction,
          timestamp: shootMessage.timestamp,
          hitPosition: shootMessage.hitPosition,
          targetPlayerAddress: shootMessage.targetPlayerAddress
        }
        console.log('[CLIENT] >>> Sending playerShoot:', JSON.stringify(shootData))
        room.send('playerShoot', shootData)
      },
      {
        queryType: RaycastQueryType.RQT_QUERY_ALL,
        direction: shootDirection, // Use direction with spread applied
        maxDistance: 100,
        collisionMask: ColliderLayer.CL_POINTER | ColliderLayer.CL_PLAYER
      }
    )
  }
}

// Check if player can shoot
function canShoot(player: Entity): boolean {
  if (!Weapon.has(player)) return false

  const weapon = Weapon.get(player)
  const currentTime = Date.now() / 1000

  // Check if reloading
  if (weapon.isReloading) return false

  // Check if no ammo
  if (weapon.ammoClip <= 0) return false

  // Check fire rate cooldown
  if (currentTime - weapon.lastShotTime < weapon.fireRate) return false

  return true
}

// Consume ammo when shooting
function consumeAmmo(player: Entity) {
  if (!Weapon.has(player)) return

  const weapon = Weapon.getMutable(player)
  const currentTime = Date.now() / 1000

  // Consume ammo
  weapon.ammoClip--
  weapon.lastShotTime = currentTime

  // Auto reload if empty
  if (weapon.ammoClip === 0 && weapon.ammoReserve > 0) {
    reload(player)
  }
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
  // Send ping to test connection
  const pingTimestamp = Date.now()
  console.log('[CLIENT] >>> Sending ping, timestamp:', pingTimestamp)
  room.send('ping', { timestamp: pingTimestamp })

  // Listen for pong response
  room.onMessage('pong', (data) => {
    const roundTripTime = Date.now() - data.timestamp
    console.log('[CLIENT] <<< Received pong! Round-trip time:', roundTripTime, 'ms')
  })

  // Send join message to server when client initializes
  console.log('[CLIENT] >>> Sending playerJoin')
  room.send('playerJoin', {})

  // CLIENT: System to detect synced player entities and identify ourselves
  engine.addSystem(() => {
    // Look for player entities that have been synced from server
    for (const [entity, address, health, team] of engine.getEntitiesWith(PlayerAddress, PlayerHealth, PlayerTeam)) {
      const playerAddr = address.address

      // Check if this is a new entity we haven't seen before
      if (!playerEntities.has(playerAddr)) {
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
            intensity: 0,
            lastDamageTime: 0,
            previousHealth: health.current
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

    const targetAddress = data.targetPlayerAddress as string
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

  // CLIENT: Listen for respawn commands from server
  room.onMessage('respawnPlayer', (data) => {
    console.log('[CLIENT] <<< Received respawnPlayer:', data)

    const playerAddr = data.playerAddress as string
    const myUserId = myProfile.userId?.toLowerCase()

    // Check if this respawn is for us
    if (myUserId && playerAddr.toLowerCase() === myUserId) {
      console.log('[CLIENT] Server commanded respawn')
      handleClientRespawn()
    }
  })
}

// Add client systems to engine
export function addClientSystems() {
  engine.addSystem(weaponSystem)
  engine.addSystem(damageFeedbackSystem)
  engine.addSystem(crosshairSystem)
  engine.addSystem(globalShootingSystem)
  engine.addSystem(clientColliderSystem)
  engine.addSystem(teammateMarkerSystem)
}
