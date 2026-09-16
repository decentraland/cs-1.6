import {
  Animator,
  engine,
  Entity,
  GltfContainer,
  Material,
  MeshRenderer,
  TextureWrapMode,
  Transform,
  VisibilityComponent
} from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { GrenadeProjectile } from './components'
import { grenadeProfile } from './grenade-profiles'
import { SMOKE_CANISTER_SECONDS, smokeOpacity } from './grenade-rules'
import { playGrenadeSound } from './weapon-sounds'
import { bulletWorldTrace } from './penetration'
import sprites from './grenade-sprites.json'

type SpriteId = keyof typeof sprites
interface Puff {
  entity: Entity
  sprite: SpriteId
  start: number
  duration: number
  fps: number
  scale: number
  tint: number
  alpha: number
  gas: boolean
  velocity: Vector3
  frame: number
  opacity: number
}
interface View {
  model: Entity
  phase: string
  bounces: number
  clip: string
  emitted: number
  puffs: Puff[]
}
const views = new Map<Entity, View>()
const clips = ['idle', 'roll1', 'roll2', 'roll3', 'toss1', 'toss2', 'toss3']
const random = (low: number, high: number) => low + Math.random() * (high - low)

function material(puff: Puff, opacity: number) {
  const atlas = sprites[puff.sprite],
    frame = atlas.frames[puff.frame]
  const texture = Material.Texture.Common({
    src: atlas.src,
    wrapMode: TextureWrapMode.TWM_CLAMP,
    tiling: { x: frame.width / atlas.width, y: frame.height / atlas.height },
    offset: { x: frame.x / atlas.width, y: -frame.y / atlas.height }
  })
  Material.setBasicMaterial(puff.entity, {
    texture,
    alphaTexture: texture,
    diffuseColor: { r: puff.tint, g: puff.tint, b: puff.tint, a: opacity },
    castShadows: false
  })
  puff.opacity = opacity
}
function puff(
  view: View,
  sprite: SpriteId,
  position: Vector3,
  start: number,
  scale: number,
  fps: number,
  options: { duration?: number; tint?: number; alpha?: number; velocity?: Vector3; gas?: boolean } = {}
) {
  const entity = engine.addEntity()
  Transform.create(entity, { position })
  MeshRenderer.setPlane(entity)
  const effect: Puff = {
    entity,
    sprite,
    start,
    duration: options.duration ?? sprites[sprite].frames.length / fps,
    fps,
    scale,
    tint: options.tint ?? 1,
    alpha: options.alpha ?? 1,
    gas: options.gas ?? false,
    velocity: options.velocity ?? Vector3.Zero(),
    frame: -1,
    opacity: -1
  }
  VisibilityComponent.create(entity, { visible: false })
  view.puffs.push(effect)
}
function detonate(view: View, kind: string, center: Vector3, at: number, now: number) {
  if (now - at < 1) {
    playGrenadeSound(
      kind === 'hegrenade'
        ? `hegrenade-${Math.random() < 0.5 ? 1 : 2}`
        : kind === 'flashbang'
          ? `flashbang-${Math.random() < 0.5 ? 1 : 2}`
          : 'sg_explode',
      center
    )
    if (kind === 'hegrenade') playGrenadeSound(`debris${1 + Math.floor(Math.random() * 3)}`, center, 0.55)
  }
  if (kind === 'hegrenade') {
    puff(view, 'fexplo', { ...center, y: center.y + 0.5 }, at, 2.5, 30)
    puff(
      view,
      'eexplo',
      { x: center.x + random(-1.6, 1.6), y: center.y + random(0.75, 0.875), z: center.z + random(-1.6, 1.6) },
      at,
      3,
      30
    )
    puff(view, 'steam1', { ...center, y: center.y - 0.125 }, at + 0.55, random(3.5, 4.5), 5, {
      tint: 0.6,
      alpha: 0.7,
      velocity: { x: 0, y: 0.5, z: 0 }
    })
  }
  if (kind === 'smokegrenade') {
    for (let i = 0; i < 20; i++) {
      puff(
        view,
        'gas_puff_01',
        { x: center.x + (i ? random(-2.5, 2.5) : 0), y: center.y + 0.75, z: center.z + (i ? random(-2.5, 2.5) : 0) },
        at,
        5,
        10,
        {
          duration: 30,
          tint: random(210, 230) / 255,
          gas: true,
          velocity: { x: random(-0.125, 0.125), y: 0, z: random(-0.125, 0.125) }
        }
      )
    }
  }
}
function updatePuffs(view: View, now: number, dt: number) {
  view.puffs = view.puffs.filter((puff) => {
    const age = now - puff.start
    if (age >= puff.duration) {
      engine.removeEntity(puff.entity)
      return false
    }
    if (age < 0) return true
    const atlas = sprites[puff.sprite],
      frameIndex = Math.floor(age * puff.fps) % atlas.frames.length
    if (frameIndex !== puff.frame) {
      puff.frame = frameIndex
      const frame = atlas.frames[frameIndex]
      Transform.getMutable(puff.entity).scale = {
        x: frame.width * 0.025 * puff.scale,
        y: frame.height * 0.025 * puff.scale,
        z: 1
      }
      VisibilityComponent.getMutable(puff.entity).visible = true
      material(puff, puff.alpha * (puff.gas ? smokeOpacity(age) : 1))
    }
    const opacity = puff.alpha * (puff.gas ? smokeOpacity(age) : 1)
    if (Math.abs(opacity - puff.opacity) > 0.01) material(puff, opacity)
    if (puff.sprite.startsWith('black_smoke') && age > 7 / puff.fps) {
      const damping = Math.pow(0.97, dt * 60)
      puff.velocity = {
        x: puff.velocity.x * damping,
        z: puff.velocity.z * damping,
        y: Math.min(1.75, puff.velocity.y * damping + 0.0175 * dt * 60)
      }
    }
    const transform = Transform.getMutable(puff.entity),
      speed = Vector3.length(puff.velocity)
    // GoldSrc VP_PARALLEL sprites share the view axes, including when inside the cloud.
    transform.rotation = Transform.get(engine.CameraEntity).rotation
    if (speed > 0) {
      const hit = bulletWorldTrace(
        transform.position,
        Vector3.scale(puff.velocity, 1 / speed),
        speed * Math.min(dt, 0.1)
      )
      transform.position = hit.position
      if (hit.solid) puff.velocity = Vector3.Zero()
    }
    return true
  })
}
export function initializeGrenadeViews() {
  engine.addSystem((dt) => {
    const now = Date.now() / 1000
    for (const [entity, data] of engine.getEntitiesWith(GrenadeProjectile)) {
      const grenade = grenadeProfile(data.kind)
      if (!grenade) continue
      let view = views.get(entity)
      if (!view) {
        const model = engine.addEntity()
        Transform.create(model, { position: data.position })
        GltfContainer.create(model, {
          src: `assets/scene/weapons/${grenade.id}-projectile.glb`,
          visibleMeshesCollisionMask: 0,
          invisibleMeshesCollisionMask: 0
        })
        Animator.create(model, {
          states: clips.map((clip) => ({ clip: `w_${grenade.id} ${clip}`, playing: false, loop: true, speed: 1 }))
        })
        VisibilityComponent.create(model, { visible: true })
        view = { model, phase: 'flight', bounces: data.bounces, clip: '', emitted: -1, puffs: [] }
        views.set(entity, view)
      }
      const age = now - data.activated
      const visible = data.phase === 'flight' || (data.phase === 'smoke' && age < SMOKE_CANISTER_SECONDS)
      if (VisibilityComponent.get(view.model).visible !== visible)
        VisibilityComponent.getMutable(view.model).visible = visible
      if (visible) {
        const transform = Transform.getMutable(view.model)
        transform.position = Vector3.lerp(transform.position, data.position, 1 - Math.exp(-30 * dt))
        const speed = Vector3.length(data.velocity),
          clip = `w_${grenade.id} ${data.grounded ? 'roll1' : (clips[data.animation] ?? 'toss1')}`
        if (clip !== view.clip) {
          Animator.playSingleAnimation(view.model, clip)
          view.clip = clip
        }
        Animator.getClip(view.model, clip).speed = speed < 2.5 ? 0 : Math.min(1, speed / 5)
      }
      if (data.bounces > view.bounces && view.bounces < 5 && data.phase === 'flight') {
        playGrenadeSound(
          grenade.id === 'hegrenade' ? 'he_bounce-1' : `grenade_hit${1 + Math.floor(Math.random() * 3)}`,
          data.position,
          grenade.id === 'hegrenade' ? 1 : 0.25
        )
      }
      view.bounces = data.bounces
      if (data.phase !== view.phase) {
        view.phase = data.phase
        detonate(view, data.kind, data.center, data.activated, now)
      }
      if (data.phase === 'smoke' && age >= 0.1 && age < SMOKE_CANISTER_SECONDS) {
        const emission = Math.floor(age - 0.1)
        if (emission > view.emitted) {
          view.emitted = emission
          const angle = (emission * Math.PI) / 6,
            speed = random(3, 8) * Math.floor(random(1, 4)) * 0.025
          puff(view, `black_smoke${1 + Math.floor(Math.random() * 4)}` as SpriteId, { ...data.center }, now, 1, 25, {
            tint: random(155, 175) / 255,
            alpha: random(100, 180) / 255,
            velocity: { x: Math.cos(angle) * speed, y: 0, z: Math.sin(angle) * speed }
          })
        }
      }
      updatePuffs(view, now, dt)
    }
    for (const [entity, view] of views) {
      if (!GrenadeProjectile.has(entity)) {
        engine.removeEntity(view.model)
        for (const puff of view.puffs) engine.removeEntity(puff.entity)
        views.delete(entity)
      }
    }
  })
}
