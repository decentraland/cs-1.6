import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const output = mkdtempSync(join(tmpdir(), 'cs16-navigation-'))
const require = createRequire(import.meta.url)
execFileSync(process.execPath, [
  'node_modules/typescript/bin/tsc',
  'src/bot-navigation.ts',
  'src/team-spawns.ts',
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
const { dust2Navigation: graph, navPoint, nearestNavNode, nearestNavNodeBelow, findNavPath, navDistance } = require(
  join(output, 'navigation.js')
)
const { createBotNavigation, moveBot } = require(join(output, 'bot-navigation.js'))
const { teamSpawn } = require(join(output, 'team-spawns.js'))
const { mapDistance } = require(join(output, 'world-query.js'))
after(() => rmSync(output, { recursive: true, force: true }))
const point = (x, y, z) => ({ x, y, z })
const route = (a, b) => {
  const start = nearestNavNode(graph, a),
    end = nearestNavNode(graph, b)
  assert.notEqual(start, undefined)
  assert.notEqual(end, undefined)
  const path = findNavPath(graph, start, end)
  assert.ok(path.length > 1)
  assert.equal(path[0], start)
  assert.equal(path.at(-1), end)
  return path.map((node) => navPoint(graph, node))
}
test('all original human spawns and both bomb sites connect to the Dust2 walkable graph', () => {
  const sites = [point(33, 12.5861, 46.5), point(104.5, 10.026, 40.5)]
  for (const team of [1, 2])
    for (let slot = 0; slot < 20; slot++) {
      const position = teamSpawn(team, slot).position
      const node = nearestNavNode(graph, position)
      assert.notEqual(node, undefined, `team ${team} slot ${slot}`)
      assert.ok(navDistance(navPoint(graph, node), position) < 0.65)
    }
  for (const site of sites) route(teamSpawn(1, 0).position, site)
  route(teamSpawn(2, 0).position, sites[1])
})
test('a bomb planted on a crate resolves to the walkable node beside it', () => {
  const crate = point(104.5, 10.026 + 1.2, 40.5)
  assert.equal(nearestNavNode(graph, crate), undefined)
  const node = nearestNavNodeBelow(graph, crate)
  assert.notEqual(node, undefined)
  const beside = navPoint(graph, node)
  assert.ok(Math.hypot(beside.x - crate.x, beside.z - crate.z) < 1.2)
  assert.ok(crate.y - beside.y > 0 && crate.y - beside.y < 1.6)
  assert.equal(nearestNavNodeBelow(graph, point(104.5, 10.026 + 3, 40.5)), undefined)
})
test('the route around the measured east wall stays on supported ground with standing clearance', () => {
  const start = point(95, 10.026, 52),
    end = point(104.5, 10.026, 40.5)
  const direct = navDistance(start, end),
    direction = point((end.x - start.x) / direct, 0, (end.z - start.z) / direct)
  assert.ok(
    mapDistance({ ...start, y: start.y + 1.6 }, direction, direct) < direct - 1,
    'straight shortcut is obstructed'
  )
  const path = route(start, end)
  let length = 0
  for (let i = 0; i < path.length; i++) {
    const p = path[i]
    assert.ok(
      mapDistance({ ...p, y: p.y + 0.08 }, point(0, -1, 0), 0.2) < 0.1,
      'waypoint lies on actual collision floor'
    )
    assert.equal(mapDistance({ ...p, y: p.y + 0.49 }, point(0, 1, 0), 1.31), 1.31, 'standing headroom')
    if (!i) continue
    const before = path[i - 1],
      distance = navDistance(before, p)
    length += distance
    assert.ok(Math.abs(p.y - before.y) <= 0.481, 'stairs respect step height')
    const direction = point((p.x - before.x) / distance, (p.y - before.y) / distance, (p.z - before.z) / distance)
    for (const height of [0.49, 1.2, 1.75])
      assert.ok(
        mapDistance({ ...before, y: before.y + height }, direction, distance) >= distance - 0.001,
        'path segment does not cross a wall'
      )
  }
  assert.ok(length > direct + 2, 'path takes a detour')
})
test('routing cannot jump between disconnected platforms and rejects invalid endpoints', () => {
  const disconnected = {
    positions: [
      [0, 0, 0],
      [0, 4, 0]
    ],
    links: [[], []]
  }
  assert.deepEqual(findNavPath(disconnected, 0, 1), [])
  assert.deepEqual(findNavPath(disconnected, 0, 8), [])
  assert.equal(nearestNavNode(disconnected, point(0, 2, 0)), undefined)
  assert.equal(nearestNavNode(disconnected, point(0, 4, 0)), 1)
})
const corridor = (nodes = 81, spacing = 0.5) => ({
  positions: Array.from({ length: nodes }, (_, i) => [i * spacing, 0, 0]),
  links: Array.from({ length: nodes }, (_, i) => [i - 1, i + 1].filter((n) => n >= 0 && n < nodes))
})
test('bot remembers observed targets, closes in along the graph, and roams again after losing contact', () => {
  const line = corridor(),
    hotspots = [point(40, 0, 0)],
    zero = () => 0
  const options = (now, extra = {}) => ({ now, dt: 0.1, speed: 5, graph: line, hotspots, ...extra })
  const bot = createBotNavigation(point(0, 0, 0), line, zero)
  moveBot(bot, options(0, { observed: point(20, 0, 0) }))
  assert.equal(bot.mode, 'engage')
  assert.deepEqual(bot.lastSeen, point(20, 0, 0))
  assert.ok(bot.position.x > 0 && bot.position.x <= 0.5, 'a distant enemy is approached')
  moveBot(bot, options(1))
  assert.equal(bot.mode, 'hunt')
  assert.deepEqual(bot.lastSeen, point(20, 0, 0), 'hidden motion never updates last seen position')
  moveBot(bot, options(10))
  assert.equal(bot.lastSeen, undefined)
  assert.equal(bot.mode, 'roam')
  assert.equal(bot.goal, 80, 'roaming heads for a strategic spot')
  assert.equal(bot.pace, 'walk')
  const before = { ...bot.position }
  moveBot(bot, options(10.1))
  assert.ok(Math.abs(bot.position.x - before.x - 0.26) < 1e-9, 'walking keeps 52% of the run speed')
  moveBot(bot, options(11, { observed: point(bot.position.x + 2, 0, 0) }))
  assert.equal(bot.mode, 'engage')
  assert.ok(Math.abs(bot.position.x - before.x - 0.26) < 1e-9, 'a nearby enemy in a corridor is fought standing')
  const objectiveBot = createBotNavigation(point(0, 0, 0), line, zero)
  moveBot(objectiveBot, options(11, { observed: point(2, 0, 0), objective: point(20, 0, 0) }))
  assert.equal(objectiveBot.mode, 'objective')
  assert.ok(objectiveBot.position.x > 0, 'a bomb objective overrides the combat stop')
  const fresh = createBotNavigation(point(0, 0, 0), line, zero)
  moveBot(fresh, options(12, { dt: 100 }))
  assert.ok(fresh.position.x <= 1, 'delayed ticks cannot teleport bots through the route')
})
test('teammate callouts send a bot hunting, then it searches the spot and gives up', () => {
  const line = corridor()
  const options = (now, extra = {}) => ({ now, dt: 0.1, speed: 5, graph: line, hotspots: [point(0, 0, 0)], ...extra })
  const bot = createBotNavigation(point(0, 0, 0), line, () => 0.5)
  moveBot(bot, options(0, { reported: point(3, 0, 0) }))
  assert.equal(bot.mode, 'hunt')
  assert.equal(bot.heard, true)
  assert.deepEqual(bot.lastSeen, point(3, 0, 0))
  moveBot(bot, options(0.1, { observed: point(4, 0, 0) }))
  assert.equal(bot.heard, false, 'seeing the enemy replaces the callout')
  let now = 0.2
  for (; now < 3 && bot.mode !== 'search'; now += 0.1) moveBot(bot, options(now))
  assert.equal(bot.mode, 'search')
  assert.ok(Math.abs(bot.position.x - 4) < 0.8, 'the bot reaches the last known position')
  const searched = bot.position
  for (; bot.mode === 'search' && now < 10; now += 0.1) moveBot(bot, options(now))
  assert.equal(bot.mode, 'roam')
  assert.equal(bot.lastSeen, undefined)
  assert.ok(now - 0.2 >= 1.5 && now < 5, 'searching lasts a few seconds')
  assert.deepEqual(bot.position, searched, 'searching happens standing still')
})
test('smoothed routes cut corners without crossing walls and stay on the floor', () => {
  const start = point(95, 10.026, 52),
    end = point(104.5, 10.026, 40.5)
  const bot = createBotNavigation(start, graph, () => 0.5)
  const trail = [{ ...bot.position }]
  for (let now = 0; now < 30 && navDistance(bot.position, end) > 0.75; now += 0.05) {
    moveBot(bot, { now, dt: 0.05, speed: 5.525, objective: end })
    trail.push({ ...bot.position })
  }
  assert.ok(navDistance(bot.position, end) <= 0.75, 'the bot arrives')
  let length = 0
  for (let i = 1; i < trail.length; i++) {
    const before = trail[i - 1],
      p = trail[i],
      distance = navDistance(before, p)
    if (distance < 1e-6) continue
    length += distance
    assert.ok(mapDistance({ ...p, y: p.y + 0.3 }, point(0, -1, 0), 0.6) < 0.5, 'bot stays close to the floor')
    const direction = point((p.x - before.x) / distance, (p.y - before.y) / distance, (p.z - before.z) / distance)
    for (const height of [0.49, 1.2, 1.75])
      assert.ok(
        mapDistance({ ...before, y: before.y + height }, direction, distance) >= distance - 0.001,
        'movement never crosses a wall'
      )
  }
  const nodes = route(start, end)
  let raw = 0
  for (let i = 1; i < nodes.length; i++) raw += navDistance(nodes[i - 1], nodes[i])
  assert.ok(length < raw, 'corner cutting shortens the node-to-node route')
})

test('solo encounter bots spawn on the sloping floor instead of the former fixed height', () => {
  for (const start of [point(88, 10.026, 50), point(85, 10.026, 54), point(90, 10.026, 48)]) {
    const probe = { ...start, y: start.y + 0.1 },
      floor = mapDistance(probe, point(0, -1, 0), 6)
    const grounded = { ...start, y: probe.y - floor }
    const bot = createBotNavigation(grounded)
    assert.ok(navDistance(bot.position, grounded) < 0.5)
    assert.ok(mapDistance({ ...bot.position, y: bot.position.y + 0.05 }, point(0, -1, 0), 0.1) < 0.06)
  }
})
