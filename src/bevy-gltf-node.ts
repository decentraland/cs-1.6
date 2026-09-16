import { engine } from '@dcl/sdk/ecs'
import { coreComponentMappings } from '@dcl/ecs/dist/components/generated/component-names.gen'
import { coreComponentMappings as bevyComponents } from '@dcl/bevy-protocol/dist/components/generated/component-names.gen'
import { PBGltfNode } from '@dcl/bevy-protocol/dist/components/generated/pb/decentraland/sdk/components/gltf_node.gen'
import { PBGltfNodeState } from '@dcl/bevy-protocol/dist/components/generated/pb/decentraland/sdk/components/gltf_node_state.gen'
import { schema } from './bevy-schema'

Object.assign(coreComponentMappings, { 'core::GltfNode': bevyComponents['core::GltfNode'] })
export const GltfNode = engine.defineComponentFromSchema('core::GltfNode', schema(PBGltfNode, 'PBGltfNode'))

Object.assign(coreComponentMappings, { 'core::GltfNodeState': bevyComponents['core::GltfNodeState'] })
export const GltfNodeState = engine.defineComponentFromSchema(
  'core::GltfNodeState',
  schema(PBGltfNodeState, 'PBGltfNodeState')
)
