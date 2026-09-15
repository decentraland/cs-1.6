import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Client, labels, readHud, startTeamMatch } from './team-client.mjs'
import { spectatorButtonPoint } from './menu-layout.mjs'

const [observerEndpoint, terroristEndpoint, counterTerroristEndpoint] = process.argv.slice(2)
if (!observerEndpoint || !terroristEndpoint || !counterTerroristEndpoint) {
  throw new Error('Usage: node validate/voluntary-spectator.mjs <observer-CDP> <T-CDP> <CT-CDP> (fresh realm)')
}

const output = fileURLToPath(new URL('./game/voluntary-spectator.json', import.meta.url))
const screenshot = fileURLToPath(new URL('./game/voluntary-spectator.png', import.meta.url))
const observer = new Client(observerEndpoint)
const terrorist = new Client(terroristEndpoint)
const counterTerrorist = new Client(counterTerroristEndpoint)
const clients = [observer, terrorist, counterTerrorist]
const spectatorLabel = (state) => labels(state).find((value) => value.startsWith('Spectating: '))
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

try {
  await Promise.all(clients.map((client) => client.connect()))
  await Promise.all(
    clients.map((client) =>
      client.send('Emulation.setDeviceMetricsOverride', {
        width: 800,
        height: 450,
        deviceScaleFactor: 1,
        mobile: false
      })
    )
  )
  await observer.until(
    (state) => labels(state).includes('Select a team') && !labels(state).includes('CONNECTING...'),
    'enabled spectator menu',
    45000
  )
  await observer.command('/move_player_to 90 11 45')
  await observer.evaluate('document.exitPointerLock()')
  const point = spectatorButtonPoint(800, 450)
  await observer.click(point.x, point.y)
  await observer.until(
    (state) => labels(state).includes('Joined Spectators') && labels(state).includes('JOINED SPECTATORS'),
    'spectator admission'
  )

  // A lone spectator starts nothing; the first team pick starts a warm-up against bots and the second
  // human joins the next round. The helper returns once both humans stand in that round's freeze.
  const warmUp = await startTeamMatch(terrorist, 1, [[counterTerrorist, 2]])
  const startedAt = Date.now()
  await terrorist.command('/move_player_to 90 11 52')
  await counterTerrorist.command('/move_player_to 90 11 64')
  const watching = await observer.until(
    (state) =>
      !!spectatorLabel(state) && labels(state).includes('Free Chase Cam — Click: next / Shift+click: previous'),
    'immediate chase view'
  )
  const chaseReadyMs = Date.now() - startedAt
  assert.ok(
    chaseReadyMs < 2300,
    `voluntary chase starts without the three-second death transition (${chaseReadyMs} ms)`
  )
  assert.equal(
    labels(watching).includes('Waiting for the next round'),
    false,
    'neutral spectator does not render the dead-player waiting message'
  )
  assert.equal(
    watching['2'].PointerLock?.isPointerLocked,
    true,
    'spectator controls capture automatically when the match starts'
  )
  const firstTarget = spectatorLabel(watching)
  const firstCamera = watching['2'].Transform.position
  const ammo = readHud(watching)?.clip
  await observer.shoot(70)
  const cycled = await observer.until(
    (state) => spectatorLabel(state) !== undefined && spectatorLabel(state) !== firstTarget,
    'spectator cycles across teams'
  )
  assert.ok(distance(firstCamera, cycled['2'].Transform.position) > 1, 'chase camera moves to the other spawn')
  assert.equal(readHud(cycled)?.clip, ammo, 'spectator click cannot fire or consume ammunition')
  const capture = await observer.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(screenshot, Buffer.from(capture.data, 'base64'))
  await writeFile(
    output,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        warmUp,
        chaseReadyMs,
        firstTarget,
        cycledTarget: spectatorLabel(cycled),
        cameraTravel: distance(firstCamera, cycled['2'].Transform.position),
        ammo,
        checks: [
          'menu spectator admission',
          'neutral seat starts no round on its own',
          'no death transition',
          'automatic mouse capture',
          'both teams are chase targets',
          'click cycles without firing'
        ]
      },
      null,
      2
    ) + '\n'
  )
  console.log('PASS: voluntary spectator admission → immediate cross-team chase → click cycles without firing')
} finally {
  for (const client of clients) {
    if (client.sessionId) {
      await client.evaluate('document.exitPointerLock()').catch((error) => console.warn(error.message))
      await client.send('Emulation.clearDeviceMetricsOverride').catch((error) => console.warn(error.message))
    }
    client.socket.close()
  }
}
