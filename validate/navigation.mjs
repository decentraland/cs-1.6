import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { Client, pause, labels, readHud } from './team-client.mjs'
import { isBotRoundLive } from './solo-flow.mjs'
if (!process.argv[2])
  throw new Error('Usage: node validate/navigation.mjs <browser-CDP-websocket> (joins CT if needed)')
const root = fileURLToPath(new URL('../', import.meta.url)),
  output = mkdtempSync(join(tmpdir(), 'cs16-nav-runtime-'))
execFileSync(process.execPath, [
  join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
  join(root, 'src', 'navigation.ts'),
  join(root, 'src', 'world-query.ts'),
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
const require = createRequire(import.meta.url),
  { dust2Navigation: graph, nearestNavNode, navPoint, navDistance } = require(join(output, 'navigation.js'))
const { mapDistance } = require(join(output, 'world-query.js'))
const c = new Client(process.argv[2]),
  directory = join(root, 'validate', 'game', 'navigation'),
  evidence = { date: new Date().toISOString(), checks: [], samples: [] }
const bots = (s) =>
  Object.entries(s)
    .filter(([, v]) => v.MeshCollider && v.Transform && v.AvatarShape)
    .map(([id, v]) => ({ id, name: v.AvatarShape.name, position: { ...v.Transform.position } }))
try {
  await c.connect()
  if (labels(await c.snapshot()).includes('Select a team')) await c.join(2)
  const live = await c.until(
    (s) => readHud(s)?.health === 100 && readHud(s)?.seconds > 110 && isBotRoundLive(s),
    'fresh live bot round',
    40000
  )
  const initial = bots(live)
  assert.equal(initial.length, 3)
  // Stay at the CT spawn: the bots start at the T spawn, cross the map to B and reacquire the CT from there.
  const home = { ...live['1'].Transform.position }
  const started = Date.now()
  let last = initial,
    lastAt = started,
    hit = false
  while (Date.now() - started < 60000) {
    await pause(200)
    const s = await c.snapshot(),
      now = Date.now(),
      current = bots(s),
      elapsed = (now - started) / 1000,
      hud = readHud(s)
    if (labels(s).includes('Prepare to fight!')) throw new Error('round reset during navigation observation')
    assert.equal(current.length, 3)
    for (const bot of current) {
      const before = last.find((b) => b.id === bot.id)
      assert.ok(before, 'bot identity retained')
      assert.ok(
        navDistance(bot.position, before.position) <= ((now - lastAt) / 1000 + 0.2) * 5.525 + 0.3,
        'bot displacement respects movement speed'
      )
      const node = nearestNavNode(graph, bot.position, 1.2)
      assert.notEqual(node, undefined, 'bot remains on navigation surface')
      const floor = mapDistance({ ...bot.position, y: bot.position.y + 0.55 }, { x: 0, y: -1, z: 0 }, 1.2)
      assert.ok(floor < 1.1, 'actual collision floor supports bot')
    }
    evidence.samples.push({ seconds: Number(elapsed.toFixed(2)), health: hud.health, bots: current })
    if (elapsed < 5) assert.equal(hud.health, 100, 'distant walls prevent bot damage')
    last = current
    lastAt = now
    if (hud.health < 100) {
      hit = true
      break
    }
  }
  const final = evidence.samples.at(-1)
  const movements = final.bots.map((b) => ({
    id: b.id,
    distance: navDistance(b.position, initial.find((a) => a.id === b.id).position)
  }))
  assert.ok(
    movements.filter((b) => b.distance > 20).length >= 2,
    'at least two bots traverse beyond their original encounter'
  )
  assert.ok(
    movements.some((b) => b.distance > 50),
    'one bot crosses the map from T spawn toward the bomb sites'
  )
  assert.ok(hit, 'a bot reacquires the distant CT and attacks')
  evidence.movements = movements
  evidence.checks.push(
    'three server-owned bots remain floor-supported and speed-limited across Dust2',
    'distant CT receives no through-wall damage in the opening seconds',
    'bots leave the T spawn for their objective and reacquire the CT'
  )
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'routes.json'), JSON.stringify(evidence, null, 2) + '\n')
  await c.evaluate('document.exitPointerLock()')
  await c.capture()
  const target = final.bots.sort((a, b) => navDistance(a.position, home) - navDistance(b.position, home))[0]
  await c.aimAt({ ...target.position, y: target.position.y + 1.4 })
  await promisify(execFile)(
    'agent-browser',
    ['--session', 'cs16-navigation', 'screenshot', join(directory, 'patrol.png')],
    { timeout: 45000 }
  )
  console.log(
    JSON.stringify({ checks: evidence.checks, movements, seconds: final.seconds, health: final.health }, null, 2)
  )
} finally {
  c.socket.close()
  rmSync(output, { recursive: true, force: true })
}
