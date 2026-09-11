export interface AimAngles { yaw: number; pitch: number }

const radians = Math.PI / 180
export const MOUSE_SENSITIVITY = 0.005236

export function moveAim(aim: AimAngles, dx: number, dy: number) {
  aim.yaw = Math.atan2(Math.sin(aim.yaw + dx * MOUSE_SENSITIVITY), Math.cos(aim.yaw + dx * MOUSE_SENSITIVITY))
  aim.pitch = Math.max(-1.55, Math.min(1.55, aim.pitch - dy * MOUSE_SENSITIVITY))
}

export function aimDirection(aim: AimAngles, punch: AimAngles = { yaw: 0, pitch: 0 }) {
  const yaw = aim.yaw + punch.yaw * radians
  const pitch = Math.max(-1.55, Math.min(1.55, aim.pitch + punch.pitch * radians))
  return { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) }
}
