import { engine } from '@dcl/sdk/ecs'
import { coreComponentMappings } from '@dcl/ecs/dist/components/generated/component-names.gen'
import { coreComponentMappings as bevyComponents } from '@dcl/bevy-protocol/dist/components/generated/component-names.gen'
import { PBAvatarMovement } from '@dcl/bevy-protocol/dist/components/generated/pb/decentraland/sdk/components/avatar_movement.gen'
import { PBAvatarMovementInfo } from '@dcl/bevy-protocol/dist/components/generated/pb/decentraland/sdk/components/avatar_movement_info.gen'
import { schema } from './bevy-schema'

Object.assign(coreComponentMappings, { 'core::AvatarMovementInfo': bevyComponents['core::AvatarMovementInfo'] })
export const AvatarMovementInfo = engine.defineComponentFromSchema(
  'core::AvatarMovementInfo',
  schema(PBAvatarMovementInfo, 'PBAvatarMovementInfo')
)

Object.assign(coreComponentMappings, { 'core::AvatarMovement': bevyComponents['core::AvatarMovement'] })
export const AvatarMovement = engine.defineComponentFromSchema(
  'core::AvatarMovement',
  schema(PBAvatarMovement, 'PBAvatarMovement')
)
