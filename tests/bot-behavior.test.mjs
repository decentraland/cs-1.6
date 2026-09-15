import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const output = mkdtempSync(join(tmpdir(), 'cs16-bot-behavior-'))
const require = createRequire(import.meta.url)
execFileSync(process.execPath, [
  'node_modules/typescript/bin/tsc',
  'src/bot-navigation.ts',
  'src/shared-random.ts',
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
const { dust2Navigation: graph, navDistance, navPoint, nearestNavNode, nearestNavNodeXZ, findNavPath } = require(
  join(output, 'navigation.js')
)
const behavior = require(join(output, 'bot-behavior.js'))
const { createBotNavigation, moveBot } = require(join(output, 'bot-navigation.js'))
const { shotRandom } = require(join(output, 'shared-random.js'))
after(() => rmSync(output, { recursive: true, force: true }))

const point = (x, y, z) => ({ x, y, z })
// Open square of 8-connected nodes at the production 0.5 m spacing.
const grid = (size = 21, spacing = 0.5) => {
  const positions = [],
    links = []
  const id = (i, j) => i * size + j
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) positions.push([i * spacing, 0, j * spacing])
  for (let i = 0; i < size; i++)
    for (let j = 0; j < size; j++) {
      const near = []
      for (const di of [-1, 0, 1])
        for (const dj of [-1, 0, 1])
          if ((di || dj) && i + di >= 0 && i + di < size && j + dj >= 0 && j + dj < size) near.push(id(i + di, j + dj))
      links.push(near)
    }
  return { positions, links }
}
const queue =
  (values, fallback = 0.5) =>
  () =>
    values.length ? values.shift() : fallback
const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) < tolerance

test('yaw steering follows the shorter arc at a limited rate and scanning stays within the half circle', () => {
  assert.equal(behavior.steerYaw(170, -170, 0.1, 100), -180)
  assert.equal(behavior.steerYaw(0, 90, 0.1, 400), 40)
  assert.equal(behavior.steerYaw(0, -90, 0.1, 400), -40)
  assert.equal(behavior.steerYaw(10, 10, 1, 400), 10)
  assert.equal(behavior.steerYaw(0, 30, 1, 400), 30)
  for (const sample of [0, 0.25, 0.5, 0.75, 1]) {
    const yaw = behavior.scanYaw(90, () => sample)
    assert.ok(Math.abs(behavior.wrapDegrees(yaw - 90)) <= 120 + 1e-9)
  }
  assert.equal(behavior.yawTo(point(0, 0, 0), point(1, 0, 0)), 90)
  assert.equal(behavior.yawTo(point(0, 0, 0), point(0, 0, 1)), 0)
})

test('strafing sidesteps perpendicular to the enemy and stands still between steps', () => {
  const square = grid()
  const enemy = point(5, 0, 9)
  const bot = createBotNavigation(point(5, 0, 5), square, queue([0.9, 0]))
  const options = (now) => ({ now, dt: 0.1, speed: 5, graph: square, observed: enemy })
  moveBot(bot, options(0))
  assert.equal(bot.mode, 'engage')
  assert.deepEqual(bot.position, point(5, 0, 5), 'contact starts with a standing burst')
  assert.equal(bot.strafe.direction, -1)
  moveBot(bot, options(0.35))
  assert.equal(bot.strafe.moving, true)
  assert.equal(bot.strafe.direction, 1, 'a new sidestep usually flips direction')
  assert.ok(near(bot.position.x, 4.5) && near(bot.position.z, 5), 'sidesteps run perpendicular to the enemy')
  moveBot(bot, options(0.45))
  assert.ok(near(bot.position.x, 4, 0.05) && near(bot.position.z, 5, 0.1), 'keeps circling the enemy')
  moveBot(bot, options(0.85))
  assert.equal(bot.strafe.moving, false)
  const stopped = { ...bot.position }
  moveBot(bot, options(1))
  assert.deepEqual(bot.position, stopped, 'the bot stops to shoot between sidesteps')
  moveBot(bot, options(1.5))
  assert.equal(bot.strafe.direction, -1)
  assert.ok(bot.position.x > stopped.x, 'the next sidestep goes the other way')
  assert.ok(near(bot.yaw, behavior.yawTo(bot.position, enemy), 1e-6), 'the bot keeps facing the enemy')
  assert.ok(
    bot.node !== undefined && navDistance(navPoint(square, bot.node), bot.position) < 0.5,
    'graph anchor follows'
  )
})

test('a wall on one side flips the sidestep and reloading bots back away from the enemy', () => {
  const square = grid()
  const edge = createBotNavigation(point(0, 0, 5), square, queue([0.1, 0]))
  const enemy = point(0, 0, 9)
  moveBot(edge, { now: 0, dt: 0.1, speed: 5, graph: square, observed: enemy })
  assert.equal(edge.strafe.direction, 1, 'direction 1 would step off the graph edge')
  moveBot(edge, { now: 0.4, dt: 0.1, speed: 5, graph: square, observed: enemy })
  assert.equal(edge.strafe.moving, true)
  assert.equal(edge.strafe.direction, -1)
  assert.ok(edge.position.x > 0, 'the blocked side is swapped for the open one')
  const reloader = createBotNavigation(point(5, 0, 5), square, () => 0.5)
  moveBot(reloader, { now: 0, dt: 0.1, speed: 5, graph: square, observed: point(5, 0, 9), reloading: true })
  assert.equal(reloader.mode, 'retreat')
  assert.ok(near(reloader.position.z, 4.5) && near(reloader.position.x, 5), 'backs straight away')
  assert.ok(Math.abs(reloader.yaw) < 1e-9, 'still facing the enemy while backing off')
  const cornered = createBotNavigation(point(5, 0, 0), square, () => 0.5)
  moveBot(cornered, { now: 0, dt: 0.1, speed: 5, graph: square, observed: point(5, 0, 4), reloading: true })
  assert.ok(near(cornered.position.z, 0) && !near(cornered.position.x, 5), 'sidesteps when straight back is blocked')
})

