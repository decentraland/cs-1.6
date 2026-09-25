import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { buildSync } from 'esbuild'

const output = mkdtempSync(join(tmpdir(), 'cs16-shield-collision-'))
const require = createRequire(import.meta.url)
buildSync({
  entryPoints: ['src/player-model-rules.ts', 'src/hit-regions.ts', 'src/rewind-rules.ts'],
  outdir: output,
  bundle: true,
  platform: 'node',
  format: 'cjs'
})
const { posedBodyBoxes, bodyHitRegions, PLAYER_MODELS } = require(join(output, 'player-model-rules.js'))
const { regionDistance } = require(join(output, 'hit-regions.js'))
const { recordRewind, rewindTo } = require(join(output, 'rewind-rules.js'))
after(() => rmSync(output, { recursive: true, force: true }))

const fixtures = ['arctic', 'urban'].map((name) => ({
  name,
  ...JSON.parse(readFileSync(`asset-sources/cs16-weapons/shield/collision/${name}.json`, 'utf8'))
}))
const layer = (clip, at = 0) => ({ clip, at, rate: 1, loop: false, revision: 0 })
const pose = (clip, at = 0) => ({ upper: layer(clip, at), lower: layer('idle1', at) })
const shield = (boxes) => boxes.find((box) => box.group === 8)
const point = (x, y, z) => ({ x, y, z })
const add = (a, b) => point(a.x + b.x, a.y + b.y, a.z + b.z)
const scale = (v, n) => point(v.x * n, v.y * n, v.z * n)
const rotate = (v, yaw) =>
  point(v.x * Math.cos(yaw) + v.z * Math.sin(yaw), v.y, -v.x * Math.sin(yaw) + v.z * Math.cos(yaw))
const target = (regions, yaw = 0, center = point(0, 0, 0)) => ({ regions, yaw, center })
function trace(target, origin, direction) {
  return target.regions
    .map((box) => ({ group: box.group, distance: regionDistance(origin, direction, target, box) }))
    .filter((hit) => hit.distance !== undefined)
    .sort((a, b) => a.distance - b.distance)[0]
}
function front(target, y) {
  return trace(target, add(target.center, rotate(point(0, y, 5), target.yaw)), rotate(point(0, 0, -1), target.yaw))
}

test('shield collision fixtures identify the pinned player sources and all shield animation families', () => {
  const manifest = JSON.parse(readFileSync('asset-sources/players/sources.json', 'utf8'))
  for (const { name, source, collision } of fixtures) {
    assert.deepEqual(
      source,
      manifest.find((entry) => entry.name === name)
    )
    const bytes = readFileSync(`asset-sources/players/${name}.mdl`)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256)
    assert.equal(bytes.length, source.bytes)
    assert.equal(collision.boxes.length, 21)
    const box = shield(collision.boxes)
    assert.equal(box.bone, 12)
    assert.ok(Math.abs(box.half[0] * 2 - 26.7 * 0.025) < 1e-7)
    assert.equal(box.half[1] * 2, 8 * 0.025)
    assert.equal(box.half[2] * 2, 52 * 0.025)
    const clips = Object.keys(collision.poses)
    assert.equal(clips.filter((clip) => clip.includes('shield')).length, 16)
    for (const family of ['shieldgun', 'shieldgren', 'shieldknife', 'shielded']) {
      assert.ok(clips.includes(`ref_aim_${family}`))
      assert.ok(clips.includes(`crouch_aim_${family}`))
    }
  }
})

test('posed shield corners agree with independently decoded source Euler transforms', () => {
  for (const { name, collision, cases } of fixtures) {
    assert.equal(cases.length, 52)
    for (const sample of cases) {
      const state = {
        upper: layer(sample.upper, -sample.upperFrame / collision.poses[sample.upper].fps),
        lower: layer(sample.lower, -sample.lowerFrame / collision.poses[sample.lower].fps)
      }
      const box = shield(posedBodyBoxes(collision, state, 0))
      let index = 0
      for (const x of [-1, 1])
        for (const y of [-1, 1])
          for (const z of [-1, 1]) {
            const actual = [x * box.half.x, y * box.half.y, z * box.half.z].reduce(
              (corner, amount, axis) => add(corner, scale(box.axes[axis], amount)),
              point(box.x, box.y, box.z)
            )
            const expected = sample.corners[index++]
            const error = Math.hypot(actual.x - expected[0], actual.y - expected[1], actual.z - expected[2])
            assert.ok(error < 0.000005, `${name}/${sample.upper}/${sample.upperFrame}: ${error} m`)
          }
    }
  }
})

