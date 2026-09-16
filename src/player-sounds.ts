import { engine, Entity, AudioSource, Transform, AssetLoad } from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { Bot, PlayerAddress, PlayerPose } from './components'
import { room } from './index'
import { PLAYER_SOUNDS } from './player-sound-rules'

const voices = new Map<string, { entity: Entity; expires: number }>()
export function initializePlayerSounds() {
  AssetLoad.create(engine.addEntity(), {
    assets: PLAYER_SOUNDS.map((name) => `assets/sounds/player/original/${name}.wav`)
  })
  // Room already authenticates the server; client callbacks have no sender context.
  room.onMessage('playerVoice', (data) => {
    if (!PLAYER_SOUNDS.some((name) => name === data.clip)) return
    const key = data.address + (data.clip === 'bodysplat' ? ':splat' : ':voice')
    let voice = voices.get(key)
    if (!voice) {
      voice = { entity: engine.addEntity(), expires: 0 }
      voices.set(key, voice)
    }
    voice.expires = Date.now() / 1000 + 4
    Transform.createOrReplace(
      voice.entity,
      data.address === myProfile.userId?.toLowerCase()
        ? { parent: engine.CameraEntity }
        : { position: { ...data.position, y: data.position.y + 0.9 } }
    )
    AudioSource.playSound(voice.entity, `assets/sounds/player/original/${data.clip}.wav`, true)
  })
  engine.addSystem(() => {
    const positions = new Map<string, { x: number; y: number; z: number }>()
    for (const [, address, pose] of engine.getEntitiesWith(PlayerAddress, PlayerPose))
      if (pose.valid) positions.set(address.address, pose.position)
    for (const [, bot, transform] of engine.getEntitiesWith(Bot, Transform))
      positions.set(`bot:${bot.index}`, transform.position)
    for (const [key, voice] of voices) {
      if (voice.expires < Date.now() / 1000) {
        engine.removeEntity(voice.entity)
        voices.delete(key)
      } else {
        const transform = Transform.getMutable(voice.entity),
          address = key.slice(0, key.lastIndexOf(':'))
        const position = positions.get(address)
        if (transform.parent !== engine.CameraEntity && position)
          transform.position = { ...position, y: position.y + 0.9 }
      }
    }
  })
}
