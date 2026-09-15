import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { Client, pause, labels, readHud } from './team-client.mjs'
const [ct, other, returning] = process.argv.slice(2, 5).map((endpoint) => new Client(endpoint))
let suspended = false
const evidence = { date: new Date().toISOString() }
function scoreRows(s) {
  const groups = new Map()
  for (const [id, c] of Object.entries(s)) {
    if (!c.UiText || !c.UiTransform) continue
    const parent = c.UiTransform.parent
    if (!groups.has(parent)) groups.set(parent, [])
    groups.get(parent).push({ id: Number(id), previous: c.UiTransform.rightOf ?? 0, value: c.UiText.value })
  }
  return [...groups.values()]
    .filter((row) => row.length === 4 && row.some((c) => c.value.startsWith('0x')))
    .map((row) => {
      const values = []
      let previous = 0
      while (values.length < row.length) {
        const c = row.find((c) => c.previous === previous)
        assert.ok(c, 'scoreboard row order')
        values.push(c.value)
        previous = c.id
      }
      return values
    })
}

try {
  await Promise.all([ct.connect(), other.connect(), returning.connect()])
  await ct.until((s) => readHud(s)?.seconds > 40 && !labels(s).includes('Prepare to fight!'), 'live round', 130000)
  const before = await returning.scoreboard()
  evidence.before = scoreRows(before)
  await returning.send('Page.setWebLifecycleState', { state: 'frozen' })
  suspended = true
  await pause(23000)
  await returning.send('Page.setWebLifecycleState', { state: 'active' })
  suspended = false
  await returning.send('Page.bringToFront')
  await returning.until((s) => labels(s).includes('Select a team'), 'heartbeat-expired player must rejoin', 15000)
  await returning.join(1, false)
  await returning.until((s) => labels(s).includes('Waiting for the next round'), 'same client cannot resurrect', 10000)
  assert.equal(readHud(await returning.snapshot()).health, 0)
  evidence.after = scoreRows(await returning.scoreboard())
  assert.equal(evidence.before.length, 3, 'three scoreboard rows were captured')
  const names = evidence.before.map((row) => row.find((v) => v.startsWith('0x'))).sort()
  assert.deepEqual(
    evidence.after.map((row) => row.find((v) => v.startsWith('0x'))).sort(),
    names,
    'same player addresses remain on scoreboard'
  )
  const localName = `${before['1'].PlayerIdentityData.address.slice(0, 10)}...`
  const beforeRow = evidence.before.find((row) => row[0] === localName)
  const afterRow = evidence.after.find((row) => row[0] === localName)
  assert.ok(beforeRow && afterRow, 'returning player has a scoreboard row')
  assert.equal(afterRow[2], beforeRow[2], 'kills survive heartbeat expiry')
  assert.equal(Number(afterRow[3]), Number(beforeRow[3]) + 1, 'live disconnect adds exactly one death')
  evidence.sameAddresses = names
  await ct.command('/move_player_to 95 10.1 52')
  await other.command('/move_player_to 90 10.1 52')
  await pause(2000)
  await ct.capture()
  const feet = (await other.snapshot())['1'].Transform.position
  await ct.aimAt({ x: feet.x, y: feet.y + 1.6, z: feet.z })
  for (let i = 0; i < 5; i++) {
    await ct.shoot()
    await pause(450)
    if (readHud(await other.snapshot()).health === 0) break
  }
  await returning.until(
    (s) => labels(s).includes('Counter-Terrorists Win!'),
    'queued returning player cannot prevent elimination'
  )
  await returning.until(
    (s) => labels(s).includes('Prepare to fight!') && readHud(s)?.health === 100,
    'same player respawns next round',
    8000
  )
  evidence.checks = [
    'same-session heartbeat expiry',
    'same addresses retained',
    'rejoin stays dead',
    'next-round spawn'
  ]
  if (process.argv[5]) await writeFile(process.argv[5], JSON.stringify(evidence, null, 2) + '\n')
  console.log('PASS', JSON.stringify(evidence))
} finally {
  if (suspended) await returning.send('Page.setWebLifecycleState', { state: 'active' })
  for (const client of [ct, other, returning]) {
    if (client.sessionId)
      await client.evaluate('document.exitPointerLock()').catch((error) => console.warn(error.message))
    client.socket.close()
  }
}
