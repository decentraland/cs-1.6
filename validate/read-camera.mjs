export function readSceneCamera(state) {
  const entity = state['2']?.MainCamera?.virtualCameraEntity
  return entity === undefined ? undefined : state[entity]?.VirtualCamera
}

export function cameraAtZoom(state, horizontalFov) {
  const expected = (2 * Math.atan(Math.tan((horizontalFov * Math.PI) / 360) * 0.75) * 180) / Math.PI
  return Math.abs((readSceneCamera(state)?.fov ?? 0) - expected) < 0.001
}
