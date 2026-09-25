import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import * as sdk from '@dcl/ecs/dist-cjs/index.js'
import { compile } from './compile.mjs'
import { humanServer } from './helpers/human-server.mjs'
import { sdkRooms, AUTH_SERVER } from './helpers/sdk-room.mjs'

const math = { exports: {} }
runInNewContext(
  buildSync({
    stdin: { contents: "export { Vector3 } from '@dcl/ecs-math'", resolveDir: process.cwd() },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false
  }).outputFiles[0].text,
  { module: math }
)
const { Vector3 } = math.exports
const load = compile('bullet-impact-rules', 'ballistics', 'shared-random')
const { surfaceImpacts, ricochetSound } = load('bullet-impact-rules')
const { fireGunShot } = load('ballistics')
const { freshGunAccuracy } = load('gun-accuracy')
const { shotRandom } = load('shared-random')
const owned = new Set()
afterEach(() => {
  for (const id of owned) sdk.engine.removeEntity(id)
  owned.clear()
})
const output = buildSync({
  entryPoints: ['src/bullet-impacts.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  write: false,
  alias: { '@dcl/sdk/math': '@dcl/ecs-math' },
  external: ['@dcl/sdk/ecs', './weapon-sounds']
}).outputFiles[0].text

function fixture() {
  const ids = [],
    sounds = [],
    state = { now: 10 }
  const ecs = {
    ...sdk,
    engine: {
      ...sdk.engine,
      addEntity: () => {
        const id = sdk.engine.addEntity()
        ids.push(id)
        owned.add(id)
        return id
      }
    }
  }
  const module = { exports: {} }
  runInNewContext(output, {
    module,
    Date: { now: () => state.now * 1000 },
    Math: Object.assign(Object.create(Math), { random: () => 0 }),
    require: (name) => {
      if (name === '@dcl/sdk/ecs') return ecs
      if (name === './weapon-sounds') return { playWorldSound: (name, position) => sounds.push({ name, position }) }
      throw Error(name)
    }
  })
  module.exports.updateBulletImpacts(1)
  return {
    ...module.exports,
    ids,
    sounds,
    state,
    visible: () => ids.filter((id) => sdk.VisibilityComponent.get(id).visible)
  }
}
const impact = (x = 10, normal = { x: 0, y: 0, z: 1 }) => ({
  position: { x, y: 5, z: 10 },
  normal,
  material: 'C',
  texture: '-0csSandWall'
})

test('surface feedback excludes actors, unknown collision faces, open space and sky', () => {
  assert.equal(surfaceImpacts([impact()]).length, 1)
  for (const patch of [
    { hit: { target: 'player' } },
    { normal: undefined },
    { texture: '' },
    { texture: 'sky' },
    { normal: { x: 0, y: 0, z: 0 } }
  ])
    assert.equal(surfaceImpacts([{ ...impact(), ...patch }]).length, 0)
  assert.equal(ricochetSound('C', 0), 'ric1')
  assert.equal(ricochetSound('C', 5), 'ric_conc-1')
  assert.equal(ricochetSound('M', 1), 'ric_metal-2')
  assert.equal(ricochetSound('V', 2), 'ric_metal-1')
  assert.equal(ricochetSound('C', 16382), 'ric3')
  assert.equal(ricochetSound('C', 16383), undefined)
  assert.equal(ricochetSound('M', 32767), undefined)
})

test('each M3 and XM1014 pellet carries the actual Dust2 surface normal and texture', () => {
  for (const [gun, count] of [
    ['m3', 9],
    ['xm1014', 6]
  ]) {
    const result = fireGunShot({
      gun,
      feet: { x: 95, y: 10.026, z: 52 },
      aim: { x: 1, y: 0, z: 0 },
      accuracy: freshGunAccuracy(gun),
      triggerHeld: true,
      speed: 0,
      grounded: true,
      now: 10,
      damage: 20,
      targets: [],
      random: shotRandom(1234, 1)
    })
    const surfaces = surfaceImpacts(result.impacts)
    assert.equal(surfaces.length, count)
    assert.ok(surfaces.every((s) => s.normal.x < -0.9 && s.normal.z > 0.4 && s.texture === 'SandWllDoorBTb'))
    assert.ok(surfaces.every((s) => s.position.x > 97 && s.position.x < 99))
  }
})

test('SDK decals are textured planes aligned to walls, floor and ceiling without colliders', () => {
  const f = fixture()
  const normals = [
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 }
  ]
  f.showBulletImpacts(normals.map((normal) => impact(10, normal)))
  assert.equal(f.visible().length, 6)
  f.ids.forEach((id, i) => {
    const transform = sdk.Transform.get(id),
      normal = Vector3.rotate(Vector3.Forward(), transform.rotation)
    assert.ok(Vector3.distance(normal, normals[i]) < 1e-6)
    assert.ok(Math.abs(Vector3.distance(transform.position, impact().position) - 0.002) < 1e-6)
    assert.equal(transform.scale.x, 0.4)
    assert.equal(sdk.MeshRenderer.get(id).mesh.$case, 'plane')
    assert.equal(sdk.MeshCollider.has(id), false)
    assert.ok(JSON.stringify(sdk.Material.get(id)).includes('assets/ui/bullet-decals.png'))
  })
})

