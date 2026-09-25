import { chooseFire } from './weapon-fire-animation'
import {
  Animator,
  VisibilityComponent,
  CameraModeArea,
  CameraType,
  engine,
  Entity,
  GltfContainer,
  Transform
} from '@dcl/sdk/ecs'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { getC4Animation, hasBombSelected } from './bomb-client'
import { profileByName, WeaponId } from './weapon-profiles'
import { C4_MODEL, C4_ANIMATION_SOUNDS } from './c4-model'
import { WEAPON_MODELS, WeaponModel } from './weapon-models'
import { WEAPON_ANIMATION_SOUNDS } from './weapon-animation-sounds'
import { playModelSound, playLocalSound } from './weapon-sounds'
import { Weapon, Dead } from './components'
import { getPainPunch, getViewPunch, getCameraZoom } from './fps-camera'
import type { KnifeAttack } from './knife-rules'

interface View {
  entity: Entity
  model: WeaponModel
  visible: boolean
  lastClip: string
  idleAt: number
  firedAt: number
}
type ViewId = WeaponId | 'c4'
const views = new Map<ViewId, View>()
let activeId: ViewId | undefined
let revision = -1
let mode = 0
let reloadStep = -1
let reloading = false
let c4Serial = -1
let initialized = false
let lastKnife = 0
let sounds: { at: number; sound: string }[] = []
let interruptedReload = -1
let predictedGrenadeMode = -1

export function attachWeaponModel() {
  if (initialized) return
  initialized = true
  const cameraArea = engine.addEntity()
  Transform.create(cameraArea, { parent: engine.PlayerEntity, position: Vector3.create(0, 1, 0) })
  CameraModeArea.create(cameraArea, { area: Vector3.create(4, 4, 4), mode: CameraType.CT_FIRST_PERSON })
}

