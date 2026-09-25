import { engine, Entity, Material, MeshRenderer, TextureWrapMode, Transform, VisibilityComponent } from '@dcl/sdk/ecs'
import { Quaternion } from '@dcl/sdk/math'
import { SurfaceImpact, ricochetSound, surfaceImpacts } from './bullet-impact-rules'
import { playWorldSound } from './weapon-sounds'
import atlas from './bullet-decals.json'

export const BULLET_DECAL_LIMIT = 256
interface Decal {
  entity: Entity
  generation: number
  frame: number
}
interface Token {
  index: number
  generation: number
}
const decals: Decal[] = []
const pending = new Map<number, { tokens: Token[]; at: number }>()
let next = 0
let round = -1

function current(token: Token) {
  const decal = decals[token.index]
  return decal?.generation === token.generation ? decal : undefined
}

function hide(token: Token) {
  const decal = current(token)
  if (decal) VisibilityComponent.getMutable(decal.entity).visible = false
}

function place(decal: Decal, impact: SurfaceImpact) {
  const frame = atlas.frames[decal.frame],
    n = impact.normal
  Transform.createOrReplace(decal.entity, {
    position: {
      x: impact.position.x + n.x * 0.002,
      y: impact.position.y + n.y * 0.002,
      z: impact.position.z + n.z * 0.002
    },
    rotation: Quaternion.fromEulerDegrees((-Math.asin(n.y) * 180) / Math.PI, (Math.atan2(n.x, n.z) * 180) / Math.PI, 0),
    scale: { x: frame.width * 0.025, y: frame.height * 0.025, z: 1 }
  })
  VisibilityComponent.createOrReplace(decal.entity, { visible: true })
}

function create(impact: SurfaceImpact, sound: boolean): Token {
  const index = next++ % BULLET_DECAL_LIMIT
  let decal = decals[index]
  if (!decal) {
    decal = { entity: engine.addEntity(), generation: 0, frame: 0 }
    decals[index] = decal
    MeshRenderer.setPlane(decal.entity)
  }
  decal.generation++
  decal.frame = Math.floor(Math.random() * atlas.frames.length)
  const frame = atlas.frames[decal.frame]
  const texture = Material.Texture.Common({
    src: atlas.src,
    wrapMode: TextureWrapMode.TWM_CLAMP,
    tiling: { x: frame.width / atlas.width, y: frame.height / atlas.height },
    offset: { x: frame.x / atlas.width, y: -frame.y / atlas.height }
  })
  Material.setBasicMaterial(decal.entity, {
    texture,
    alphaTexture: texture,
    diffuseColor: { r: 1, g: 1, b: 1, a: 1 },
    castShadows: false
  })
  place(decal, impact)
  if (sound) {
    const clip = ricochetSound(impact.material, Math.floor(Math.random() * 32768))
    if (clip) playWorldSound(clip, impact.position)
  }
  return { index, generation: decal.generation }
}

export function predictBulletImpacts(shotId: number, impacts: Parameters<typeof surfaceImpacts>[0]) {
  rejectBulletImpacts(shotId)
  pending.set(shotId, { tokens: surfaceImpacts(impacts).map((impact) => create(impact, true)), at: Date.now() / 1000 })
}

export function confirmBulletImpacts(shotId: number, impacts: readonly SurfaceImpact[]) {
  const prediction = pending.get(shotId)
  if (!prediction) return
  pending.delete(shotId)
  const surfaces = surfaceImpacts(impacts)
  prediction.tokens.forEach((token, index) => {
    const decal = current(token),
      impact = surfaces[index]
    if (!impact) hide(token)
    else if (decal) place(decal, impact)
  })
  for (const impact of surfaces.slice(prediction.tokens.length)) create(impact, false)
}

export function rejectBulletImpacts(shotId: number) {
  const prediction = pending.get(shotId)
  if (!prediction) return
  prediction.tokens.forEach(hide)
  pending.delete(shotId)
}

export function showBulletImpacts(impacts: readonly SurfaceImpact[]) {
  for (const impact of surfaceImpacts(impacts)) create(impact, true)
}

export function updateBulletImpacts(nextRound: number) {
  if (round !== nextRound) {
    round = nextRound
    pending.clear()
    for (const decal of decals) VisibilityComponent.getMutable(decal.entity).visible = false
  }
  for (const [id, prediction] of pending) if (Date.now() / 1000 - prediction.at > 2) rejectBulletImpacts(id)
}
