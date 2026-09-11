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

  pistol=engine.addEntity()
  Transform.create(pistol,{parent:engine.CameraEntity,position:{x:.16,y:-.2,z:.4}})
  for(const part of [{p:{x:0,y:0,z:.04},s:{x:.05,y:.055,z:.23}},{p:{x:0,y:-.065,z:-.035},s:{x:.045,y:.12,z:.07}}]) {
    const entity=engine.addEntity();Transform.create(entity,{parent:pistol,position:part.p,scale:part.s});MeshRenderer.setBox(entity);Material.setPbrMaterial(entity,{albedoColor:{r:.09,g:.1,b:.11,a:1},roughness:.75});VisibilityComponent.create(entity,{visible:false});pistolParts.push(entity)
  }
  c4 = engine.addEntity()
  Transform.create(c4, { parent: engine.CameraEntity, position: {x:.13,y:-.2,z:.4}, scale: {x:.22,y:.12,z:.25} })
  MeshRenderer.setBox(c4)
  Material.setPbrMaterial(c4, { albedoColor: {r:.2,g:.24,b:.12,a:1},roughness:1 })
  VisibilityComponent.create(c4,{visible:false})
  knife=engine.addEntity()
  Transform.create(knife,{parent:engine.CameraEntity,position:{x:.18,y:-.22,z:.38},rotation:Quaternion.fromEulerDegrees(-20,0,-15)})
  for(const part of [
    {p:{x:0,y:0,z:.12},s:{x:.025,y:.018,z:.22},color:{r:.55,g:.58,b:.57,a:1}},
    {p:{x:0,y:-.015,z:-.1},s:{x:.04,y:.04,z:.12},color:{r:.08,g:.07,b:.055,a:1}},
    {p:{x:0,y:0,z:.015},s:{x:.08,y:.025,z:.025},color:{r:.16,g:.14,b:.1,a:1}}
  ]) {
    const entity=engine.addEntity();Transform.create(entity,{parent:knife,position:part.p,scale:part.s});MeshRenderer.setBox(entity);Material.setPbrMaterial(entity,{albedoColor:part.color,metallic:part.color.r>.5 ? .7 : 0,roughness:.65});VisibilityComponent.create(entity,{visible:false});knifeParts.push(entity)
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
  shotAt=Date.now()/1000
  if (!reloading) play('fire')
}

export function predictKnifeAttack(attack: KnifeAttack) {
  knifeAttack=attack
  knifeAttackAt=Date.now()/1000
}

export function updateWeaponView(player: Entity) {
  const weapon = Weapon.getOrNull(player)
  if (!weapon || model === undefined) return
  const profile=profileByName(weapon.name)
  const secondary=profile.kind==='gun'&&profile.slot==='secondary'
  const visible=!Dead.has(player)&&!hasBombSelected()
  VisibilityComponent.createOrReplace(model,{visible:visible&&profile.kind==='gun'&&!secondary})
  if(pistol!==undefined) {
    const pistolVisible = visible&&secondary
    VisibilityComponent.createOrReplace(pistol,{visible:pistolVisible})
    for (const part of pistolParts) VisibilityComponent.createOrReplace(part, { visible:pistolVisible })
    Transform.getMutable(pistol).position.z=.4-.04*Math.exp(-(Date.now()/1000-shotAt)*24)
  }
  if(knife!==undefined) {
    const knifeVisible=visible&&profile.kind==='knife'
    VisibilityComponent.createOrReplace(knife,{visible:knifeVisible})
    for(const part of knifeParts)VisibilityComponent.createOrReplace(part,{visible:knifeVisible})
    const elapsed=Date.now()/1000-knifeAttackAt
    const motion=elapsed<.35?Math.sin(Math.min(1,elapsed/.35)*Math.PI):0
    const transform=Transform.getMutable(knife)
    transform.position={x:.18,y:-.22+(knifeAttack==='stab' ? .03 : 0)*motion,z:.38+(knifeAttack==='stab' ? .18 : 0)*motion}
    transform.rotation=Quaternion.fromEulerDegrees(-20-(knifeAttack==='stab'?35:0)*motion,(knifeAttack==='swing'?-75:0)*motion,-15-(knifeAttack==='swing'?45:0)*motion)
  }
  if(revision!==weapon.revision){revision=weapon.revision;reloading=false;play('draw')}
  if (c4 !== undefined) VisibilityComponent.createOrReplace(c4,{visible:!Dead.has(player) && hasBombSelected()})
  if (weapon.isReloading !== reloading) {
    reloading = weapon.isReloading
    play(reloading ? 'reload' : 'idle')
  }
}
