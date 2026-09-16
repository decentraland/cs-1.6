import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildSync } from 'esbuild'
import { createRequire } from 'node:module'
const output = mkdtempSync(join(tmpdir(), 'cs16-player-models-'))
const require = createRequire(import.meta.url)
buildSync({
  entryPoints: ['src/player-model-rules.ts', 'src/hit-regions.ts'],
  outdir: output,
  bundle: true,
  platform: 'node',
  format: 'cjs'
})
const { bodyPose, bodyHitRegions, PLAYER_MODELS, PLAYER_ANIMATION_FAMILY, deathAnimation } = require(
  join(output, 'player-model-rules.js')
)
const { regionDistance } = require(join(output, 'hit-regions.js'))
after(() => rmSync(output, { recursive: true, force: true }))
const options = (extra = {}) => ({
  model: 'arctic',
  gun: 'ak47',
  speed: 0,
  now: 10,
  lastShot: -Infinity,
  reloading: false,
  reloadAt: 0,
  reloadTime: 2.45,
  planting: false,
  ...extra
})

test('running does not restart the torso; successive shots restart only the firing layer', () => {
  const idle = bodyPose(options())
  const run = bodyPose(options({ speed: 6.25, now: 11 }), idle)
  assert.equal(run.upper, idle.upper)
  assert.equal(run.lower.clip, 'run')
  assert.equal(run.lower.rate, 1)
  const fire = bodyPose(options({ speed: 6.25, now: 11.1, lastShot: 11.1 }), run)
  assert.equal(fire.lower, run.lower)
  assert.equal(fire.upper.clip, 'ref_shoot_ak47')
  const next = bodyPose(options({ speed: 6.25, now: 11.2, lastShot: 11.2 }), fire)
  assert.notEqual(next.upper.revision, fire.upper.revision)
  assert.equal(next.lower, run.lower)
  const settle = bodyPose(options({ speed: 6.25, now: 12, lastShot: 11.2 }), next)
  assert.equal(settle.upper.clip, 'ref_aim_ak47')
})
test('reloads use the actual gun deadline while retaining leg movement', () => {
  const pose = bodyPose(options({ reloading: true, reloadAt: 9.9, speed: 1.5 }))
  assert.equal(pose.upper.clip, 'ref_reload_ak47')
  assert.equal(PLAYER_MODELS.arctic.durations[pose.upper.clip] / pose.upper.rate, 2.45)
  assert.equal(pose.lower.clip, 'walk')
  assert.equal(pose.upper.loop, false)
})
test('head, chest, gut and weighted generic deaths select original source activities', () => {
  assert.equal(deathAnimation('head'), 'head')
  assert.equal(deathAnimation('body'), 'death1')
  assert.equal(deathAnimation('stomach'), 'gutshot')
  assert.deepEqual(
    [0, 0.3, 0.6, 0.9].map((n) => deathAnimation('legs', () => n)),
    ['death2', 'death2', 'left', 'right']
  )
})
test('all weapon families have valid torso clips and animated source hitboxes for both bodies', () => {
  for (const model of ['arctic', 'urban'])
    for (const gun of Object.keys(PLAYER_ANIMATION_FAMILY)) {
      const pose = bodyPose(options({ model, gun, speed: 6.25 }))
      const regions = bodyHitRegions(model, pose, 10.2)
      assert.equal(regions.length, 20)
      for (const region of regions) {
        assert.ok(region.half.x > 0 && region.half.y > 0 && region.half.z > 0)
        assert.ok([region.x, region.y, region.z].every(Number.isFinite))
        for (const axis of region.axes) assert.ok(Math.abs(Math.hypot(axis.x, axis.y, axis.z) - 1) < 0.0001)
      }
      const head = regions.find((r) => r.group === 'head')
      assert.ok(head.y > 1.1 && head.y < 1.55, `${model}/${gun} head at ${head.y}`)
    }
})
test('oriented hitboxes follow animated limbs and support target yaw without enlarging headshots', () => {
  const pose = bodyPose(options({ speed: 6.25 }))
  const regions = bodyHitRegions('arctic', pose, 10.15)
  const later = bodyHitRegions('arctic', pose, 10.4)
  assert.notDeepEqual(
    regions.filter((r) => r.group === 'legs'),
    later.filter((r) => r.group === 'legs')
  )
  for (const yaw of [0, Math.PI / 2, Math.PI]) {
    const head = regions.find((r) => r.group === 'head'),
      c = Math.cos(yaw),
      s = Math.sin(yaw)
    const center = { x: head.x * c + head.z * s, y: head.y, z: -head.x * s + head.z * c }
    const direction = { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) }
    const origin = { x: center.x - direction.x * 2, y: center.y, z: center.z - direction.z * 2 }
    const target = { center: { x: 0, y: 0, z: 0 }, yaw }
    assert.ok(regionDistance(origin, direction, target, head) < 2)
    assert.equal(regionDistance({ ...origin, y: origin.y + 0.5 }, direction, target, head), undefined)
  }
  assert.deepEqual(
    bodyHitRegions('arctic', { upper: { clip: 'head', at: 10, rate: 1, loop: false, revision: 0 } }, 11),
    []
  )
})
