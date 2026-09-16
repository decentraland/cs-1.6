import { engine, Entity, GltfContainer, Transform } from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { myProfile } from '@dcl/sdk/network'
import { DroppedWeapon } from './components'
import { gunProfile } from './weapon-profiles'
import { room } from './index'
import { getPractice } from './practice'
import { playLocalSound, playWorldSound } from './weapon-sounds'
const models = new Map<Entity, Entity>()
export function initializeDroppedWeaponViews() {
  room.onMessage('weaponPickup', (data) => {
    if (data.round !== getPractice()?.round) return
    if (data.address === myProfile.userId?.toLowerCase()) playLocalSound('pickup')
    else playWorldSound('pickup', data.position)
  })
  engine.addSystem(() => {
    for (const [entity, data] of engine.getEntitiesWith(DroppedWeapon)) {
      if (!gunProfile(data.gun)) continue
      let model = models.get(entity)
      if (model === undefined) {
        model = engine.addEntity()
        Transform.create(model, {
          position: data.position,
          rotation: Quaternion.fromEulerDegrees(0, (data.yaw * 180) / Math.PI, 0)
        })
        GltfContainer.create(model, {
          src: `assets/scene/weapons/${data.gun}-drop.glb`,
          visibleMeshesCollisionMask: 0,
          invisibleMeshesCollisionMask: 0
        })
        models.set(entity, model)
      }
      const transform = Transform.getMutable(model)
      transform.position = Vector3.lerp(transform.position, data.position, 0.65)
    }
    for (const [entity, model] of models)
      if (!DroppedWeapon.has(entity)) {
        engine.removeEntity(model)
        models.delete(entity)
      }
  })
}
