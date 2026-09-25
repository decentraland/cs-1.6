import { engine, Entity, AudioSource, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { GunId } from './weapon-profiles'
import type { KnifeSound } from './knife-feedback-rules'
import type { RicochetSound } from './bullet-impact-rules'

// Original sound provenance is recorded in asset-sources/cs16-weapons/stock-media.json.
export type WeaponSound =
  | RicochetSound
  | 'reload'
  | 'pickup'
  | 'zoom'
  | 'usp_silenced_fire'
  | 'm4a1_silenced_fire'
  | KnifeSound
  | 'dryfire'
  | 'dryfire_pistol'
  | `${GunId}_fire`
const WORLD_POOL = 6
const local = new Map<string, { entities: Entity[]; next: number }>()
const world: Entity[] = []
let nextWorld = 0

export function fireSound(gun: GunId, mode = 0): WeaponSound {
  if (mode && (gun === 'usp' || gun === 'm4a1')) return `${gun}_silenced_fire`
  return `${gun}_fire`
}

// Own weapon: follows the camera so it is always at full volume.
export function playLocalSound(name: WeaponSound, volume = 1, pitch = 1) {
  playLocalPath(`assets/sounds/weapons/${name}.wav`, volume, pitch)
}
export function playModelSound(name: string) {
  playLocalPath(`assets/sounds/weapons/original/${name}`)
}
// Two sources alternate like CS's weapon channel: Unity only restarts a source that was stopped, so replaying
// the same entity while its clip still runs waits for the clip to end (unity-explorer #9903).
function playLocalPath(name: string, volume = 1, pitch = 1) {
  let slot = local.get(name)
  if (slot === undefined) {
    slot = { entities: [0, 1].map(() => engine.addEntity()), next: 0 }
    for (const entity of slot.entities) Transform.create(entity, { parent: engine.CameraEntity })
    local.set(name, slot)
  }
  const entity = slot.entities[slot.next]
  const other = slot.entities[1 - slot.next]
  slot.next = 1 - slot.next
  if (AudioSource.has(other)) AudioSource.stopSound(other, true)
  AudioSource.playSound(entity, name, true)
  const audio = AudioSource.getMutable(entity)
  audio.volume = volume
  audio.pitch = pitch
}

// Other shooters: positional, from a small pool so bursts do not allocate entities.
export function playWorldSound(name: WeaponSound, position: Vector3, volume = 1, pitch = 1) {
  playWorldPath(`assets/sounds/weapons/${name}.wav`, position, volume, pitch)
}
export function playGrenadeSound(name: string, position: Vector3, volume = 1) {
  playWorldPath(`assets/sounds/grenades/${name}.wav`, position, volume)
}
function playWorldPath(path: string, position: Vector3, volume = 1, pitch = 1) {
  if (world.length < WORLD_POOL) {
    const entity = engine.addEntity()
    Transform.create(entity, { position })
    world.push(entity)
  }
  const entity = world[nextWorld % world.length]
  nextWorld++
  Transform.getMutable(entity).position = position
  AudioSource.playSound(entity, path, true)
  const audio = AudioSource.getMutable(entity)
  audio.volume = volume
  audio.pitch = pitch
}

const shellChannels = new Map<string, { entities: Entity[]; next: number }>()

export function playShellReloadSound(owner: string, variant: 1 | 3, position: Vector3, own: boolean, pitch: number) {
  let slot = shellChannels.get(owner)
  if (!slot) {
    if (shellChannels.size >= 10) {
      const oldest = shellChannels.keys().next().value!
      slot = shellChannels.get(oldest)!
      shellChannels.delete(oldest)
    } else slot = { entities: [engine.addEntity(), engine.addEntity()], next: 0 }
  }
  shellChannels.delete(owner)
  shellChannels.set(owner, slot)
  const entity = slot.entities[slot.next]
  const other = slot.entities[1 - slot.next]
  slot.next = 1 - slot.next
  if (AudioSource.has(other)) AudioSource.stopSound(other, true)
  Transform.createOrReplace(entity, own ? { parent: engine.CameraEntity } : { position })
  AudioSource.playSound(entity, `assets/sounds/weapons/shell_reload${variant}.wav`, true)
  const audio = AudioSource.getMutable(entity)
  audio.volume = 1
  audio.pitch = pitch
}
