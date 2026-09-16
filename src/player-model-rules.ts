import { Quaternion, Vector3 } from '@dcl/sdk/math'
import type { HitGroup, HitRegion } from './ballistics'
import type { GunId } from './weapon-profiles'
import arctic from './player-arctic.json'
import urban from './player-urban.json'

interface Track {
  p: number[][]
  q: number[][]
}
interface Pose {
  fps: number
  frames: number
  bones: Record<string, Track>
}
interface PlayerModel {
  hands: { R: string; L: string }
  durations: Record<string, number>
  parents: number[]
  lower: number[]
  boxes: { bone: number; group: number; center: number[]; half: number[] }[]
  poses: Record<string, Pose>
}
export const PLAYER_MODELS: Record<string, PlayerModel> = { arctic, urban }
export const PLAYER_ANIMATION_FAMILY: Record<GunId, string> = {
  ak47: 'ak47',
  galil: 'ak47',
  m4a1: 'rifle',
  awp: 'rifle',
  scout: 'rifle',
  sg550: 'rifle',
  aug: 'carbine',
  famas: 'carbine',
  p90: 'carbine',
  ump45: 'carbine',
  g3sg1: 'mp5',
  sg552: 'mp5',
  mp5: 'mp5',
  usp: 'onehanded',
  glock18: 'onehanded',
  deagle: 'onehanded',
  p228: 'onehanded',
  fiveseven: 'onehanded',
  mac10: 'onehanded',
  tmp: 'onehanded',
  elite: 'dualpistols',
  m3: 'shotgun',
  xm1014: 'm249',
  m249: 'm249'
}
export interface BodyLayer {
  clip: string
  at: number
  rate: number
  loop: boolean
  revision: number
}
export interface BodyPose {
  upper: BodyLayer
  lower?: BodyLayer
}
export function playerBody(team: number) {
  return team === 2 ? 'urban' : 'arctic'
}
export function deathAnimation(group: HitGroup, random = Math.random) {
  if (group === 'head') return 'head'
  if (group === 'body') return 'death1'
  if (group === 'stomach') return 'gutshot'
  if (group === 'arms') return random() < 0.5 ? 'left' : 'right'
  return ['death2', 'death2', 'left', 'right'][Math.min(3, Math.floor(Math.max(0, random()) * 4))]
}
export function bodyPose(
  options: {
    model: string
    gun: GunId
    speed: number
    now: number
    lastShot: number
    reloading: boolean
    reloadAt: number
    reloadTime: number
    planting: boolean
  },
  previous?: BodyPose
): BodyPose {
  const { now, speed } = options
  const model = PLAYER_MODELS[options.model]
  const family = options.planting ? 'c4' : PLAYER_ANIMATION_FAMILY[options.gun]
  const shoot = `ref_shoot_${family}`
  const shooting = options.planting || now < options.lastShot + model.durations[shoot]
  const clip = `ref_${options.reloading ? 'reload' : shooting ? 'shoot' : 'aim'}_${family}`
  const rate = options.reloading ? model.durations[clip] / options.reloadTime : 1
  const revision = options.reloading ? options.reloadAt : shooting && !options.planting ? options.lastShot : 0
  const upper =
    previous?.upper.clip === clip && previous.upper.revision === revision
      ? previous.upper
      : { clip, at: now, rate, loop: !options.reloading && !shooting, revision }
  const gait = speed < 0.05 ? 'idle1' : speed < 3.375 ? 'walk' : 'run'
  const gaitRate = gait === 'idle1' ? 1 : Math.max(0.1, Math.round((speed / (gait === 'walk' ? 1.5 : 6.25)) * 10) / 10)
  let lower = previous?.lower
  if (!lower || lower.clip !== gait) lower = { clip: gait, at: now, rate: gaitRate, loop: true, revision: 0 }
  else if (lower.rate !== gaitRate)
    lower = { ...lower, at: now - ((now - lower.at) * lower.rate) / gaitRate, rate: gaitRate }
  return { upper, lower }
}
function sample(track: number[][], frame: number) {
  const a = track.length === 1 ? track[0] : track[Math.floor(frame)]
  const b = track.length === 1 ? a : track[Math.min(track.length - 1, Math.floor(frame) + 1)]
  const t = frame % 1
  if (a.length === 4) {
    const q = Quaternion.slerp(Quaternion.create(a[0], a[1], a[2], a[3]), Quaternion.create(b[0], b[1], b[2], b[3]), t)
    return [q.x, q.y, q.z, q.w]
  }
  return a.map((value, i) => value + (b[i] - value) * t)
}
export function bodyHitRegions(modelName: string, state: BodyPose, now: number): HitRegion[] {
  if (!state.lower) return []
  const model = PLAYER_MODELS[modelName]
  const layers = [state.lower, state.upper].map((layer) => {
    const pose = model.poses[layer.clip]
    const raw = Math.max(0, now - layer.at) * layer.rate * pose.fps
    const frame = layer.loop ? raw % Math.max(1, pose.frames - 1) : Math.min(pose.frames - 1, raw)
    return { pose, frame }
  })
  const world: { p: Vector3; q: Quaternion }[] = []
  for (let index = 0; index < model.parents.length; index++) {
    const layer = layers.find(({ pose }) => pose.bones[index])
    if (!layer) continue
    const track = layer.pose.bones[index]
    const p = sample(track.p, layer.frame),
      q = sample(track.q, layer.frame)
    const local = { p: Vector3.create(p[0], p[1], p[2]), q: Quaternion.create(q[0], q[1], q[2], q[3]) }
    const parent = world[model.parents[index]]
    world[index] = parent
      ? {
          p: Vector3.add(parent.p, Vector3.rotate(local.p, parent.q)),
          q: Quaternion.multiply(parent.q, local.q)
        }
      : local
  }
  // GoldSrc +X forward/Z up becomes SDK +Z forward/Y up; feet are 36 units below the origin.
  const toDcl = (v: Vector3) => Vector3.create(-v.y, v.z, v.x)
  const groups: HitGroup[] = ['body', 'head', 'body', 'stomach', 'arms', 'arms', 'legs', 'legs']
  return model.boxes.map((box) => {
    const bone = world[box.bone]
    const point = toDcl(Vector3.add(bone.p, Vector3.rotate(Vector3.create(...tuple3(box.center)), bone.q)))
    const axes = [Vector3.Right(), Vector3.Up(), Vector3.Forward()].map((v) => toDcl(Vector3.rotate(v, bone.q)))
    return {
      group: groups[box.group],
      x: point.x,
      y: point.y + 0.9,
      z: point.z,
      half: Vector3.create(...tuple3(box.half)),
      axes
    }
  })
}
function tuple3(v: number[]): [number, number, number] {
  return [v[0], v[1], v[2]]
}
