import { engine, Entity, Material, MeshRenderer, TextureWrapMode, Transform, VisibilityComponent } from '@dcl/sdk/ecs'
import type { Vector3 } from '@dcl/sdk/math'
import { getBomb } from './bomb'
import { BOMB_SECONDS } from './bomb-rules'
import { playGrenadeSound } from './weapon-sounds'
import led from './c4-led.json'
import fireball from './c4-fireball.json'
import grenades from './grenade-sprites.json'

interface Effect {
  entity: Entity
  atlas: typeof led
  at: number
  fps: number
  duration: number
  scale: number
  alpha: number
  frame: number
  rise: number
}
let effects: Effect[] = []
function emit(
  atlas: typeof led,
  position: Vector3,
  at: number,
  scale: number,
  alpha: number,
  fps = 10,
  duration = atlas.frames.length / fps,
  rise = 0
) {
  const entity = engine.addEntity()
  Transform.create(entity, { position })
  MeshRenderer.setPlane(entity)
  VisibilityComponent.create(entity, { visible: false })
  effects.push({ entity, atlas, at, fps, duration, scale, alpha, frame: -1, rise })
}
export function initializeC4Effects() {
  let round = -1,
    phase = '',
    blink = 0
  engine.addSystem((dt) => {
    const bomb = getBomb(),
      now = Date.now() / 1000
    if (!bomb) return
    if (round !== bomb.round) {
      for (const effect of effects) engine.removeEntity(effect.entity)
      effects = []
      round = bomb.round
      phase = ''
      blink = 0
    }
    if (bomb.phase === 'planted') {
      const elapsed = now - (bomb.explodeAt - BOMB_SECONDS),
        wave = Math.floor(elapsed / 2)
      if (wave > blink) {
        blink = wave
        if (elapsed % 2 < 0.2) emit(led, { ...bomb.position, y: bomb.position.y + 0.125 }, now, 0.3, 1, 10, 0.1)
      }
    }
    if (bomb.phase === 'exploded' && phase !== 'exploded') {
      const center = { ...bomb.position, y: bomb.position.y + 1.14 }
      const offset = () => ({
        x: center.x + (Math.random() * 1024 - 512) * 0.025,
        y: center.y + (Math.random() * 20 - 10) * 0.025,
        z: center.z + (Math.random() * 1024 - 512) * 0.025
      })
      // Stock Explode2 writes the negative scale as an unsigned byte: -105 becomes 151.
      emit(grenades.fexplo, { ...center, y: center.y - 0.25 }, now, 15.1, 150 / 255)
      emit(grenades.eexplo, offset(), now, 15.1, 150 / 255)
      emit(grenades.fexplo, offset(), now, 15.1, 150 / 255)
      emit(fireball, offset(), now, 15.1, 17 / 255)
      emit(grenades.steam1, center, now + 0.85, 15, 0.7, 8, grenades.steam1.frames.length / 8, 0.5)
      playGrenadeSound(`debris${1 + Math.floor(Math.random() * 3)}`, center, 0.55)
    }
    phase = bomb.phase
    effects = effects.filter((effect) => {
      const age = now - effect.at
      if (age >= effect.duration) {
        engine.removeEntity(effect.entity)
        return false
      }
      if (age < 0) return true
      const index = Math.min(effect.atlas.frames.length - 1, Math.floor(age * effect.fps))
      const transform = Transform.getMutable(effect.entity)
      transform.rotation = Transform.get(engine.CameraEntity).rotation
      transform.position.y += effect.rise * dt
      if (index !== effect.frame) {
        effect.frame = index
        VisibilityComponent.getMutable(effect.entity).visible = true
        const atlas = effect.atlas,
          frame = atlas.frames[index]
        transform.scale = { x: frame.width * 0.025 * effect.scale, y: frame.height * 0.025 * effect.scale, z: 1 }
        const texture = Material.Texture.Common({
          src: atlas.src,
          wrapMode: TextureWrapMode.TWM_CLAMP,
          tiling: { x: frame.width / atlas.width, y: frame.height / atlas.height },
          offset: { x: frame.x / atlas.width, y: -frame.y / atlas.height }
        })
        Material.setBasicMaterial(effect.entity, {
          texture,
          alphaTexture: texture,
          diffuseColor: { r: 1, g: 1, b: 1, a: effect.alpha },
          castShadows: false
        })
      }
      return true
    })
  })
}
