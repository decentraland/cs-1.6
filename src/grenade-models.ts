import type { GrenadeId } from './grenade-profiles'
import type { WeaponModel } from './weapon-models'
export const GRENADE_MODELS: Record<GrenadeId, WeaponModel> = {
  hegrenade: {
    src: 'assets/scene/weapons/hegrenade-view.glb',
    prefix: 'fixed_v_hegrenade ',
    idle: 'idle',
    clips: {
      idle: 0.3333333333333333,
      pullpin: 0.975609756097561,
      throw: 0.7666666666666667,
      deploy: 0.6666666666666666
    }
  },
  flashbang: {
    src: 'assets/scene/weapons/flashbang-view.glb',
    prefix: 'fixed_v_flashbang ',
    idle: 'idle',
    clips: {
      idle: 0.3333333333333333,
      pullpin: 0.975609756097561,
      throw: 0.7666666666666667,
      deploy: 0.6666666666666666
    }
  },
  smokegrenade: {
    src: 'assets/scene/weapons/smokegrenade-view.glb',
    prefix: 'fixed_v_smokegrenade ',
    idle: 'idle',
    clips: {
      idle: 0.3333333333333333,
      pullpin: 0.975609756097561,
      throw: 0.7666666666666667,
      deploy: 0.6666666666666666
    }
  }
}
