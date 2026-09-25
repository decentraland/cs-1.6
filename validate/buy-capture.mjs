import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { Client, pause, labels } from './team-client.mjs'
import { readTextEntities } from './read-scoreboard.mjs'

const endpoint = process.argv[2],
  dir = process.argv[3] ?? 'validate/game/buy-capture'
assert.ok(endpoint, 'Usage: node validate/buy-capture.mjs <owned-browser-CDP> [output-directory]')
const reuse = process.argv.includes('--reuse')
const c = new Client(endpoint, reuse ? 'realm=' : 'about:blank', 'CS16')
const state = (snapshot) =>
  Object.values(snapshot).flatMap((value) =>
    value.TextShape?.text.startsWith('menu-capture:') ? [JSON.parse(value.TextShape.text.slice(13))] : []
  )[0]
await mkdir(dir, { recursive: true })
const evidence = { date: new Date().toISOString(), muted: true }
try {
  await c.connect()
  const session = c.sessionId
  c.sessionId = undefined
  try {
    await c.send('Browser.setPermission', {
      permission: { name: 'loopback-network' },
      setting: 'granted',
      origin: 'https://decentraland.org'
    })
  } finally {
    c.sessionId = session
  }
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
  if (reuse) await c.send('Page.reload')
  else
    await c.send('Page.navigate', {
      url: 'https://decentraland.org/bevy-web/?preview=true&realm=http%3A%2F%2F127.0.0.1%3A8034&position=5%2C8'
    })
  const deadline = Date.now() + 120000
  while (!(await c.evaluate("typeof window.engine_console_command === 'function'"))) {
    assert.ok(Date.now() < deadline, 'Bevy console becomes ready')
    await c.evaluate(
      "[...document.querySelectorAll('button')].find(button => button.textContent?.includes('EXPLORE AS GUEST'))?.click()"
    )
    await pause(500)
  }
  await c.until((s) => labels(s).includes('Select a team') && state(s)?.money !== undefined, 'team menu', 60000)
  await c.join(2)
  await c.until((s) => state(s)?.spawns >= 1, 'first spawn', 30000)
  await pause(1000)
  await c.evaluate('document.exitPointerLock()')
  await c.click(1203, 122)
  let s = await c.until((s) => state(s)?.buy && labels(s).includes('0 CANCEL'), 'BUY open')
  evidence.before = state(s)
  assert.equal(state(s).money, 16000)
  await pause(5500)
  await c.key('keyDown', ' ', 'Space', 32)
  await c.key('keyUp', ' ', 'Space', 32)
  s = await c.until((s) => state(s)?.spawns > evidence.before.spawns, 'resync response', 15000)
  await pause(500)
  s = await c.snapshot()
  evidence.resync = state(s)
  assert.equal(state(s).buy, true, 'resync keeps valid BUY open')
  assert.equal(state(s).locked, false, 'camera capture released after resync')
  assert.equal(await c.evaluate('document.pointerLockElement !== null'), false, 'browser pointer actually released')
  const k = 1.5,
    ox = 160
  await c.click(ox + 148 * k, (116 + 3 * 28 + 10) * k)
  await c.until((s) => labels(s).includes('3 M4A1'), 'rifle submenu')
  await c.click(ox + 148 * k, (116 + 2 * 28 + 10) * k)
  s = await c.until((s) => state(s)?.money === 12900, 'purchase after resync')
  evidence.purchased = state(s)
  const purchaseNotices = (s) => readTextEntities(s).filter((entry) => entry.UiText.value === 'Bought M4A1.')
  const checkNotice = (snapshot) => {
    const notices = purchaseNotices(snapshot)
    assert.equal(notices.length, 1, 'confirmation appears only once')
    const rect = notices[0].UiTransform
    assert.equal(rect.positionTop, 80 * k, 'confirmation is below the title')
    assert.ok(rect.positionTop + rect.height <= 116 * k, 'confirmation clears menu controls and money')
    return { top: rect.positionTop, height: rect.height, count: notices.length }
  }
  s = await c.until((s) => purchaseNotices(s).length > 0, 'purchase confirmation')
  evidence.submenuNotice = checkNotice(s)
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${dir}/purchase-after-resync.png`, Buffer.from(data, 'base64'))
  await c.click(ox + 148 * k, (116 + 6 * 28 + 10) * k)
  s = await c.until((s) => labels(s).includes('0 CANCEL'), 'back to categories')
  evidence.rootNotice = checkNotice(s)
  const rootCapture = await c.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${dir}/categories-notice.png`, Buffer.from(rootCapture.data, 'base64'))
  await c.click(ox + 148 * k, (116 + 8 * 28 + 10) * k)
  s = await c.until((s) => !state(s)?.buy, 'menu closed')
  assert.equal(purchaseNotices(s).length, 1, 'unexpired confirmation returns to the normal HUD')
  evidence.hudNotice = { count: purchaseNotices(s).length, buy: state(s).buy }
  await c.until((s) => purchaseNotices(s).length === 0, 'confirmation expires', 7000)
  evidence.noticeExpired = true
  await writeFile(`${dir}/browser.json`, JSON.stringify(evidence, null, 2) + '\n')
  console.log(
    'PASS: Header confirmations clear menu controls, return to the HUD and expire. BUY stayed open and pointer unlocked after a real resync; M4A1 purchase charged $3100 afterward.'
  )
} finally {
  c.socket.close()
}
