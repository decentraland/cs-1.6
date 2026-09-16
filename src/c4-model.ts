import type { WeaponModel } from './weapon-models'

export const C4_MODEL: WeaponModel = {
  src: 'assets/scene/weapons/c4-view.glb',
  prefix: 'fixed_v_c4 ',
  idle: 'idle1',
  clips: { idle1: 2.5, draw: 0.5, drop: 1.5, pressbutton: 100 / 33 }
}
export const C4_ANIMATION_SOUNDS: Record<string, { at: number; sound: string }[]> = {
  pressbutton: [39, 47, 54, 62, 70, 78, 84].map((frame) => ({ at: frame / 33, sound: 'c4_click.wav' }))
}
