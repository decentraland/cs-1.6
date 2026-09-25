import type { Vector3 } from '@dcl/sdk/math'
import type { WeaponState } from './combat-rules'
import { profileByName } from './weapon-profiles'
import { getPractice, playerPosition } from './practice'
import { room } from './index'

const RELOAD_HEARING_DISTANCE = 512 * 0.025

export function broadcastReloadSound(
  owner: string,
  weapon: Readonly<WeaponState>,
  origin: Readonly<Vector3> | undefined = playerPosition(owner)
) {
  const gun = profileByName(weapon.name ?? '')
  if (gun.kind !== 'gun' || gun.shellReload) return
  const match = getPractice()
  if (!match || !origin) return
  for (const seat of match.roster) {
    if (!seat.connected || seat.address === owner || seat.address.startsWith('bot:')) continue
    const listener = playerPosition(seat.address)
    if (!listener) continue
    const distance = Math.hypot(origin.x - listener.x, origin.y - listener.y, origin.z - listener.z)
    if (!Number.isFinite(distance) || distance > RELOAD_HEARING_DISTANCE) continue
    const volume = Math.floor((1 - distance / RELOAD_HEARING_DISTANCE) * 255)
    room.send('weaponReloadSound', { round: match.round, volume }, { to: [seat.address] })
  }
}

export function broadcastShellReloadSound(
  owner: string,
  weapon: Readonly<WeaponState>,
  position: Readonly<Vector3> | undefined = playerPosition(owner)
) {
  const match = getPractice()
  if (weapon.name !== 'XM1014' || !match || !position) return
  room.send('shellReloadSound', {
    owner,
    round: match.round,
    position,
    variant: Math.random() < 0.5 ? 1 : 3,
    pitch: 85 + Math.floor(Math.random() * 32)
  })
}