function viewFor(id: ViewId): View {
  const cached = views.get(id)
  if (cached) {
    views.delete(id)
    views.set(id, cached)
    return cached
  }
  const model = id === 'c4' ? C4_MODEL : WEAPON_MODELS[id]
  const entity = engine.addEntity()
  Transform.create(entity, { parent: engine.CameraEntity })
  GltfContainer.create(entity, { src: model.src, visibleMeshesCollisionMask: 0, invisibleMeshesCollisionMask: 0 })
  Animator.create(entity, {
    states: Object.keys(model.clips)
      .flatMap((clip) => (clip.startsWith('idle') ? [clip] : [clip, clip + '__repeat']))
      .map((clip) => ({
        clip: model.prefix + clip,
        playing: clip === model.idle,
        loop: clip.startsWith('idle'),
        speed: 1
      }))
  })
  VisibilityComponent.create(entity, { visible: false })
  const view: View = { entity, model, visible: false, lastClip: model.idle, idleAt: 0, firedAt: 0 }
  views.set(id, view)
  if (views.size > 3) {
    const oldest = [...views.keys()].find((key) => key !== id && key !== activeId)
    if (oldest) {
      engine.removeEntity(views.get(oldest)!.entity)
      views.delete(oldest)
    }
  }
  return view
}
function idleClip(view: View, remaining: number) {
  if (activeId === 'elite' && remaining === 1) return 'idle_leftempty'
  return mode ? (view.model.clips.idle !== undefined ? 'idle' : view.model.idle) : view.model.idle
}
function play(clip: string, duration?: number) {
  if (!activeId) return
  const view = viewFor(activeId)
  const seconds = view.model.clips[clip]
  if (seconds === undefined) return
  const playingClip = view.lastClip === clip ? clip + '__repeat' : clip
  sounds = ((activeId === 'c4' ? C4_ANIMATION_SOUNDS : WEAPON_ANIMATION_SOUNDS[activeId])?.[clip] ?? []).map(
    (event) => ({
      sound: event.sound,
      at: Date.now() / 1000 + event.at * (duration ? duration / seconds : 1)
    })
  )
  for (const state of Animator.getMutable(view.entity).states) {
    state.playing = state.clip === view.model.prefix + playingClip
    state.shouldReset = state.playing
    state.speed = state.playing && duration ? seconds / duration : 1
  }
  view.lastClip = playingClip
  view.idleAt = clip.startsWith('idle') ? 0 : Date.now() / 1000 + (duration ?? seconds)
}
export function predictWeaponShot(remaining = 1, reloadStart = -1, firingMode = mode) {
  if (!activeId) return
  if (reloading) {
    interruptedReload = reloadStart
    reloading = false
  }
  const view = viewFor(activeId)
  const now = Date.now() / 1000
  const clip = chooseFire(activeId, view.model, firingMode, remaining, view.lastClip, Math.random, now - view.firedAt)
  view.firedAt = now
  if (clip) play(clip)
}
export function predictKnifeAttack(attack: KnifeAttack, contact = false) {
  if (activeId !== 'knife') return
  play(attack === 'stab' ? (contact ? 'stab' : 'stab_miss') : `midslash${1 + (lastKnife++ % 2)}`)
}
export function predictGrenadeAnimation(next: number) {
  if (!activeId || !['hegrenade', 'flashbang', 'smokegrenade'].includes(activeId)) return
  predictedGrenadeMode = next
  play(next === 1 ? 'pullpin' : 'throw')
}
export function updateWeaponView(player: Entity) {
  const weapon = Weapon.getOrNull(player)
  if (!weapon) return
  const profile = profileByName(weapon.name)
  const alive = !Dead.has(player)
  const selected = alive ? (hasBombSelected() ? 'c4' : profile.id) : undefined
  const changed = selected !== activeId || weapon.revision !== revision
  activeId = selected
  if (selected) viewFor(selected)
  for (const [id, view] of views) {
    const visible = id === selected && getCameraZoom() > 40
    if (view.visible !== visible) {
      view.visible = visible
      VisibilityComponent.getMutable(view.entity).visible = visible
    }
  }
  if (!selected) {
    sounds = []
    return
  }
  const view = viewFor(selected)
  const now = Date.now() / 1000
  const punch = getViewPunch(now),
    pain = getPainPunch(now)
  Transform.getMutable(view.entity).rotation = Quaternion.fromEulerDegrees(
    -(punch.pitch + pain.pitch) * 0.25,
    punch.yaw * 0.25,
    pain.roll * 0.25
  )
  if (selected === 'c4') {
    const animation = getC4Animation()
    if (c4Serial !== animation.serial) {
      c4Serial = animation.serial
      play(animation.clip)
    }
    while (sounds.length && sounds[0].at <= now) playModelSound(sounds.shift()!.sound)
    return
  }
  if (changed) {
    if (profile.kind === 'knife') {
      lastKnife = 0
      playLocalSound('knife_deploy1', 0.3)
    }
    revision = weapon.revision
    mode = weapon.mode
    reloading = false
    interruptedReload = -1
    reloadStep = -1
    predictedGrenadeMode = -1
    play(
      profile.kind === 'grenade' ? 'deploy' : !mode && view.model.clips.draw_unsil !== undefined ? 'draw_unsil' : 'draw'
    )
  } else if (mode !== weapon.mode) {
    mode = weapon.mode
    if (profile.kind === 'grenade') {
      if (predictedGrenadeMode < mode || mode === 0) play(mode === 1 ? 'pullpin' : mode === 2 ? 'throw' : 'deploy')
      if (mode === 0 || mode >= predictedGrenadeMode) predictedGrenadeMode = -1
    }
    if (profile.kind === 'gun' && profile.alternate === 'silencer')
      play(mode ? 'add_silencer' : 'detach_silencer', Math.max(0.01, weapon.readyAt - now))
  }
  const reloadActive = weapon.isReloading && weapon.reloadStartTime !== interruptedReload
  if (reloadActive !== reloading || (reloading && weapon.reloadStep !== reloadStep)) {
    reloading = reloadActive
    reloadStep = weapon.reloadStep
    if (profile.kind === 'gun' && profile.shellReload)
      play(
        !reloading ? 'after_reload' : weapon.reloadStage === 1 ? 'start_reload' : 'insert',
        reloading ? Math.max(0.01, weapon.reloadStepAt - now) : undefined
      )
    else if (reloading)
      play(!mode && view.model.clips.reload_unsil !== undefined ? 'reload_unsil' : 'reload', weapon.reloadTime)
    else play(idleClip(view, weapon.ammoClip))
  }
  while (sounds.length && sounds[0].at <= now) playModelSound(sounds.shift()!.sound)
  if (
    !reloading &&
    !(profile.kind === 'grenade' && (mode > 0 || predictedGrenadeMode > 0)) &&
    view.idleAt > 0 &&
    now >= view.idleAt
  ) {
    const lastEmpty = profile.kind === 'gun' && profile.slot === 'secondary' && weapon.ammoClip === 0
    if (!lastEmpty) play(idleClip(view, weapon.ammoClip))
  }
}
