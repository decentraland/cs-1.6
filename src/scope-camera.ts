import { engine, Entity, Transform, UiCanvasInformation, UiTransform, UiBackground } from '@dcl/sdk/ecs'
import { TextureCamera, CameraLayer } from './bevy-camera'
let camera: Entity | undefined
let overlay: Entity | undefined
export function updateScopeCamera(source: Entity, zoom: number, warmZoom = 90) {
  const active = zoom !== 90
  if (!active && overlay !== undefined) {
    engine.removeEntity(overlay)
    overlay = undefined
  }
  if (warmZoom === 90) {
    if (camera !== undefined && TextureCamera.has(camera)) TextureCamera.deleteFrom(camera)
    if (overlay !== undefined) {
      engine.removeEntity(overlay)
      overlay = undefined
    }
    return
  }
  if (camera === undefined) {
    camera = engine.addEntity()
    Transform.create(camera)
    CameraLayer.create(camera, { layer: 0, directionalLight: true, showAvatars: true, showSkybox: true, showFog: true })
  }
  Transform.createOrReplace(camera, Transform.get(source))
  const canvas = UiCanvasInformation.getOrNull(engine.RootEntity)
  const width = canvas?.width ?? 1280,
    height = canvas?.height ?? 720
  const resolution = Math.min(1, 1280 / width, 1280 / height)
  if (active && overlay === undefined) {
    overlay = engine.addEntity()
    UiTransform.create(overlay)
  }
  if (overlay !== undefined) {
    Object.assign(UiTransform.getMutable(overlay), {
      parent: engine.RootEntity,
      width,
      height,
      widthUnit: 1,
      heightUnit: 1,
      positionType: 1,
      positionLeftUnit: 1,
      positionLeft: 0,
      positionTopUnit: 1,
      positionTop: 0,
      pointerFilter: 0,
      zIndex: -1
    })
    UiBackground.createOrReplace(overlay, {
      textureMode: 2,
      uvs: [],
      texture: { tex: { $case: 'videoTexture', videoTexture: { videoPlayerEntity: camera } } }
    })
  }
  const fieldOfView = zoom === 90 ? warmZoom : zoom
  TextureCamera.createOrReplace(camera, {
    width: Math.max(16, Math.round(width * resolution)),
    height: Math.max(16, Math.round(height * resolution)),
    layer: 0,
    mode: {
      $case: 'perspective',
      perspective: { fieldOfView: 2 * Math.atan(Math.tan((fieldOfView * Math.PI) / 360) * 0.75) }
    }
  })
}
