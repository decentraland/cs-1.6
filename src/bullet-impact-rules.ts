import type { Point } from './ballistics'

export interface SurfaceImpact {
  position: Point
  normal: Point
  material: string
  texture: string
}

export function surfaceImpacts(
  impacts: readonly { position: Point; hit?: unknown; normal?: Point; material?: string; texture?: string }[]
): SurfaceImpact[] {
  return impacts.flatMap((impact) => {
    const n = impact.normal
    if (impact.hit || !n || !impact.texture || impact.texture.toLowerCase() === 'sky') return []
    const length = Math.hypot(n.x, n.y, n.z)
    if (!Number.isFinite(length) || length < 0.001) return []
    return [
      {
        position: impact.position,
        normal: { x: n.x / length, y: n.y / length, z: n.z / length },
        material: impact.material ?? 'C',
        texture: impact.texture
      }
    ]
  })
}

export type RicochetSound = 'ric1' | 'ric2' | 'ric3' | 'ric4' | 'ric5' | 'ric_conc-1' | 'ric_metal-1' | 'ric_metal-2'

export function ricochetSound(material: string, roll: number): RicochetSound | undefined {
  if (roll >= 16383) return undefined
  return material === 'M' || material === 'V'
    ? (['ric_metal-1', 'ric_metal-2'] as const)[roll % 2]
    : (['ric1', 'ric2', 'ric3', 'ric4', 'ric5', 'ric_conc-1'] as const)[roll % 6]
}
