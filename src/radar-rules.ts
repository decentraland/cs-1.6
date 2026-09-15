export interface RadarPoint {
  x: number
  y: number
  z: number
}
export interface RadarPlayer {
  address: string
  team: number
  connected: boolean
  eligibleRound: number
  alive: boolean
  position: RadarPoint
}
export interface RadarBomb {
  phase: string
  carrier: string
  position: RadarPoint
}
export interface RadarMarker {
  id: string
  x: number
  y: number
  shape: 'dot' | 'above' | 'below' | 'bomb'
  red: boolean
}
export const RADAR_RADIUS = 64
const mapScale = 2 / 75

export function radarPosition(origin: RadarPoint, target: RadarPoint, forward: RadarPoint) {
  const dx = target.x - origin.x,
    dz = target.z - origin.z
  const length = Math.hypot(dx, dz),
    heading = Math.hypot(forward.x, forward.z)
  const fx = heading > 0 ? forward.x / heading : 0,
    fz = heading > 0 ? forward.z / heading : 1
  const scale = length > 0 ? Math.min(length / (32 * mapScale), RADAR_RADIUS) / length : 0
  return {
    x: (dx * fz - dz * fx) * scale,
    y: -(dx * fx + dz * fz) * scale,
    shape:
      target.y - origin.y >= 128 * mapScale
        ? ('above' as const)
        : target.y - origin.y <= -128 * mapScale
          ? ('below' as const)
          : ('dot' as const)
  }
}

export function radarMarkers(
  players: readonly RadarPlayer[],
  local: string,
  team: number,
  round: number,
  origin: RadarPoint,
  forward: RadarPoint,
  bomb?: RadarBomb,
  bombVisible = true
): RadarMarker[] {
  if (team !== 1 && team !== 2) return []
  const markers: RadarMarker[] = players
    .filter(
      (player) =>
        player.address !== local &&
        player.team === team &&
        player.connected &&
        player.alive &&
        player.eligibleRound <= round
    )
    .map((player) => ({
      id: player.address,
      ...radarPosition(origin, player.position, forward),
      red: team === 1 && bomb?.carrier === player.address && ['carried', 'planting'].includes(bomb.phase)
    }))
  if (team === 1 && bombVisible && bomb && ['dropped', 'planted'].includes(bomb.phase)) {
    const point = radarPosition(origin, bomb.position, forward)
    markers.push({ id: 'c4', ...point, shape: bomb.phase === 'planted' ? 'bomb' : point.shape, red: true })
  }
  return markers
}
