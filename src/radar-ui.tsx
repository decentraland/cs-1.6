import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { engine, PlayerIdentityData, Transform } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import { myProfile } from '@dcl/sdk/network'
import { Dead, PlayerAddress, PlayerHealth } from './components'
import { getLocalPlayerEntity } from './client'
import { getPractice } from './practice'
import { getBomb } from './bomb'
import { getFpsAimDirection } from './fps-camera'
import { radarMarkers, RadarMarker } from './radar-rules'

let bombKey = '', flashStarted = 0
const shapes: Record<RadarMarker['shape'], readonly (readonly [number, number, number, number])[]> = {
  dot: [[-2, -2, 4, 4]], above: [[-2, -2, 6, 2], [0, 0, 2, 4]], below: [[0, -2, 2, 4], [-2, 2, 6, 2]],
  bomb: [[0, 0, 2, 2], [-2, -2, 2, 2], [-2, 2, 2, 2], [2, -2, 2, 2], [2, 2, 2, 2]]
}

export function Radar({ width }: { width: number }) {
  const match = getPractice(), player = getLocalPlayerEntity(), local = myProfile.userId?.toLowerCase() ?? ''
  const seat = match?.roster.find(seat => seat.address === local && seat.connected)
  if (!match || player === null || Dead.has(player) || (PlayerHealth.getOrNull(player)?.current ?? 0) <= 0 || ['ready', 'waiting'].includes(match.phase) || match.matchOver) return null
  const origin = Transform.getOrNull(engine.PlayerEntity)?.position
  if (!origin || match.mode === 'teams' && (!seat || seat.eligibleRound > match.round)) return null
  const positions = new Map(Array.from(engine.getEntitiesWith(PlayerIdentityData, Transform)).map(([, identity, transform]) => [identity.address.toLowerCase(), transform.position]))
  const alive = new Map(Array.from(engine.getEntitiesWith(PlayerAddress, PlayerHealth)).map(([entity, identity, health]) => [identity.address, !Dead.has(entity) && health.current > 0]))
  const players = match.roster.filter(seat => positions.has(seat.address)).map(seat => ({ ...seat, alive: alive.get(seat.address) === true, position: positions.get(seat.address)! }))
  const bomb = match.mode === 'teams' ? getBomb() : undefined
  const key = `${match.round}:${bomb?.phase}:${bomb?.position.x}:${bomb?.position.z}`
  const now = Date.now() / 1000
  if (key !== bombKey) { bombKey = key; flashStarted = now }
  const markers = radarMarkers(players, local, seat?.team ?? 2, match.round, origin, getFpsAimDirection(), bomb, Math.floor((now - flashStarted) / .5) % 2 === 0)
  const scale = Math.min(1, width / 640)
  return <UiEntity uiTransform={{ positionType: 'absolute', position: { left: 0, top: 0 }, width: 128 * scale, height: 128 * scale, pointerFilter: 'none' }}
    uiBackground={{ texture: { src: 'assets/ui/radar.png', filterMode: 'point' }, textureMode: 'stretch', color: Color4.create(25 / 255, 75 / 255, 25 / 255, 1) }}>
    {markers.map(marker => <UiEntity key={marker.id} uiTransform={{ positionType: 'absolute', position: { left: (64 + Math.trunc(marker.x)) * scale, top: (64 + Math.trunc(marker.y)) * scale }, width: 0, height: 0, pointerFilter: 'none' }}>
      {shapes[marker.shape].map(([left, top, width, height], index) => <UiEntity key={String(index)} uiTransform={{ positionType: 'absolute', position: { left: left * scale, top: top * scale }, width: width * scale, height: height * scale, pointerFilter: 'none' }} uiBackground={{ color: marker.red ? Color4.Red() : Color4.White() }} />)}
    </UiEntity>)}
  </UiEntity>
}
