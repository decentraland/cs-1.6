export const BUY_ZONES = [
  {
    team: 2,
    sourceModel: '*29',
    planes: [
      { normal: { x: 1.0, y: -0.0, z: 0.0 }, distance: 68.6775 },
      { normal: { x: -1.0, y: 0.0, z: 0.0 }, distance: -47.770833 },
      { normal: { x: 0.0, y: -0.0, z: 1.0 }, distance: 59.501733 },
      { normal: { x: -0.0, y: 0.0, z: -1.0 }, distance: -44.141733 },
      { normal: { x: -0.0, y: 1.0, z: -0.0 }, distance: 9.172667 },
      { normal: { x: 0.0, y: -1.0, z: 0.0 }, distance: -6.612667 }
    ]
  },
  {
    team: 1,
    sourceModel: '*30',
    planes: [
      { normal: { x: 1.0, y: -0.0, z: 0.0 }, distance: 92.570833 },
      { normal: { x: -1.0, y: 0.0, z: -0.0 }, distance: -73.7975 },
      { normal: { x: 0.0, y: -0.0, z: 1.0 }, distance: 138.0084 },
      { normal: { x: -0.0, y: 0.0, z: -1.0 }, distance: -127.7684 },
      { normal: { x: -0.0, y: 1.0, z: -0.0 }, distance: 17.706 },
      { normal: { x: 0.0, y: -1.0, z: 0.0 }, distance: -10.026 }
    ]
  }
]

export function inBuyZone(feet: { x: number; y: number; z: number }, team: number): boolean {
  return BUY_ZONES.some(
    (zone) =>
      zone.team === team &&
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
  )
}
