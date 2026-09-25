import type { WeaponId } from './weapon-profiles'
import type { WeaponModel } from './weapon-models'

export function chooseFire(
  id: WeaponId | 'c4',
  model: WeaponModel,
  mode: number,
  remaining: number,
  lastClip: string,
  random = Math.random,
  sinceLastShot = Infinity
) {
  const suffix = !mode && ['m4a1', 'usp'].includes(id) ? '_unsil' : ''
  if (id === 'elite') {
    const side = mode ? 'left' : 'right'
    const variant =
      sinceLastShot >= 0.5 ? 5 : sinceLastShot >= 0.4 ? 4 : sinceLastShot >= 0.3 ? 3 : sinceLastShot >= 0.2 ? 2 : 1
    return remaining === 0 ? `shoot_${side}last` : `shoot_${side}${variant}`
  }
  if (remaining === 0) {
    const empty = ['shootlast' + suffix, 'shoot_empty', 'shootempty'].find((clip) => model.clips[clip] !== undefined)
    if (empty) return empty
  }
  // The source model names its single-shot clip shoot3; shoot/shoot2 contain the burst.
  if (id === 'glock18' && !mode) return 'shoot3'
  const clips = Object.keys(model.clips).filter((clip) => {
    if (id === 'glock18') return clip === 'shoot' || clip === 'shoot2'
    return new RegExp(`^shoot_?[0-9]*${suffix}$`).test(clip)
  })
  const candidates = clips.filter((clip) => clip !== lastClip)
  return (candidates.length ? candidates : clips)[Math.floor(random() * (candidates.length || clips.length))]
}
