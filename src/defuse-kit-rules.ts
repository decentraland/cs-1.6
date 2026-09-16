import type { SolidPoint } from './solid-trace'
import type { TossTrace } from './weapon-box-rules'
import { touchesWeaponBox } from './weapon-box-rules'

export function defuseKitPosition(feet: SolidPoint, trace: TossTrace): SolidPoint | undefined {
  const floor = trace({ ...feet, y: feet.y + 0.9 }, { x: 0, y: -1, z: 0 }, 6.4)
  return floor.solid && !floor.allSolid ? { ...floor.position, y: floor.position.y + 0.001 } : undefined
}
export function canTakeDefuseKit(
  player: { team: number; alive: boolean; defuseKit: boolean; position: SolidPoint },
  position: SolidPoint
) {
  return player.alive && player.team === 2 && !player.defuseKit && touchesWeaponBox(player.position, position)
}
