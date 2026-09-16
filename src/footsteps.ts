import { AudioSource, EngineInfo, engine, Entity, Transform, AssetLoad } from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { Bot, Dead, PlayerAddress, PlayerHealth, PlayerPose, PlayerTeam, Weapon } from './components'
import { canPlayRound, getPractice } from './practice'
import { isWalking } from './locomotion'
import { hasBombSelected } from './bomb-client'
import { profileByName, modeStats } from './weapon-profiles'
import { C4_SPEED } from './bomb-rules'
import { receiveLandingKick } from './fps-camera'
import { room } from './index'
import { AvatarMovementInfo } from './bevy-movement'
import { bulletWorldTrace } from './penetration'
import { FootstepMotion, FootstepRules, MovementPoint } from './footstep-rules'

interface Walker {
  audio: Entity
  motion: FootstepMotion
  steps: FootstepRules
}
const walkers = new Map<string, Walker>()
let round = -1
let landingSequence = 0

export function resetFootsteps() {
  for (const walker of walkers.values()) engine.removeEntity(walker.audio)
  walkers.clear()
}

export function initializeFootsteps() {
  const assets = ['step', 'metal', 'dirt', 'duct', 'grate', 'tile', 'slosh', 'snow'].flatMap((kind) =>
    Array.from({ length: kind === 'tile' ? 5 : 4 }, (_, i) => `assets/sounds/movement/pl_${kind}${i + 1}.wav`)
  )
  AssetLoad.create(engine.addEntity(), {
    assets
  })
  engine.addSystem(footstepSystem)
}

function updateWalker(address: string, position: MovementPoint, now: number, local = false, speedLimit = Infinity) {
  let walker = walkers.get(address)
  if (!walker) {
    const audio = engine.addEntity()
    Transform.create(audio, local ? { parent: engine.CameraEntity } : { position })
    walker = { audio, motion: new FootstepMotion(), steps: new FootstepRules() }
    walkers.set(address, walker)
  }
  if (walker.motion.sample(position, now)) walker.steps = new FootstepRules()
  const velocity = local ? AvatarMovementInfo.getOrNull(engine.PlayerEntity)?.actualVelocity : undefined
  const speed = velocity ? Math.hypot(velocity.x, velocity.z) : walker.motion.horizontal
  const vertical = velocity?.y ?? walker.motion.vertical
  const floor = bulletWorldTrace({ x: position.x, y: position.y + 0.9, z: position.z }, { x: 0, y: -1, z: 0 }, 1.6)
  const grounded = floor.solid && floor.distance <= 1.02 && (floor.normal?.y ?? 0) > 0.65
  const sound = walker.steps.update(now, Math.min(speedLimit, speed), vertical, grounded, floor.material)
  if (!sound) return
  if (local && sound.impactSpeed !== undefined) {
    receiveLandingKick(sound.impactSpeed)
    room.send('playerLanding', { round, sequence: ++landingSequence, speed: sound.impactSpeed, position })
  }
  if (!local) Transform.getMutable(walker.audio).position = { ...position, y: position.y + 0.9 }
  AudioSource.playSound(walker.audio, `assets/sounds/movement/${sound.clip}`, true)
  AudioSource.getMutable(walker.audio).volume = sound.volume
}

function footstepSystem() {
  const match = getPractice()
  if (round !== match?.round || match?.phase !== 'live' || EngineInfo.getOrNull(engine.RootEntity)?.sceneHidden) {
    resetFootsteps()
    round = match?.round ?? -1
    return
  }
  const now = Date.now() / 1000,
    me = myProfile.userId?.toLowerCase(),
    active = new Set<string>()
  for (const [entity, player, health, team] of engine.getEntitiesWith(PlayerAddress, PlayerHealth, PlayerTeam)) {
    if (!team.team || health.current <= 0 || Dead.has(entity) || !canPlayRound(player.address)) continue
    const local = player.address === me
    const pose = PlayerPose.getOrNull(entity)
    const position = local
      ? Transform.getOrNull(engine.PlayerEntity)?.position
      : pose?.valid
        ? pose.position
        : undefined
    if (!position) continue
    let limit = Infinity
    if (local) {
      const weapon = Weapon.getOrNull(entity),
        profile = profileByName(weapon?.name ?? 'Knife')
      limit = hasBombSelected()
        ? C4_SPEED
        : profile.kind === 'gun'
          ? modeStats(profile, weapon?.mode, weapon?.zoom).speed
          : profile.speed
      if (isWalking()) limit *= 0.52
    }
    active.add(player.address)
    updateWalker(player.address, position, now, local, limit)
  }
  for (const [entity, bot, transform] of engine.getEntitiesWith(Bot, Transform)) {
    if (!bot.alive) continue
    const address = `bot:${bot.index}`
    active.add(address)
    updateWalker(address, transform.position, now)
  }
  for (const [address, walker] of walkers)
    if (!active.has(address)) {
      engine.removeEntity(walker.audio)
      walkers.delete(address)
    }
}
