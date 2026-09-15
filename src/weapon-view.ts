import {
  Animator,
  MeshRenderer,
  Material,
  VisibilityComponent,
  CameraModeArea,
  CameraType,
  engine,
  Entity,
  GltfContainer,
  Transform
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { hasBombSelected } from './bomb-client'
import { profileByName } from './weapon-profiles'
import { Weapon, Dead } from './components'
import { getPainPunch, getViewPunch } from './fps-camera'
import type { KnifeAttack } from './knife-rules'

let model: Entity | undefined
let reloading = false
let pistol: Entity | undefined
const pistolParts: Entity[] = []
let shotAt = 0
let revision = -1
let c4: Entity | undefined
let knife: Entity | undefined
const knifeParts: Entity[] = []
let knifeAttackAt = 0
let knifeAttack: KnifeAttack = 'swing'
const shown = new Map<Entity, boolean>()
const poses = new Map<Entity, number[]>()

// The engine camera cannot be punched, so recoil and pain punch tilt the viewmodel at half strength.
// The camera already kicks; the viewmodel adds a subtle extra tilt.
const PUNCH_SCALE = 0.25

function setShown(entity: Entity, visible: boolean) {
  if (shown.get(entity) === visible) return
  shown.set(entity, visible)
  VisibilityComponent.createOrReplace(entity, { visible })
}

function setPose(entity: Entity, position: Vector3, euler: Vector3) {
  const next = [position.x, position.y, position.z, euler.x, euler.y, euler.z]
  const last = poses.get(entity)
  if (last && last.every((value, index) => Math.abs(value - next[index]) < 1e-4)) return
  poses.set(entity, next)
  const transform = Transform.getMutable(entity)
  transform.position = position
  transform.rotation = Quaternion.fromEulerDegrees(euler.x, euler.y, euler.z)
}

export function attachWeaponModel() {
  if (model !== undefined && GltfContainer.has(model)) return

  const cameraArea = engine.addEntity()
  Transform.create(cameraArea, {
    parent: engine.PlayerEntity,
    position: Vector3.create(0, 1, 0)
  })
  CameraModeArea.create(cameraArea, {
    area: Vector3.create(4, 4, 4),
    mode: CameraType.CT_FIRST_PERSON
  })

  pistol = engine.addEntity()
  Transform.create(pistol, { parent: engine.CameraEntity, position: { x: 0.16, y: -0.2, z: 0.4 } })
  for (const part of [
    { p: { x: 0, y: 0, z: 0.04 }, s: { x: 0.05, y: 0.055, z: 0.23 } },
    { p: { x: 0, y: -0.065, z: -0.035 }, s: { x: 0.045, y: 0.12, z: 0.07 } }
  ]) {
    const entity = engine.addEntity()
    Transform.create(entity, { parent: pistol, position: part.p, scale: part.s })
    MeshRenderer.setBox(entity)
    Material.setPbrMaterial(entity, { albedoColor: { r: 0.09, g: 0.1, b: 0.11, a: 1 }, roughness: 0.75 })
    VisibilityComponent.create(entity, { visible: false })
    shown.set(entity, false)
    pistolParts.push(entity)
  }
  c4 = engine.addEntity()
  Transform.create(c4, {
    parent: engine.CameraEntity,
    position: { x: 0.13, y: -0.2, z: 0.4 },
    scale: { x: 0.22, y: 0.12, z: 0.25 }
  })
  MeshRenderer.setBox(c4)
  Material.setPbrMaterial(c4, { albedoColor: { r: 0.2, g: 0.24, b: 0.12, a: 1 }, roughness: 1 })
  VisibilityComponent.create(c4, { visible: false })
  shown.set(c4, false)
  knife = engine.addEntity()
  Transform.create(knife, {
    parent: engine.CameraEntity,
    position: { x: 0.18, y: -0.22, z: 0.38 },
    rotation: Quaternion.fromEulerDegrees(-20, 0, -15)
  })
  for (const part of [
    { p: { x: 0, y: 0, z: 0.12 }, s: { x: 0.025, y: 0.018, z: 0.22 }, color: { r: 0.55, g: 0.58, b: 0.57, a: 1 } },
    { p: { x: 0, y: -0.015, z: -0.1 }, s: { x: 0.04, y: 0.04, z: 0.12 }, color: { r: 0.08, g: 0.07, b: 0.055, a: 1 } },
    { p: { x: 0, y: 0, z: 0.015 }, s: { x: 0.08, y: 0.025, z: 0.025 }, color: { r: 0.16, g: 0.14, b: 0.1, a: 1 } }
  ]) {
    const entity = engine.addEntity()
    Transform.create(entity, { parent: knife, position: part.p, scale: part.s })
    MeshRenderer.setBox(entity)
    Material.setPbrMaterial(entity, {
      albedoColor: part.color,
      metallic: part.color.r > 0.5 ? 0.7 : 0,
      roughness: 0.65
    })
    VisibilityComponent.create(entity, { visible: false })
    shown.set(entity, false)
    knifeParts.push(entity)
  }
  model = engine.addEntity()
  Transform.create(model, {
    parent: engine.CameraEntity,
    position: Vector3.create(0.16, -0.2, 0.35)
  })
  GltfContainer.create(model, {
    src: 'assets/scene/weapons/ak47.glb',
    visibleMeshesCollisionMask: 0,
    invisibleMeshesCollisionMask: 0
  })
  Animator.create(model, {
    states: [
      { clip: 'idle', playing: true, loop: true },
      { clip: 'draw', playing: false, loop: false },
      { clip: 'fire', playing: false, loop: false },
      { clip: 'reload', playing: false, loop: false }
    ]
  })
}

function play(clip: string) {
  if (model === undefined) return
  for (const animation of Animator.getMutable(model).states) {
    animation.playing = animation.clip === clip
    animation.shouldReset = animation.clip === clip
  }
}

export function predictWeaponShot() {
  shotAt = Date.now() / 1000
  if (!reloading) play('fire')
}

export function predictKnifeAttack(attack: KnifeAttack) {
  knifeAttack = attack
  knifeAttackAt = Date.now() / 1000
}

export function updateWeaponView(player: Entity) {
  const weapon = Weapon.getOrNull(player)
  if (!weapon || model === undefined) return
  const profile = profileByName(weapon.name)
  const secondary = profile.kind === 'gun' && profile.slot === 'secondary'
  const alive = !Dead.has(player)
  const visible = alive && !hasBombSelected()
  const now = Date.now() / 1000
  const punch = getViewPunch(now)
  const pain = getPainPunch(now)
  const tilt = { x: -(punch.pitch + pain.pitch) * PUNCH_SCALE, y: punch.yaw * PUNCH_SCALE, z: pain.roll * PUNCH_SCALE }
  const kick = Math.exp(-(now - shotAt) * 24)
  const primaryVisible = visible && profile.kind === 'gun' && !secondary
  setShown(model, primaryVisible)
  if (primaryVisible) setPose(model, { x: 0.16, y: -0.2, z: 0.35 - 0.03 * kick }, tilt)
  if (pistol !== undefined) {
    const pistolVisible = visible && secondary
    setShown(pistol, pistolVisible)
    for (const part of pistolParts) setShown(part, pistolVisible)
    if (pistolVisible) setPose(pistol, { x: 0.16, y: -0.2, z: 0.4 - 0.04 * kick }, tilt)
  }
  if (knife !== undefined) {
    const knifeVisible = visible && profile.kind === 'knife'
    setShown(knife, knifeVisible)
    for (const part of knifeParts) setShown(part, knifeVisible)
    if (knifeVisible) {
      const elapsed = now - knifeAttackAt
      const motion = elapsed < 0.35 ? Math.sin(Math.min(1, elapsed / 0.35) * Math.PI) : 0
      setPose(
        knife,
        {
          x: 0.18,
          y: -0.22 + (knifeAttack === 'stab' ? 0.03 : 0) * motion,
          z: 0.38 + (knifeAttack === 'stab' ? 0.18 : 0) * motion
        },
        {
          x: -20 - (knifeAttack === 'stab' ? 35 : 0) * motion + tilt.x,
          y: (knifeAttack === 'swing' ? -75 : 0) * motion + tilt.y,
          z: -15 - (knifeAttack === 'swing' ? 45 : 0) * motion + tilt.z
        }
      )
    }
  }
  if (revision !== weapon.revision) {
    revision = weapon.revision
    reloading = false
    play('draw')
  }
  if (c4 !== undefined) setShown(c4, alive && hasBombSelected())
  if (weapon.isReloading !== reloading) {
    reloading = weapon.isReloading
    play(reloading ? 'reload' : 'idle')
  }
}
