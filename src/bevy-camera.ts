import { engine } from '@dcl/sdk/ecs'
import { schema } from './bevy-schema'
import { coreComponentMappings } from '@dcl/ecs/dist/components/generated/component-names.gen'
import { coreComponentMappings as bevyComponents } from '@dcl/bevy-protocol/dist/components/generated/component-names.gen'
import { PBTextureCamera } from '@dcl/bevy-protocol/dist/components/generated/pb/decentraland/sdk/components/texture_camera.gen'
import { PBCameraLayer } from '@dcl/bevy-protocol/dist/components/generated/pb/decentraland/sdk/components/camera_layer.gen'

// Use the upstream Bevy wire format without replacing the scene's authoritative SDK.
Object.assign(coreComponentMappings, {
  'core::TextureCamera': bevyComponents['core::TextureCamera'],
  'core::CameraLayer': bevyComponents['core::CameraLayer']
})
export const TextureCamera = engine.defineComponentFromSchema(
  'core::TextureCamera',
  schema(PBTextureCamera, 'PBTextureCamera')
)
export const CameraLayer = engine.defineComponentFromSchema('core::CameraLayer', schema(PBCameraLayer, 'PBCameraLayer'))
