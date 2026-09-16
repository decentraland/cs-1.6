import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const output = mkdtempSync(join(tmpdir(), 'cs16-bot-movement-')),
  require = createRequire(import.meta.url)
execFileSync(process.execPath, [
  'node_modules/typescript/bin/tsc',
  'src/bot-motion.ts',
  'src/penetration.ts',
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
const { SolidTracer } = require(join(output, 'solid-trace.js'))
const { CsMovement } = require(join(output, 'cs-movement-rules.js'))
const { advanceBot, groundedBotWorld } = require(join(output, 'bot-motion.js'))
const { createBotNavigation } = require(join(output, 'bot-navigation.js'))
const { dust2Navigation, navDistance, walkableNode, nearestNavNode } = require(join(output, 'navigation.js'))
const { bulletWorldTrace } = require(join(output, 'penetration.js'))
const { teamSpawn } = require(join(output, 'team-spawns.js'))
after(() => rmSync(output, { recursive: true, force: true }))
const p = (x, y, z) => ({ x, y, z })
const grid = (size = 41) => {
  const positions = [],
    links = []
  for (let x = 0; x < size; x++) for (let z = 0; z < size; z++) positions.push([x * 0.5, 0, z * 0.5])
  for (let x = 0; x < size; x++)
    for (let z = 0; z < size; z++) {
      const near = []
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++)
          if ((dx || dz) && x + dx >= 0 && x + dx < size && z + dz >= 0 && z + dz < size)
            near.push((x + dx) * size + z + dz)
      links.push(near)
    }
  return { positions, links }
}
const floor = (origin, direction, distance) => {
  const t = direction.y < 0 ? -origin.y / direction.y : Infinity,
    solid = t >= 0 && t <= distance && origin.x >= 0 && origin.x <= 20 && origin.z >= 0 && origin.z <= 20
  return {
    distance: solid ? t : distance,
    position: {
      x: origin.x + direction.x * (solid ? t : distance),
      y: solid ? 0 : origin.y + direction.y * distance,
      z: origin.z + direction.z * (solid ? t : distance)
    },
    normal: { x: 0, y: 1, z: 0 },
    solid,
    startSolid: false,
    allSolid: false,
    material: 'concrete',
    texture: ''
  }
}
const line = grid(),
  world = groundedBotWorld(floor),
  speed = (m) => Math.hypot(m.velocity.x, m.velocity.z)
function runner(start = p(10, 0, 2), target = p(10, 0, 18)) {
  const bot = createBotNavigation(start, line, () => 0.5),
    movement = new CsMovement()
  let now = 0
  const step = (extra = {}) => {
    now += 1 / 60
    advanceBot(bot, movement, { dt: 1 / 60, now, speed: 5.525, graph: line, objective: target, ...extra }, world)
  }
  return { bot, movement, step }
}
test('bot route intent accelerates through CS movement and friction instead of teleporting at full speed', () => {
  const { bot, movement, step } = runner()
  step()
  assert.ok(speed(movement) > 0.1 && speed(movement) < 1)
  for (let i = 0; i < 60; i++) step()
  assert.ok(Math.abs(speed(movement) - 5.525) < 0.01)
  bot.lastSeen = undefined
  bot.mode = 'hold'
  bot.holdUntil = 100
  step({ objective: undefined })
  assert.ok(speed(movement) < 5.525 && speed(movement) > 0)
  for (let i = 0; i < 60; i++) step({ objective: undefined })
  assert.ok(speed(movement) < 0.1)
})
test('small flinch reduces actual bot displacement and recovers while the bot follows its route', () => {
  const { bot, movement, step } = runner()
  for (let i = 0; i < 60; i++) step()
  const before = bot.position
  movement.hit(false, p(10, 0, 18), bot.position)
  const speeds = []
  for (let i = 0; i < 60; i++) {
    step()
    speeds.push(speed(movement))
  }
  assert.ok(Math.min(...speeds) < 2)
  assert.equal(movement.modifier, 1)
  assert.ok(speeds.at(-1) > 5)
  assert.ok(bot.position.z - before.z < 5.525, 'the hit costs real ground distance')
})
test('large flinch pushes a stopped bot away from the attacker and clears with a fresh spawn motor', () => {
  const { bot, movement, step } = runner()
  bot.holdUntil = 100
  bot.mode = 'hold'
  movement.hit(true, p(10, 0, 7), bot.position)
  const start = bot.position.z
  for (let i = 0; i < 10; i++) step({ objective: undefined })
  assert.ok(bot.position.z < start - 0.03)
  assert.ok(movement.modifier > 0.65)
  movement.reset()
  assert.equal(movement.modifier, 1)
  assert.equal(speed(movement), 0)
})
test('bot impulse is clipped at the navigation boundary and cannot jump disconnected ground', () => {
  const { bot, movement, step } = runner(p(10, 0, 0))
  bot.holdUntil = 100
  bot.mode = 'hold'
  movement.hit(true, p(10, 0, 5), bot.position)
  for (let i = 0; i < 30; i++) step({ objective: undefined })
  assert.ok(bot.position.z >= -0.35)
  assert.ok(speed(movement) < 0.05)
  const clip = groundedBotWorld((origin, direction, distance) =>
    origin.x > 0.2 && origin.x < 0.5
      ? { ...floor(origin, direction, distance), solid: false }
      : floor(origin, direction, distance)
  )
  assert.ok(clip(p(0, 0, 0), p(1, 0, 0)).x < 0.25)
})
test('physical bot movement navigates Dust2 walls, ramps and bomb routes after flinches', () => {
  const mapWorld = groundedBotWorld(bulletWorldTrace)
  const routes = [
    [p(95, 10.026, 52), p(104.5, 10.026, 40.5)],
    [teamSpawn(1, 0).position, p(33, 12.5861, 46.5)],
    [teamSpawn(2, 0).position, p(104.5, 10.026, 40.5)]
  ]
  for (const hz of [60, 30, 20])
    for (const [from, to] of routes) {
      const bot = createBotNavigation(from, dust2Navigation, () => 0.5),
        movement = new CsMovement()
      let closest = navDistance(bot.position, to)
      for (let frame = 0; frame < 120 * hz && closest > 0.8; frame++) {
        if (frame === 80 || frame === 200)
          movement.hit(frame === 80, p(bot.position.x + 5, bot.position.y, bot.position.z), bot.position)
        const before = bot.position
        advanceBot(bot, movement, { dt: 1 / hz, now: frame / hz, speed: 5.525, objective: to }, mapWorld)
        assert.notEqual(nearestNavNode(dust2Navigation, bot.position, 0.9), undefined, 'stays near a recoverable route')
        assert.ok(
          Math.abs(bot.position.y - before.y) < 0.46,
          'cannot hop tall geometry ' + JSON.stringify({ hz, from, to, before, after: bot.position })
        )
        closest = navDistance(bot.position, to)
      }
      assert.ok(
        closest < 0.8,
        JSON.stringify({
          hz,
          from,
          to,
          last: bot.position,
          mode: bot.mode,
          distance: closest,
          path: bot.path.slice(0, 3)
        })
      )
    }
})

function solidWorld(boxes) {
  const map = { planes: [[0, 1, 0, 0]], nodes: [[0, -1, -2]], roots: [0], vertices: [], surfaces: [] }
  for (const [min, max] of boxes) {
    const root = map.nodes.length
    map.roots.push(root)
    const faces = [
      [1, 0, 0, max.x],
      [-1, 0, 0, -min.x],
      [0, 1, 0, max.y],
      [0, -1, 0, -min.y],
      [0, 0, 1, max.z],
      [0, 0, -1, -min.z]
    ]
    for (let i = 0; i < 6; i++) {
      const plane = map.planes.length
      map.planes.push(faces[i])
      map.nodes.push([plane, -1, i === 5 ? -2 : root + i + 1])
    }
  }
  const tracer = new SolidTracer(map)
  return groundedBotWorld((...args) => tracer.trace(...args))
}
test('bot hull stops at walls and low ceilings, slides along walls, and respects step height', () => {
  const wall = solidWorld([[p(0, 0, 5), p(20, 3, 6)]]),
    blocked = wall(p(10, 0, 4), p(0, 0, 3))
  assert.ok(blocked.z <= 4.702)
  const slide = wall(p(4, 0, 4), p(2, 0, 3))
  assert.ok(slide.x > 5.8 && slide.z <= 4.702)
  const ceiling = solidWorld([[p(0, 1.3, 8), p(20, 1.6, 12)]])
  assert.ok(ceiling(p(10, 0, 7), p(0, 0, 4)).z <= 7.702)
  const low = solidWorld([[p(0, 0, 5), p(20, 0.4, 8)]])
  const climbed = low(p(10, 0, 4), p(0, 0, 2))
  assert.ok(climbed.z > 5.8 && Math.abs(climbed.y - 0.4) < 0.002)
  const high = solidWorld([[p(0, 0, 5), p(20, 0.5, 8)]])
  assert.ok(high(p(10, 0, 4), p(0, 0, 2)).z < 5)
})
