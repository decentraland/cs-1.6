import { engine, Entity, Material, MeshRenderer, Transform, VisibilityComponent } from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { room } from './index'

interface Particle {
  entity: Entity
  age: number
  life: number
  size: number
  velocity: { x: number; y: number; z: number }
}
const particles: Particle[] = []
let nextParticle = 0
let damagedAt = -Infinity

export function receivedHit() {
  damagedAt = Date.now() / 1000
}

export function damagePulse() {
  return Math.max(0, 1 - (Date.now() / 1000 - damagedAt) / 0.3)
}

export function initializeCombatEffects() {
  room.onMessage('combatImpact', (data) => {
    if (data.target === myProfile.userId?.toLowerCase()) return
    const count = data.armor ? 5 : data.wasKill ? 14 : 9
    const height = data.hitGroup === 'head' ? 1.55 : data.hitGroup === 'legs' ? 0.45 : 1.05
    for (let i = 0; i < count; i++) {
      let particle = particles[nextParticle]
      if (!particle) {
        particle = { entity: engine.addEntity(), age: 0, life: 0, size: 0, velocity: { x: 0, y: 0, z: 0 } }
        particles.push(particle)
        MeshRenderer.setSphere(particle.entity)
      }
      nextParticle = (nextParticle + 1) % 96
      const angle = (i / count) * Math.PI * 2
      particle.age = 0
      particle.life = data.armor ? 0.14 : 0.38
      particle.size = data.armor ? 0.035 : data.wasKill ? 0.075 : 0.06
      particle.velocity = { x: Math.cos(angle) * 1.1, y: 0.45 + (i % 3) * 0.3, z: Math.sin(angle) * 1.1 }
      Transform.createOrReplace(particle.entity, {
        position: { x: data.position.x, y: data.position.y + height, z: data.position.z },
        scale: { x: particle.size, y: particle.size, z: particle.size }
      })
      VisibilityComponent.createOrReplace(particle.entity, { visible: true })
      Material.setPbrMaterial(particle.entity, {
        albedoColor: data.armor ? { r: 1, g: 0.75, b: 0.25, a: 1 } : { r: 0.65, g: 0.01, b: 0.01, a: 1 },
        emissiveColor: data.armor ? { r: 1, g: 0.6, b: 0.1 } : { r: 0.25, g: 0, b: 0 },
        emissiveIntensity: data.armor ? 2 : 0.6,
        roughness: 1
      })
    }
  })
  engine.addSystem((dt) => {
    for (const particle of particles) {
      if (particle.age >= particle.life) continue
      particle.age += dt
      if (particle.age >= particle.life) {
        VisibilityComponent.getMutable(particle.entity).visible = false
        continue
      }
      const transform = Transform.getMutable(particle.entity)
      particle.velocity.y -= 3.5 * dt
      transform.position.x += particle.velocity.x * dt
      transform.position.y += particle.velocity.y * dt
      transform.position.z += particle.velocity.z * dt
      const size = particle.size * (1 - particle.age / particle.life)
      transform.scale = { x: size, y: size, z: size }
    }
  })
}
