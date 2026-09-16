import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compile } from './compile.mjs'
const load = compile('solid-trace', 'penetration', 'ballistics')
const { SolidTracer } = load('solid-trace'),
  { traceBullet, penetrationCount, bulletWorldTrace } = load('penetration')
const { DUST2_SOLIDS } = load('dust2-solids')
const direction = { x: 1, y: 0, z: 0 },
  origin = { x: -1, y: 0, z: 0 }
function slab(width = 1, material = 'W') {
  return new SolidTracer({
    planes: [
      [1, 0, 0, 0],
      [1, 0, 0, width]
    ],
    nodes: [
      [0, 1, -1],
      [1, -1, -2]
    ],
    roots: [0],
    vertices: [
      [0, -2, -2],
      [0, 2, -2],
      [0, 2, 2],
      [0, -2, 2],
      [width, -2, -2],
      [width, 2, -2],
      [width, 2, 2],
      [width, -2, 2]
    ],
    surfaces: [
      [0, material, 'test-wall', [0, 1, 2, 3]],
      [1, material, 'test-wall', [4, 5, 6, 7]]
    ]
  })
}
const target = (id, x) => ({
  id,
  center: { x, y: 0, z: 0 },
  regions: [{ group: 'body', y: 0, half: { x: 0.2, y: 0.2, z: 0.2 } }]
})
const bullet = (gun, wall, targets) =>
  traceBullet({
    gun,
    origin,
    direction,
    damage: 100,
    rangeModifier: 1,
    targets,
    traceWorld: (...args) => wall.trace(...args)
  })
test('GoldSrc starts inside solid: it can leave, then hits the next entry; an entirely solid segment blocks targets', () => {
  const wall = slab(4)
  assert.equal(wall.trace(origin, direction, 10).distance, 1)
  const leaving = wall.trace({ x: 1, y: 0, z: 0 }, direction, 10)
  assert.equal(leaving.startSolid, true)
  assert.equal(leaving.solid, false)
  assert.equal(leaving.allSolid, false)
  assert.equal(wall.trace({ x: 1, y: 0, z: 0 }, direction, 1).allSolid, true)
  assert.equal(wall.trace({ x: 5, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, 10).distance, 1)
})
test('rifles, Deagle and bolt snipers have their original penetration counts; ordinary pistols and SMGs stop at the first wall', () => {
  for (const id of ['ak47', 'm4a1', 'deagle', 'sg550', 'm249']) assert.equal(penetrationCount(id), 2, id)
  for (const id of ['awp', 'scout', 'g3sg1']) assert.equal(penetrationCount(id), 3, id)
  for (const id of ['glock18', 'usp', 'mp5', 'p90'])
    assert.equal(bullet(id, slab(0.5), [target('enemy', 2)]).filter((i) => i.hit).length, 0, id)
  for (const id of ['ak47', 'deagle', 'awp'])
    assert.equal(
      bullet(id, slab(4), [target('enemy', 6)]).find((i) => i.hit)?.hit.target,
      'enemy',
      id + ' continues from inside the brush'
    )
})
test('surface materials preserve the original damage multipliers', () => {
  for (const [material, damage] of [
    ['W', 60],
    ['C', 50],
    ['M', 20],
    ['G', 40],
    ['V', 45],
    ['T', 30],
    ['P', 45]
  ]) {
    const hits = bullet('ak47', slab(0.5, material), [target('enemy', 2)]).filter((i) => i.hit)
    assert.equal(hits.length, 1)
    assert.equal(hits[0].damage, damage, material)
  }
})
test('a penetrating hit loses range and damage and may hit a second player only once', () => {
  const empty = {
    trace: (o, d, range) => ({
      distance: range,
      position: { x: o.x + d.x * range, y: o.y, z: o.z },
      solid: false,
      startSolid: false,
      allSolid: false,
      material: 'C',
      texture: ''
    })
  }
  const hits = bullet('ak47', empty, [target('front', 1), target('rear', 3)]).filter((i) => i.hit)
  assert.deepEqual(
    hits.map((i) => [i.hit.target, i.damage]),
    [
      ['front', 100],
      ['rear', 75]
    ]
  )
  const farther = target('outside remaining range', 150)
  assert.equal(bullet('ak47', slab(4), [farther]).filter((i) => i.hit).length, 0)
})
test('Dust2 point hull reproduces the existing courtyard and spawn walls with source textures', () => {
  assert.equal(DUST2_SOLIDS.sourceSha256, '15945389528d113562ede0a2c80647ebfa799079ed1c05a25379bcf84e4e9286')
  assert.equal(DUST2_SOLIDS.roots.length, 11)
  const hit = bulletWorldTrace({ x: 95, y: 11.626, z: 52 }, { x: -1, y: 0, z: 0 }, 100)
  assert.ok(Math.abs(hit.position.x - 70.38416667) < 1e-6)
  assert.equal(hit.texture, '-0csSandWall')
  assert.equal(hit.startSolid, false)
})

test('real Dust2 middle doors: AK/M4/AWP/Deagle deal reduced damage; USP and shotgun pellets stop', () => {
  const { fireGunShot } = load('ballistics'),
    { freshGunAccuracy } = load('gun-accuracy')
  const eye = { x: 72.68839292839402, y: 9.23072381, z: 69.39560781928131 }
  const aim = { x: -0.42232149839401245, y: 0, z: -0.906446099281311 }
  const center = { x: 71.75929160207214, y: eye.y, z: 67.40143921483141 }
  const targets = [
    { id: 'behind mid door', center, regions: [{ group: 'body', y: 0, half: { x: 0.2, y: 0.2, z: 0.2 } }] }
  ]
  for (const [gun, damage, expected] of [
    ['ak47', 36, 16],
    ['m4a1', 32, 14],
    ['awp', 115, 56],
    ['deagle', 54, 25],
    ['usp', 34, 0],
    ['m3', 20, 0]
  ]) {
    const result = fireGunShot({
      gun,
      feet: { ...eye, y: eye.y - 1.6 },
      aim,
      damage,
      targets,
      accuracy: freshGunAccuracy(gun),
      triggerHeld: true,
      speed: 0,
      grounded: true,
      now: 10,
      random: () => 0.5
    })
    assert.equal(
      result.impacts.filter((i) => i.hit).reduce((sum, i) => sum + i.damage, 0),
      expected,
      gun
    )
    assert.equal(result.hit, undefined, 'first impact is the visible door')
  }
})
