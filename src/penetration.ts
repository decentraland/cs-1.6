import { GUNS, GunId } from './weapon-profiles'
import { hitMultiplier, regionDistance } from './hit-regions'
import { SolidTracer } from './solid-trace'
import { DUST2_SOLIDS } from './dust2-solids'
import type { Point, ShotTarget, HitGroup } from './ballistics'
import type { SolidTrace } from './solid-trace'

const world = new SolidTracer(DUST2_SOLIDS)
export const bulletWorldTrace = (origin: Point, direction: Point, range: number) =>
  world.trace(origin, direction, range)
const BULLETS: Record<string, readonly [number, number]> = {
  '9mm': [21, 800],
  '45acp': [15, 500],
  '50ae': [30, 1000],
  '762nato': [39, 5000],
  '556nato': [35, 4000],
  '556natobox': [35, 4000],
  '338magnum': [45, 8000],
  '57mm': [30, 2000],
  '357sig': [25, 800]
}
export function penetrationCount(id: GunId): number {
  if (['awp', 'scout', 'g3sg1'].includes(id)) return 3
  if (GUNS[id].category === 'rifles' || id === 'deagle' || id === 'm249') return 2
  return 1
}
export interface BulletImpact<T> {
  hit?: { target: T; group: HitGroup }
  distance: number
  position: Point
  damage: number
  material: string
}
export function traceBullet<T>(options: {
  gun: GunId
  origin: Point
  direction: Point
  damage: number
  rangeModifier: number
  targets: readonly ShotTarget<T>[]
  traceWorld?: (origin: Point, direction: Point, range: number) => SolidTrace
}): BulletImpact<T>[] {
  const { gun, direction, targets } = options,
    profile = GUNS[gun],
    traceWorld = options.traceWorld ?? bulletWorldTrace
  let source = { ...options.origin },
    range = profile.range,
    damage = options.damage,
    count = penetrationCount(gun)
  let [power, penetrationDistance] = BULLETS[profile.ammoType] ?? [0, 0]
  let damageModifier = 0.5,
    travelled = 0
  const impacts: BulletImpact<T>[] = []
  const damaged = new Set<T>()
  while (count > 0 && range > 0 && damage > 0) {
    const wall = traceWorld(source, direction, range)
    if (wall.allSolid) break
    let distance = wall.solid ? wall.distance : range
    let hit: BulletImpact<T>['hit']
    for (const target of targets.filter((target) => !damaged.has(target.id)))
      for (const region of target.regions) {
        const candidate = regionDistance(source, direction, target, region)
        if (candidate !== undefined && candidate < distance) {
          distance = candidate
          hit = { target: target.id, group: region.group }
        }
      }
    const position = {
      x: source.x + direction.x * distance,
      y: source.y + direction.y * distance,
      z: source.z + direction.z * distance
    }
    if (!hit && !wall.solid) {
      impacts.push({ distance: travelled + distance, position, damage: 0, material: '' })
      break
    }
    const material = hit ? 'F' : wall.material
    switch (material) {
      case 'M':
        power = Math.trunc(power * 0.15)
        damageModifier = 0.2
        break
      case 'C':
        power = Math.trunc(power * 0.25)
        break
      case 'G':
        power = Math.trunc(power * 0.5)
        damageModifier = 0.4
        break
      case 'V':
        power = Math.trunc(power * 0.5)
        damageModifier = 0.45
        break
      case 'T':
        power = Math.trunc(power * 0.65)
        damageModifier = 0.3
        break
      case 'P':
        power = Math.trunc(power * 0.4)
        damageModifier = 0.45
        break
      case 'W':
        damageModifier = 0.6
        break
    }
    count--
    damage = Math.floor(damage * options.rangeModifier ** (distance / 12.5))
    if (distance > penetrationDistance * 0.025) count = 0
    impacts.push({
      hit,
      distance: travelled + distance,
      position,
      material,
      damage: hit ? damage * hitMultiplier(hit.group) : 0
    })
    if (hit) damaged.add(hit.target)
    let distanceModifier = 0.5
    if (hit || count === 0) {
      power = 42
      damageModifier = 0.75
      distanceModifier = 0.75
    }
    const advance = power * 0.025
    source = {
      x: position.x + direction.x * advance,
      y: position.y + direction.y * advance,
      z: position.z + direction.z * advance
    }
    travelled += distance + advance
    range = (range - distance) * distanceModifier
    damage = Math.floor(damage * damageModifier)
  }
  return impacts
}
