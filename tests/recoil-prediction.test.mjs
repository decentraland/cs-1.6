import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const output = mkdtempSync(join(tmpdir(), 'cs16-recoil-'))
const require = createRequire(import.meta.url)
execFileSync(process.execPath, [
  'node_modules/typescript/bin/tsc',
  'src/recoil-prediction.ts',
  '--target',
  'es2020',
  '--module',
  'commonjs',
  '--outDir',
  output,
  '--skipLibCheck'
])
const { RecoilPrediction } = require(join(output, 'recoil-prediction.js'))
after(() => rmSync(output, { recursive: true, force: true }))
const ack = { shots: 1, accuracy: 0.35, pitch: 1, yaw: -0.375, right: false }
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`)

test('the firing frame has recoil before any server reply', () => {
  const recoil = new RecoilPrediction()
  recoil.trigger(true, 100)
  recoil.predict(1, 100, 0, true)
  near(recoil.punch(100).pitch, 1)
  assert.equal(recoil.pendingShots, 1)
  const before = recoil.punch(100.03)
  recoil.confirm(1, ack, 100.03)
  near(recoil.punch(100.03).pitch, before.pitch)
  near(recoil.punch(100.03).yaw, before.yaw)
})

test('a reply delayed by 500 ms never kicks the settled camera again', () => {
  const recoil = new RecoilPrediction()
  recoil.predict(1, 100, 0, true)
  recoil.trigger(false, 100.02)
  near(recoil.punch(100.5).pitch, 0)
  recoil.confirm(1, ack, 100.5)
  near(recoil.punch(100.5).pitch, 0)
  near(recoil.punch(100.52).pitch, 0)
})

test('acknowledging an earlier shot preserves later predicted shots', () => {
  const recoil = new RecoilPrediction()
  recoil.predict(1, 100, 0, true)
  recoil.predict(2, 100.0955, 0, true)
  const before = recoil.punch(100.12)
  recoil.confirm(1, ack, 100.12)
  assert.equal(recoil.pendingShots, 1)
  near(recoil.punch(100.12).pitch, before.pitch)
  assert.ok(recoil.punch(100.14).pitch > 0)
})

test('reordered or duplicate acknowledgements cannot replay recoil', () => {
  const recoil = new RecoilPrediction()
  recoil.predict(1, 100, 0, true)
  recoil.predict(2, 100.0955, 0, true)
  assert.equal(recoil.confirm(2, { ...ack, shots: 2, pitch: 1.4 }, 100.12), true)
  const before = recoil.punch(100.12)
  assert.equal(recoil.confirm(1, ack, 100.12), false)
  assert.equal(recoil.confirm(2, ack, 100.12), false)
  assert.deepEqual(recoil.punch(100.12), before)
})

test('late confirmation cannot undo a reload or trigger release', () => {
  const recoil = new RecoilPrediction()
  recoil.predict(1, 100, 0, true)
  recoil.trigger(false, 100.02)
  recoil.reload(100.2)
  recoil.confirm(1, ack, 100.3)
  near(recoil.punch(100.3).pitch, 0)
  recoil.predict(2, 103, 0, true)
  near(recoil.punch(103).pitch, 1)
})

test('rejected shots recover without contaminating the next shot', () => {
  const recoil = new RecoilPrediction()
  recoil.predict(1, 100, 0, true)
  recoil.reject(1, 100.02)
  assert.equal(recoil.pendingShots, 0)
  assert.ok(Math.abs(recoil.punch(101).pitch) < 1e-7)
  recoil.predict(2, 101, 0, true)
  near(recoil.punch(101).pitch, 1)
})

test('ammo reservation ignores shots already included in server ammo state', () => {
  const recoil = new RecoilPrediction()
  recoil.predict(1, 100, 0, true)
  recoil.predict(2, 100.0955, 0, true)
  assert.equal(recoil.pendingAfter(0), 2)
  assert.equal(recoil.pendingAfter(1), 1)
  assert.equal(recoil.pendingAfter(2), 0)
  for (let id = 3; id <= 30; id++) recoil.predict(id, 100 + id * 0.0955, 0, true)
  assert.equal(recoil.predict(31, 104, 0, true), false, 'unacknowledged presentation is bounded to one magazine')
})
