import { engine, PointerLock, PrimaryPointerInfo } from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { getPractice } from './practice'
import { pointerScreenPoint } from './platform'

export interface MenuRect {
  left: number
  top: number
  width: number
  height: number
}

export interface MenuCursor {
  x: number
  y: number
}

export function pointInRect(x: number, y: number, rect: MenuRect): boolean {
  return x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height
}

export function isTeamMenuOpen(): boolean {
  const match = getPractice()
  if (!match) return true
  const address = myProfile.userId?.toLowerCase()
  const hasSeat = match.roster.some((seat) => seat.address === address && seat.connected)
  return match.matchOver || match.phase === 'ready' || match.phase === 'waiting' || !hasSeat
}

// Cursor position in canvas pixels (same space as UiCanvasInformation); undefined while the pointer is locked.
export function getMenuCursor(): MenuCursor | undefined {
  if (PointerLock.getOrNull(engine.CameraEntity)?.isPointerLocked) return undefined
  const coordinates = PrimaryPointerInfo.getOrNull(engine.RootEntity)?.screenCoordinates
  return coordinates ? pointerScreenPoint(coordinates) : undefined
}
