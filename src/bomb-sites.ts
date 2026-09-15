import { BombPoint } from './bomb-rules'

export const BOMB_SITES = [
  {
    site: 'B',
    min: { x: 99.3975, y: 10.026, z: 35.6084 },
    max: { x: 109.6375, y: 12.586, z: 45.8484 },
    planes: [
      { normal: { x: -1.0, y: 0.0, z: -0.0 }, distance: -99.3975 },
      { normal: { x: 0.0, y: 0.0, z: -1.0 }, distance: -35.6084 },
      { normal: { x: 1.0, y: -0.0, z: -0.0 }, distance: 109.6375 },
      { normal: { x: 0.0, y: -0.0, z: 1.0 }, distance: 45.8484 },
      { normal: { x: -0.0, y: 1.0, z: -0.0 }, distance: 12.586 },
      { normal: { x: 0.0, y: -1.0, z: 0.0 }, distance: -10.026 },
      { normal: { x: 0.70710677, y: 0.0, z: -0.70710677 }, distance: 50.536286 }
    ]
  },
  {
    site: 'A',
    min: { x: 29.42417, y: 12.586, z: 42.43507 },
    max: { x: 36.25083, y: 15.146, z: 50.9684 },
    planes: [
      { normal: { x: 0.0, y: 0.0, z: 1.0 }, distance: 50.9684 },
      { normal: { x: -0.0, y: -0.0, z: -1.0 }, distance: -42.435067 },
      { normal: { x: 1.0, y: -0.0, z: 0.0 }, distance: 36.250833 },
      { normal: { x: -1.0, y: -0.0, z: -0.0 }, distance: -29.424167 },
      { normal: { x: 0.0, y: -1.0, z: 0.0 }, distance: -12.586 },
      { normal: { x: -0.0, y: 1.0, z: -0.0 }, distance: 15.146 }
    ]
  }
]

export function bombSiteAt(feet: BombPoint): string {
  return (
    BOMB_SITES.find((zone) =>
      zone.planes.every(
        ({ normal: n, distance }) =>
          n.x * feet.x +
            n.y * (feet.y + 0.9) +
            n.z * feet.z -
            0.4 * Math.abs(n.x) -
            0.9 * Math.abs(n.y) -
            0.4 * Math.abs(n.z) <=
          distance + 0.001
      )
    )?.site ?? ''
  )
}
