import { engine, Entity, GltfContainer, Transform } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'
import { Bot, Dead, PlayerEquipment, PlayerHealth, PlayerTeam } from './components'
import { room } from './index'
import { canPlayRound, getPractice, playerPosition } from './practice'
import { playerEntities } from './server'
import { botAddress } from './team-rules'
import { bulletWorldTrace } from './penetration'
import { canTakeDefuseKit, defuseKitPosition } from './defuse-kit-rules'
import type { SolidPoint } from './solid-trace'

const kits = new Map<Entity, SolidPoint>()
export function clearDefuseKits() {
  for (const entity of kits.keys()) engine.removeEntity(entity)
  kits.clear()
}
export function spawnDefuseKit(feet: SolidPoint) {
  const position = defuseKitPosition(feet, bulletWorldTrace)
  if (!position) return
  const entity = engine.addEntity()
  Transform.validateBeforeChange(entity, (value) => value.senderAddress === AUTH_SERVER_PEER_ID)
  GltfContainer.validateBeforeChange(entity, (value) => value.senderAddress === AUTH_SERVER_PEER_ID)
  Transform.create(entity, { position })
  GltfContainer.create(entity, {
    src: 'assets/scene/weapons/thighpack-drop.glb',
    visibleMeshesCollisionMask: 0,
    invisibleMeshesCollisionMask: 0
  })
  syncEntity(entity, [Transform.componentId, GltfContainer.componentId])
  kits.set(entity, position)
}
export function dropPlayerDefuseKit(player: Entity, position: SolidPoint | undefined) {
  const equipment = PlayerEquipment.getOrNull(player)
  if (!equipment?.defuseKit) return
  PlayerEquipment.getMutable(player).defuseKit = false
  if (position) spawnDefuseKit(position)
}
export function initializeDefuseKits() {
  clearDefuseKits()
  engine.addSystem(() => {
    if (!kits.size || !getPractice()?.round) return
    const actors: {
      address: string
      team: number
      alive: boolean
      defuseKit: boolean
      position: SolidPoint
      take: () => void
    }[] = []
    for (const [address, player] of playerEntities) {
      const position = playerPosition(address),
        equipment = PlayerEquipment.getOrNull(player)
      if (!position || !equipment) continue
      actors.push({
        address,
        position,
        team: PlayerTeam.get(player).team,
        alive: canPlayRound(address) && !Dead.has(player) && PlayerHealth.get(player).current > 0,
        defuseKit: equipment.defuseKit,
        take: () => {
          PlayerEquipment.getMutable(player).defuseKit = true
        }
      })
    }
    for (const [entity, bot, transform] of engine.getEntitiesWith(Bot, Transform)) {
      actors.push({
        address: botAddress(bot.index),
        position: transform.position,
        team: bot.team,
        alive: bot.alive,
        defuseKit: bot.defuseKit,
        take: () => {
          Bot.getMutable(entity).defuseKit = true
        }
      })
    }
    for (const [entity, position] of kits) {
      const player = actors.find((actor) => canTakeDefuseKit(actor, position))
      if (!player) continue
      player.take()
      player.defuseKit = true
      engine.removeEntity(entity)
      kits.delete(entity)
      room.send('playerVoice', { address: player.address, position: player.position, clip: 'kit-pickup' })
    }
  })
}
