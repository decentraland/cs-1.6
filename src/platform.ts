import { engine, PointerLock, UiCanvasInformation } from '@dcl/sdk/ecs'
import { isDesktop, isMobile } from '@dcl/sdk/platform'

// Explorer platforms: Bevy web reports 'web', the Godot client 'mobile', Unity 'desktop'.

// The Godot client never locks the pointer, so touch platforms drive aim and fire without it.
export function isTouchPlatform() {
  return isMobile()
}

export function isPointerLocked() {
  return PointerLock.getOrNull(engine.CameraEntity)?.isPointerLocked ?? false
}

// True when gameplay input (look, fire, slot keys) should be honoured: desktop needs the pointer
// captured, touch platforms always have control.
export function hasAimControl() {
  return isTouchPlatform() || isPointerLocked()
}

// Unity reports PrimaryPointerInfo with a bottom-left origin / Y up (decentraland/unity-explorer#10073).
// Remove this flip once that issue is fixed.
function pointerYUp() {
  return isDesktop()
}

// Pointer screen coordinates in UI canvas space (top-left origin, Y down).
export function pointerScreenPoint(point: { x: number; y: number }) {
  if (!pointerYUp()) return { x: point.x, y: point.y }
  const height = UiCanvasInformation.getOrNull(engine.RootEntity)?.height ?? 0
  return { x: point.x, y: height - point.y }
}

// Pointer delta with positive Y meaning the pointer moved down the screen.
export function pointerScreenDelta(delta: { x: number; y: number }) {
  return { x: delta.x, y: pointerYUp() ? -delta.y : delta.y }
}