test('raised and lowered source poses expose different head cover while feet and rear remain vulnerable', () => {
  for (const { collision } of fixtures)
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const lowered = target(posedBodyBoxes(collision, pose('ref_aim_shieldgun'), 0), yaw, point(12, 4, -8))
      const raised = target(posedBodyBoxes(collision, pose('ref_aim_shielded'), 0), yaw, lowered.center)
      assert.equal(front(lowered, 1.4).group, 1)
      assert.equal(front(raised, 1.4).group, 8)
      assert.equal(front(lowered, 0.8).group, 8, 'the lowered shield still has physical cover')
      assert.equal(front(raised, 0.2).group, 7)
      const rear = trace(raised, add(raised.center, rotate(point(0, 1, -5), yaw)), rotate(point(0, 0, 1), yaw))
      assert.equal(rear.group, 3)
    }
})

test('shield collision uses the oriented edges and does not expand into a frontal immunity cone', () => {
  for (const { collision } of fixtures) {
    const box = shield(posedBodyBoxes(collision, pose('ref_aim_shielded'), 0))
    const shieldOnly = target([box])
    const normal = box.axes[1]
    const origin = add(point(box.x, box.y, box.z), scale(normal, 2))
    assert.ok(Math.abs(trace(shieldOnly, origin, scale(normal, -1)).distance - (2 - box.half.y)) < 1e-6)
    for (const [axis, extent] of [
      [box.axes[0], box.half.x],
      [box.axes[2], box.half.z]
    ]) {
      assert.ok(trace(shieldOnly, add(origin, scale(axis, extent - 0.001)), scale(normal, -1)))
      assert.equal(trace(shieldOnly, add(origin, scale(axis, extent + 0.001)), scale(normal, -1)), undefined)
    }
  }
})

test('historical pose and facing retain lowered cover after a later raise and turn', () => {
  for (const { name, collision } of fixtures) {
    const history = []
    const sample = (at, x, yaw, clip) => ({
      at,
      position: point(x, 0, 0),
      yaw,
      pose: { model: name, ...pose(clip, at) }
    })
    recordRewind(history, sample(10, 0, 0, 'ref_aim_shieldgun'))
    recordRewind(history, sample(10.4, 2, Math.PI / 2, 'ref_aim_shielded'))
    const old = rewindTo(history, 10.2)
    const current = rewindTo(history, 10.4)
    assert.ok(Math.abs(old.position.x - 1) < 1e-10)
    assert.ok(Math.abs(old.yaw - Math.PI / 4) < 1e-10)
    assert.equal(front(target(posedBodyBoxes(collision, old.pose, old.at), old.yaw, old.position), 1.4).group, 1)
    assert.equal(
      front(target(posedBodyBoxes(collision, current.pose, current.at), current.yaw, current.position), 1.4).group,
      8
    )
  }
})

test('regular body tracing excludes shield hitgroup even when the source data contains one', () => {
  for (const { name, collision } of fixtures) {
    const key = `shield-fixture-${name}`
    PLAYER_MODELS[key] = { ...PLAYER_MODELS[name], ...collision }
    try {
      const state = pose('ref_aim_shielded')
      assert.equal(posedBodyBoxes(collision, state, 0).length, 21)
      const regions = bodyHitRegions(key, state, 0)
      assert.equal(regions.length, 20)
      assert.equal(front(target(regions), 1.4).group, 'head')
      assert.ok(regions.every((region) => ['head', 'body', 'stomach', 'arms', 'legs'].includes(region.group)))
      assert.deepEqual(posedBodyBoxes(collision, { upper: state.upper }, 0), [])
    } finally {
      delete PLAYER_MODELS[key]
    }
  }
})
