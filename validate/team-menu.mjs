import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { Client, labels, pause } from './team-client.mjs'
import { readTextEntities } from './read-scoreboard.mjs'
import { autoAssignButtonPoint, teamButtonPoint } from './menu-layout.mjs'

const mode = process.argv[2]
const endpointA = process.argv[3]
const endpointB = process.argv[4]
const evidenceDir = fileURLToPath(new URL('./game/team-menu', import.meta.url))
if (!['visual', 'auto'].includes(mode) || !endpointA || (mode === 'auto' && !endpointB)) {
  throw new Error('Usage: node validate/team-menu.mjs <visual|auto> <browser-A-CDP> [browser-B-CDP]')
}

const closeTo = (actual, expected, description) =>
  assert.ok(Math.abs(actual - expected) <= 1, `${description}: ${actual} ≈ ${expected}`)
const texture = (value) => value.UiBackground?.texture?.tex?.texture?.src
const gunLabel = (state, name) => labels(state).some((value) => value.startsWith(`${name}   1:`))

function layout(width, height) {
  const scale = Math.min(width / 640, height / 480)
  const originX = (width - 640 * scale) / 2
  const originY = (height - 480 * scale) / 2
  return { scale, x: (value) => originX + value * scale, y: (value) => originY + value * scale }
}

function assertMenu(state, width, height) {
  const text = readTextEntities(state)
  const values = text.map((value) => value.UiText.value)
  const expected = [
    'SELECT TEAM',
    '1 TERRORIST FORCES',
    '2 CT FORCES',
    '5 AUTO ASSIGN',
    '6 SPECTATE',
    'Dust II - Bomb/Defuse',
    '*** GameHelper.com exclusive ***',
    'Counter-Terrorists: Prevent Terrorists',
    'from bombing chemical weapon crates.',
    'Terrorists: The Terrorist carrying the',
    'C4 must destroy one of the chemical',
    'Other Notes: There are 2 chemical',
    'weapon stashes in the mission.'
  ]
  for (const value of expected) assert.ok(values.includes(value), `visible menu text: ${value}`)

  const coordinates = layout(width, height)
  const transforms = Object.values(state)
    .map((value) => value.UiTransform)
    .filter(Boolean)
  const outer = transforms.find(
    (value) =>
      Math.abs(value.width - 600 * coordinates.scale) <= 1 && Math.abs(value.height - 440 * coordinates.scale) <= 1
  )
  assert.ok(outer, '600×440 source panel is rendered')
  closeTo(outer.positionLeft, coordinates.x(20), 'outer panel left')
  closeTo(outer.positionTop, coordinates.y(20), 'outer panel top')

  const map = transforms.find(
    (value) =>
      Math.abs(value.width - 316 * coordinates.scale) <= 1 && Math.abs(value.height - 286 * coordinates.scale) <= 1
  )
  assert.ok(map, '316×286 source briefing panel is rendered')
  closeTo(map.positionLeft, coordinates.x(244), 'briefing panel left')
  closeTo(map.positionTop, coordinates.y(116), 'briefing panel top')

  const logo = Object.values(state).find((value) => texture(value) === 'assets/ui/cs-logo.png')
  assert.ok(logo, 'original Counter-Strike logo is rendered')
  closeTo(logo.UiTransform.positionLeft, coordinates.x(26), 'logo left')
  closeTo(logo.UiTransform.positionTop, coordinates.y(20), 'logo top')
  closeTo(logo.UiTransform.width, 32 * coordinates.scale, 'logo width')

  const buttons = transforms.filter(
    (value) =>
      Math.abs(value.width - 148 * coordinates.scale) <= 1 &&
      Math.abs(value.height - 20 * coordinates.scale) <= 1 &&
      value.borderLeftWidth === 1
  )
  assert.equal(buttons.length, 4, 'the four source team controls (no practice extension)')
  const tops = buttons.map((value) => value.positionTop).sort((a, b) => a - b)
  for (const [index, sourceTop] of [116, 148, 212, 244].entries())
    closeTo(tops[index], coordinates.y(sourceTop), `button ${index + 1} top`)

  const title = text.find((value) => value.UiText.value === 'SELECT TEAM')
  assert.ok(title?.UiTransform, 'bitmap title has layout geometry')
  closeTo(title.UiTransform.positionLeft, coordinates.x(76), 'title left')
  closeTo(title.UiTransform.positionTop, coordinates.y(22), 'title top')
  return {
    width,
    height,
    scale: coordinates.scale,
    outer: { left: outer.positionLeft, top: outer.positionTop, width: outer.width, height: outer.height }
  }
}

