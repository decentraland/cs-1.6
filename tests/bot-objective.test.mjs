import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const output = mkdtempSync(join(tmpdir(), 'cs16-bot-objective-'))
execFileSync(process.execPath, [
  'node_modules/typescript/bin/tsc',
  'src/bot-objective.ts',
  'src/bot-navigation.ts',
  'src/bomb-rules.ts',
  '--target',
  'es2020',
  '--module',
  'commonjs',
  '--outDir',
  output,
  '--skipLibCheck',
  '--resolveJsonModule',
  '--esModuleInterop'
])
const require = createRequire(import.meta.url)
const { botAddress, soloBombCarrier, soloBombObjectives, soloBombSite } = require(join(output, 'bot-objective.js'))
const { createBotNavigation, moveBot } = require(join(output, 'bot-navigation.js'))
const { freshBomb, stepBomb } = require(join(output, 'bomb-rules.js'))
after(() => rmSync(output, { recursive: true, force: true }))

const bots = [
  { index: 0, alive: true, position: { x: 0, y: 0, z: 0 } },
  { index: 1, alive: true, position: { x: 2, y: 0, z: 0 } },
  { index: 2, alive: true, position: { x: 4, y: 0, z: 0 } }
]
const bomb = (overrides) => ({
  phase: 'carried',
  carrier: botAddress(0),
  planter: '',
  defuser: '',
  site: '',
  position: { x: 0, y: 0, z: 0 },
  actionStarted: 0,
  actionEnds: 0,
  explodeAt: 0,
  progress: 0,
  round: 1,
  ...overrides
})

test('solo rounds rotate bomb sites and carriers deterministically', () => {
  assert.deepEqual(soloBombSite(1), { x: 104.5, y: 10.026, z: 40.5 })
  assert.deepEqual(soloBombSite(2), { x: 33, y: 12.5861, z: 46.5 })
  assert.deepEqual(soloBombSite(3), soloBombSite(1))
  assert.equal(soloBombCarrier([0, 1, 2], 1), botAddress(0))
  assert.equal(soloBombCarrier([0, 1, 2], 4), botAddress(0))
  assert.equal(soloBombCarrier([], 1), '')
})

test('the carrier keeps the selected bomb site through planting', () => {
  for (const phase of ['carried', 'planting']) {
    const objectives = soloBombObjectives(bots, bomb({ phase, carrier: botAddress(1) }), 2)
    assert.equal(objectives.size, 1)
    assert.deepEqual(objectives.get(botAddress(1)), soloBombSite(2))
  }
})

test('the closest living bot retrieves a dropped bomb with stable tie breaking', () => {
  const candidates = bots.map((bot) => ({ ...bot, alive: bot.index !== 0 }))
  const objectives = soloBombObjectives(
    candidates,
    bomb({ phase: 'dropped', carrier: '', position: { x: 3, y: 0, z: 0 } }),
    1
  )
  assert.deepEqual([...objectives], [[botAddress(1), { x: 3, y: 0, z: 0 }]])
})

test('living bots spread around the active planted site and resolved bombs clear objectives', () => {
  const active = soloBombObjectives(
    bots.map((bot) => ({ ...bot, alive: bot.index !== 1 })),
    bomb({ phase: 'planted', carrier: '', position: soloBombSite(1) }),
    1
  )
  assert.deepEqual([...active.keys()], [botAddress(0), botAddress(2)])
  assert.notDeepEqual(active.get(botAddress(0)), active.get(botAddress(2)))
  for (const position of active.values()) assert.ok(Math.hypot(position.x - 104.5, position.z - 40.5) < 8)
  for (const phase of ['defused', 'exploded', 'none'])
    assert.equal(soloBombObjectives(bots, bomb({ phase, carrier: '' }), 1).size, 0)
})

test('a carrier follows the production route and completes an uninterrupted solo plant', () => {
  const address = botAddress(0)
  const navigation = createBotNavigation({ x: 88, y: 8.0546, z: 50 })
  const state = freshBomb(1, address, navigation.position)
  let event
  for (let step = 0; step < 200 && event !== 'planted'; step++) {
    const now = step / 10
    const objective = soloBombObjectives([{ index: 0, alive: true, position: navigation.position }], state, 1).get(
      address
    )
    moveBot(navigation, { now, dt: 0.1, speed: 5.525, objective })
    const atSite =
      Math.hypot(navigation.position.x - soloBombSite(1).x, navigation.position.z - soloBombSite(1).z) < 0.8
    event = stepBomb(
      state,
      [
        {
          address,
          team: 1,
          alive: true,
          position: navigation.position,
          grounded: true,
          holding: atSite,
          selected: atSite,
          canDefuse: false,
          hasKit: false
        }
      ],
      now,
      true,
      (position) => (Math.hypot(position.x - soloBombSite(1).x, position.z - soloBombSite(1).z) < 0.8 ? 'B' : '')
    )
  }
  assert.equal(event, 'planted')
  assert.equal(state.planter, address)
  assert.equal(state.site, 'B')
  assert.ok(state.explodeAt > 45)
})
