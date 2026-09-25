import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import {
  recordRewind,
  rewindTo,
  clampSeenAt,
  nearestOnPath,
  REWIND_SECONDS,
  BOT_CLAIM_EARLY,
  BOT_CLAIM_LATE,
  BOT_CLAIM_DISTANCE
} from '../src/rewind-rules.ts'

const bundle = buildSync({
  entryPoints: ['src/ballistics.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false
})
const ballistics = { exports: {} }
runInNewContext(bundle.outputFiles[0].text, { module: ballistics })
const { traceShot, PLAYER_HIT_REGIONS } = ballistics.exports

const sample = (at, x, yaw = 0, pose) => ({ at, position: { x, y: 0, z: 0 }, yaw, pose })

test('recordRewind keeps one second of samples plus the newest older one', () => {
  const history = []
  for (let step = 0; step <= 20; step++) recordRewind(history, sample(step / 10, step / 10))
  assert.ok(history[0].at >= 2 - REWIND_SECONDS - 1e-9)
  assert.equal(history[history.length - 1].at, 2)
  assert.ok(history.length >= 10)
})

test('rewindTo interpolates position and keeps the pose that was playing', () => {
  const early = { model: 'arctic', upper: { clip: 'run', at: 0, rate: 1, loop: true, revision: 0 } }
  const late = { model: 'arctic', upper: { clip: 'idle', at: 1, rate: 1, loop: true, revision: 1 } }
  const history = [sample(0, 0, 0, early), sample(1, 10, 0, late)]
  const mid = rewindTo(history, 0.25)
  assert.equal(mid.position.x, 2.5)
  assert.equal(mid.pose, early)
  assert.equal(rewindTo(history, 1).pose, late)
})

test('rewindTo clamps outside the history and takes the short way around for yaw', () => {
  const history = [sample(0, 0, Math.PI - 0.1), sample(1, 1, -Math.PI + 0.1)]
  assert.equal(rewindTo(history, -5), history[0])
  assert.equal(rewindTo(history, 5), history[1])
  const yaw = rewindTo(history, 0.5).yaw
  assert.ok(Math.abs(Math.abs(yaw) - Math.PI) < 1e-9, `yaw ${yaw} should cross +-pi, not sweep through 0`)
  assert.equal(rewindTo([], 0.5), undefined)
})

test('clampSeenAt bounds the shooter view time to the history window', () => {
  assert.equal(clampSeenAt(undefined, 100), undefined)
  assert.equal(clampSeenAt(NaN, 100), undefined)
  assert.equal(clampSeenAt(99.9, 100), 99.9)
  assert.equal(clampSeenAt(50, 100), 100 - REWIND_SECONDS)
  assert.equal(clampSeenAt(120, 100), 100)
})

test('a running bot drawn behind the reported clock is hit through the observed-path claim', () => {
  const history = []
  for (let tick = 0; tick <= 30; tick++) {
    const at = 9 + tick / 30
    history.push({ at, position: { x: 88, y: 10.026, z: 52 + 6 * (at - 9.5) }, yaw: 0 })
  }
  const receivedAt = 10,
    seenAt = 9.7,
    drawnAt = seenAt - 0.2
  const drawn = rewindTo(history, drawnAt).position
  const eye = { x: 95, y: 11.626, z: drawn.z },
    west = { x: -1, y: 0, z: 0 }
  const bot = (center) => [{ id: 'bot:0', center, yaw: 0, regions: PLAYER_HIT_REGIONS }]
  assert.equal(
    traceShot(eye, west, bot(rewindTo(history, seenAt).position)).hit,
    undefined,
    'seenAt-only rewind misses'
  )

  const from = Math.max(seenAt - BOT_CLAIM_EARLY, receivedAt - REWIND_SECONDS),
    to = Math.min(seenAt + BOT_CLAIM_LATE, receivedAt)
  const observed = nearestOnPath(history, from, to, drawn, BOT_CLAIM_DISTANCE)
  assert.ok(observed && Math.abs(observed.at - drawnAt) < 1e-6)
  assert.equal(traceShot(eye, west, bot(drawn)).hit?.target, 'bot:0')

  assert.equal(nearestOnPath(history, from, to, { ...drawn, x: drawn.x + 1 }, BOT_CLAIM_DISTANCE), undefined)
  assert.equal(nearestOnPath(history, from, to, rewindTo(history, 9.1).position, BOT_CLAIM_DISTANCE), undefined)
})
