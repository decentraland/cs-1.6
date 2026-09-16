import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const output = mkdtempSync(join(tmpdir(), 'cs16-bot-difficulty-'))
const require = createRequire(import.meta.url)
execFileSync(process.execPath, [
  'node_modules/typescript/bin/tsc',
  'src/bot-combat.ts',
  '--target',
  'es2020',
  '--module',
  'commonjs',
  '--outDir',
  output,
  '--skipLibCheck'
])
const { BOT_DIFFICULTIES, BOT_DIFFICULTY_PROFILES, parseBotDifficulty, offsetAim, aimError } = require(
  join(output, 'bot-difficulty.js')
)
const { PLAYER_HIT_REGIONS } = require(join(output, 'ballistics.js'))
const { createBotCombat, botShot } = require(join(output, 'bot-combat.js'))
after(() => rmSync(output, { recursive: true, force: true }))

const feet = { x: 95, y: 10.026, z: 52 }
const target = { x: 88, y: feet.y + 1.05, z: 52 }
const targets = [{ id: 'player', center: { ...target, y: feet.y }, yaw: Math.PI / 2, regions: PLAYER_HIT_REGIONS }]
const options = (now, extra = {}) => ({
  feet,
  target,
  targets,
  speed: 0,
  now,
  alive: true,
  random: () => 0.5,
  ...extra
})
const firstShotTime = (difficulty) => {
  const state = createBotCombat(0)
  for (let frame = 0; frame <= 150; frame++) {
    if (botShot(state, options(frame / 30, { difficulty }))) return frame / 30
  }
  return Infinity
}

test('the four levels follow the BotProfile.db templates: slower, more hesitant and less accurate as skill drops', () => {
  assert.deepEqual(BOT_DIFFICULTIES, ['easy', 'normal', 'hard', 'expert'])
  const profiles = BOT_DIFFICULTIES.map((level) => BOT_DIFFICULTY_PROFILES[level])
  assert.deepEqual(
    profiles.map((p) => [p.skill, p.reactionTime, p.attackDelay]),
    [
      [0, 1.0, 3.0],
      [50, 0.6, 1.0],
      [75, 0.4, 0],
      [90, 0.35, 0]
    ]
  )
  for (let i = 1; i < profiles.length; i++) assert.ok(profiles[i].aimError < profiles[i - 1].aimError)
  assert.ok(Math.abs(BOT_DIFFICULTY_PROFILES.expert.aimError - 0.012) < 1e-12)
  assert.equal(parseBotDifficulty('hard'), 'hard')
  assert.equal(parseBotDifficulty('elite'), 'normal')
  assert.equal(parseBotDifficulty(undefined), 'normal')
})

test('reaction time plus attack delay gate the first burst per level', () => {
  assert.equal(firstShotTime('easy'), 4)
  assert.equal(firstShotTime('normal'), 1.6)
  assert.equal(firstShotTime('hard'), 0.4)
  assert.ok(Math.abs(firstShotTime('expert') - 11 / 30) < 1e-9, 'first frame after the 0.35 s reaction')
  assert.equal(firstShotTime(undefined), firstShotTime('normal'), 'normal is the default level')
})

test('skill scales a per-shot aim error while a centred sample keeps the aim exact', () => {
  const aim = { x: -1, y: 0, z: 0 }
  assert.equal(offsetAim(aim, 0, 0), aim)
  const turned = offsetAim(aim, 0.1, 0)
  assert.ok(Math.abs(Math.atan2(turned.x, turned.z) - (Math.atan2(-1, 0) + 0.1)) < 1e-12)
  assert.ok(Math.abs(Math.hypot(turned.x, turned.y, turned.z) - 1) < 1e-12)
  assert.deepEqual(
    aimError(BOT_DIFFICULTY_PROFILES.easy, () => 0.5),
    { yaw: 0, pitch: 0 }
  )
  assert.deepEqual(
    aimError(BOT_DIFFICULTY_PROFILES.easy, () => 1),
    { yaw: 0.12, pitch: 0.12 }
  )
  const exact = createBotCombat(0)
  botShot(exact, options(0, { difficulty: 'easy' }))
  const centred = botShot(exact, options(4, { difficulty: 'easy' }))
  assert.equal(centred.hit.group, 'body')
  const sloppy = createBotCombat(0)
  botShot(sloppy, options(0, { difficulty: 'easy', random: () => 0.99 }))
  const wide = botShot(sloppy, options(4, { difficulty: 'easy', random: () => 0.99 }))
  assert.ok(wide, 'the easy bot still fires')
  assert.equal(wide.hit, undefined, 'a full-error easy shot misses a target 7 m away')
  const sharp = createBotCombat(0)
  botShot(sharp, options(0, { difficulty: 'expert', random: () => 0.99 }))
  const tight = botShot(sharp, options(0.4, { difficulty: 'expert', random: () => 0.99 }))
  assert.ok(tight.hit, 'the same error sample keeps an expert on target')
})