async function setViewport(client, width, height) {
  await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await pause(500)
  return client.until((state) => {
    const expectedWidth = 600 * Math.min(width / 640, height / 480)
    return Object.values(state).some(
      (value) =>
        Math.abs((value.UiTransform?.width ?? 0) - expectedWidth) <= 1 &&
        Math.abs((value.UiTransform?.height ?? 0) - 440 * Math.min(width / 640, height / 480)) <= 1
    )
  }, `${width}×${height} menu layout`)
}

async function saveScreenshot(client, name) {
  const capture = await client.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(evidenceDir, name), Buffer.from(capture.data, 'base64'))
}

await mkdir(evidenceDir, { recursive: true })

if (mode === 'visual') {
  const client = new Client(endpointA)
  try {
    await client.connect()
    await client.until((state) => labels(state).includes('Select a team'), 'fresh team menu', 45000)
    await client.evaluate('document.exitPointerLock()')
    const compact = await setViewport(client, 800, 450)
    const compactLayout = assertMenu(compact, 800, 450)
    await saveScreenshot(client, 'team-menu-800x450.png')
    const wide = await setViewport(client, 1280, 720)
    const wideLayout = assertMenu(wide, 1280, 720)
    await saveScreenshot(client, 'team-menu-1280x720.png')
    const point = teamButtonPoint(1280, 720, 2)
    await client.click(point.x, point.y)
    await client.until((state) => labels(state).includes('Joined Counter-Terrorists'), 'CT button admits the player')
    await client.until((state) => labels(state).includes('Prepare to fight!'), 'joining a team starts freeze time')
    await writeFile(
      join(evidenceDir, 'visual.json'),
      JSON.stringify(
        {
          date: new Date().toISOString(),
          compactLayout,
          wideLayout,
          checks: [
            'exact visible team labels and Dust II briefing',
            'resource coordinates at 800×450 and 1280×720',
            'original logo',
            'CT button starts freeze time against bots'
          ]
        },
        null,
        2
      ) + '\n'
    )
    console.log('PASS: CS team menu text, source geometry, responsive framing, logo, and immediate team start')
  } finally {
    if (client.sessionId)
      await client.send('Emulation.clearDeviceMetricsOverride').catch((error) => console.warn(error.message))
    client.socket.close()
  }
} else {
  const a = new Client(endpointA)
  const b = new Client(endpointB)
  try {
    await Promise.all([a.connect(), b.connect()])
    await Promise.all([a.evaluate('document.exitPointerLock()'), b.evaluate('document.exitPointerLock()')])
    const states = await Promise.all([setViewport(a, 800, 450), setViewport(b, 800, 450)])
    for (const state of states) {
      assert.ok(labels(state).includes('Select a team'), 'fresh auto-assign menu')
      assert.ok(!labels(state).includes('CONNECTING...'), 'auto-assign is enabled')
    }
    const point = autoAssignButtonPoint(800, 450)
    await a.click(point.x, point.y)
    await a.until((state) => labels(state).includes('Joined Terrorists'), 'first auto-assign picks Terrorists')
    await a.until((state) => labels(state).includes('Prepare to fight!'), 'first pick starts a freeze against bots')
    await saveScreenshot(a, 'auto-assign-waiting.png')
    await b.click(point.x, point.y)
    await b.until((state) => labels(state).includes('Joined Counter-Terrorists'), 'second auto-assign picks CT')
    // The bots hold CT until this round ends, so feed the Terrorist to their spawn and wait for round two.
    await a.command('/move_player_to 51.61083 7.76 46.70173')
    await a.until((state) => labels(state).some((value) => value.endsWith('Win!')), 'warm-up round ends', 140000)
    const active = await Promise.all([
      a.until(
        (state) => labels(state).includes('Prepare to fight!') && gunLabel(state, 'Glock-18'),
        'Terrorist receives Glock in freeze time',
        15000
      ),
      b.until(
        (state) => labels(state).includes('Prepare to fight!') && gunLabel(state, 'USP'),
        'Counter-Terrorist receives USP in freeze time',
        15000
      )
    ])
    await writeFile(
      join(evidenceDir, 'auto-assign.json'),
      JSON.stringify(
        {
          date: new Date().toISOString(),
          firstAssignment: 'Terrorists',
          secondAssignment: 'Counter-Terrorists',
          firstLoadout: gunLabel(active[0], 'Glock-18') ? 'Glock-18' : undefined,
          secondLoadout: gunLabel(active[1], 'USP') ? 'USP' : undefined,
          checks: [
            'first player is assigned to Terrorists on a tie and starts against bots',
            'second player is assigned to Counter-Terrorists (bots are not counted)',
            'both humans spawn together in the next freeze time'
          ]
        },
        null,
        2
      ) + '\n'
    )
    console.log('PASS: auto-assign balances T then CT and both humans share the next round')
  } finally {
    for (const client of [a, b]) {
      if (client.sessionId)
        await client.send('Emulation.clearDeviceMetricsOverride').catch((error) => console.warn(error.message))
      client.socket.close()
    }
  }
}