test('bots hold and look around after arriving, then pick a fresh destination', () => {
  const square = grid(61)
  const hotspots = [point(20, 0, 15)]
  const random = queue([0, 0, 0.9, 0.5, 0.5, 0.5, 0.9])
  const bot = createBotNavigation(point(15, 0, 15), square, random)
  const options = (now) => ({ now, dt: 0.1, speed: 5, graph: square, hotspots })
  let now = 0
  moveBot(bot, options(now))
  assert.equal(bot.mode, 'roam')
  assert.deepEqual(bot.destination, hotspots[0])
  assert.equal(bot.pace, 'run')
  assert.ok(near(bot.position.x, 15.5), 'runs at full speed toward the destination')
  for (now = 0.1; now < 5 && bot.mode === 'roam'; now += 0.1) moveBot(bot, options(now))
  assert.equal(bot.mode, 'hold')
  assert.ok(navDistance(bot.position, hotspots[0]) < 0.75)
  assert.ok(near(bot.holdUntil - now + 0.1, 4, 1e-6), 'holds for one to seven seconds')
  assert.deepEqual(bot.visited, [hotspots[0]])
  const arrivedYaw = bot.yaw
  let turned = 0,
    largestTurn = 0
  const held = { ...bot.position }
  for (; now < bot.holdUntil; now += 0.1) {
    const before = bot.yaw
    moveBot(bot, options(now))
    const step = Math.abs(behavior.wrapDegrees(bot.yaw - before))
    turned += step
    largestTurn = Math.max(largestTurn, step)
  }
  assert.deepEqual(bot.position, held, 'holding bots stand still')
  assert.ok(turned > 30 && bot.yaw !== arrivedYaw, 'the bot scans around while holding')
  assert.ok(largestTurn <= 40 + 1e-6, 'turns are rate limited to 400 degrees per second')
  moveBot(bot, options(now))
  assert.equal(bot.mode, 'roam')
  assert.ok(
    bot.destination && navDistance(bot.destination, hotspots[0]) > 1.5,
    'a recently visited spot is not chosen again'
  )
})

test('destinations mix strategic spots with random reachable wandering', () => {
  const square = grid(61)
  const here = point(15, 0, 15)
  const spots = [point(20, 0, 15), point(15, 0, 25)]
  assert.deepEqual(behavior.chooseDestination(square, here, spots, [], queue([0.1, 0.6])), spots[1])
  assert.deepEqual(behavior.chooseDestination(square, here, spots, [spots[1]], queue([0.1, 0.99])), spots[0])
  const wander = behavior.chooseDestination(square, here, spots, [], shotRandom(7, 1))
  const distance = Math.hypot(wander.x - here.x, wander.z - here.z)
  assert.ok(distance >= behavior.WANDER_MIN - 1 && distance <= behavior.WANDER_MAX + 1)
  assert.notEqual(nearestNavNode(square, wander, 0.01), undefined, 'wander targets are graph nodes')
  assert.equal(
    behavior.holdDuration(() => 0.1),
    0
  )
  assert.equal(
    behavior.holdDuration(() => 0.5, 2),
    8
  )
  assert.equal(
    behavior.choosePace(() => 0.1),
    'walk'
  )
  assert.equal(
    behavior.choosePace(() => 0.5),
    'run'
  )
})

test('Dust2 hotspots are graph nodes on the routes between the landmarks and reachable from both spawns', () => {
  const hotspots = behavior.dust2Hotspots(graph)
  assert.equal(hotspots[1].length, 8)
  assert.equal(hotspots[2].length, 12)
  const spawnT = nearestNavNodeXZ(graph, behavior.DUST2_LANDMARKS.tSpawn),
    spawnCT = nearestNavNodeXZ(graph, behavior.DUST2_LANDMARKS.ctSpawn)
  assert.notEqual(spawnT, undefined)
  assert.notEqual(spawnCT, undefined)
  const seen = new Set()
  for (const team of [1, 2])
    for (const spot of hotspots[team]) {
      const node = nearestNavNode(graph, spot, 0.01)
      assert.notEqual(node, undefined, 'hotspot lies exactly on a graph node')
      seen.add(`${team}:${node}`)
      assert.ok(findNavPath(graph, team === 1 ? spawnT : spawnCT, node).length > 1)
    }
  assert.equal(seen.size, 20, 'no team lists the same spot twice')
  const approaches = behavior.routeHotspots(
    graph,
    behavior.DUST2_LANDMARKS.tSpawn,
    behavior.DUST2_LANDMARKS.siteA,
    [0, 0.5, 1]
  )
  assert.ok(navDistance(approaches[0], behavior.DUST2_LANDMARKS.tSpawn) < 1)
  assert.ok(navDistance(approaches[2], behavior.DUST2_LANDMARKS.siteA) < 1)
  assert.ok(navDistance(approaches[1], approaches[0]) > 20 && navDistance(approaches[1], approaches[2]) > 20)
})