test('prediction draws all holes immediately and confirmation corrects them without replaying sound', () => {
  const f = fixture(),
    surfaces = Array.from({ length: 9 }, (_, i) => impact(i))
  f.predictBulletImpacts(1, surfaces)
  assert.equal(f.visible().length, 9)
  assert.equal(f.sounds.length, 9)
  const ids = [...f.ids]
  f.confirmBulletImpacts(
    1,
    surfaces.slice(0, 6).map((s) => ({ ...s, position: { ...s.position, y: 6 } }))
  )
  assert.equal(f.visible().length, 6)
  assert.equal(f.sounds.length, 9)
  assert.deepEqual(f.ids, ids)
  for (const id of f.visible()) assert.equal(sdk.Transform.get(id).position.y, 6)
  f.state.now = 20
  f.updateBulletImpacts(1)
  assert.equal(f.visible().length, 6, 'confirmed holes persist until replacement or the next round')
})

test('rejects, missing acknowledgements and round changes remove predicted holes without touching reused pool slots', () => {
  const f = fixture()
  f.predictBulletImpacts(1, [impact()])
  f.rejectBulletImpacts(1)
  assert.equal(f.visible().length, 0)
  f.confirmBulletImpacts(1, [impact()])
  assert.equal(f.visible().length, 0)
  f.predictBulletImpacts(2, [impact()])
  f.state.now = 12.1
  f.updateBulletImpacts(1)
  assert.equal(f.visible().length, 0)
  f.predictBulletImpacts(3, [impact()])
  f.showBulletImpacts(Array.from({ length: f.BULLET_DECAL_LIMIT + 8 }, (_, i) => impact(i)))
  assert.equal(f.ids.length, f.BULLET_DECAL_LIMIT)
  f.rejectBulletImpacts(3)
  assert.equal(f.visible().length, f.BULLET_DECAL_LIMIT, 'late rejection cannot hide a newer decal')
  f.updateBulletImpacts(2)
  assert.equal(f.visible().length, 0)
  f.showBulletImpacts([impact()])
  assert.equal(f.visible().length, 1)
})

test('the authoritative shotgun event carries every surface contact through SDK Room', async () => {
  const wire = sdkRooms(),
    authority = wire.add(AUTH_SERVER),
    observer = wire.add('observer')
  const server = humanServer({ room: authority })
  const player = server.addPlayer('shooter', 1, { x: 95, y: 10.026, z: 52 })
  Object.assign(player.weapon(), { name: 'M3', ammoClip: 8, maxAmmoClip: 8, damage: 20, fireRate: 0.875 })
  const received = []
  observer.onMessage('practiceShot', (data) => received.push(data))
  server.shoot('shooter', { direction: { x: 1, y: 0, z: 0 } })
  await wire.deliverFrom(AUTH_SERVER)
  assert.equal(received.length, 1)
  assert.equal(received[0].impacts.length, 9)
  assert.ok(received[0].impacts.every((i) => i.normal.x < -0.9 && i.normal.z > 0.4 && i.texture === 'SandWllDoorBTb'))
  assert.equal(player.weapon().ammoClip, 7)
})
