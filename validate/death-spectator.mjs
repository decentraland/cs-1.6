import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Client, pause, labels, readHud } from './team-client.mjs'
import { practiceButtonPoint } from './menu-layout.mjs'

const endpoint = process.argv[2]
const evidencePath = process.argv[3]
const extendedHitWindow = process.argv.includes('--extended-hit-window')
if (!endpoint) throw new Error('Usage: node validate/death-spectator.mjs <browser-CDP-websocket> [evidence.json]')

const client = new Client(endpoint)
const camera = state => state['2'].Transform.position
const cameraRotation = state => state['2'].Transform.rotation
const player = state => state['1'].Transform.position
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const spectatorLabel = state => labels(state).find(label => label.startsWith('Spectating: BOT '))
const botAvatars = state => Object.values(state).filter(component => component.AvatarShape?.name?.startsWith('BOT ') && component.Transform)
const painSprites = state => Object.values(state).filter(component => component.UiBackground?.texture?.tex?.texture?.src === 'assets/ui/pain.png')
const damageSound = state => Object.values(state).find(component => component.AudioSource?.audioClipUrl === 'assets/sounds/player/damage.wav')
const rotationDistance = (left, right) => 2 * Math.acos(Math.min(1, Math.abs(left.x * right.x + left.y * right.y + left.z * right.z + left.w * right.w)))
const cameraViewMeshes = state => {
  const entries = Object.entries(state)
  const descendants = new Set(['2'])
  for (let pass = 0; pass < 3; pass++) {
    for (const [id, component] of entries) {
      if (descendants.has(String(component.Transform?.parent))) descendants.add(id)
    }
  }
  return entries.filter(([id, component]) => descendants.has(id) && (component.MeshRenderer || component.GltfContainer)).map(([, component]) => component)
}

try {
  await client.connect()
  await client.command('/set_scene SDK7')
  await client.until(state => labels(state).includes('Select a team'), 'fresh team menu', 30000)
  await client.evaluate('document.exitPointerLock()')
  const [width, height] = await client.evaluate('[innerWidth,innerHeight]')
  const point = practiceButtonPoint(width, height)
  await client.click(point.x, point.y)
  const live = await client.until(state => labels(state).includes('Enemies left: 3') && !labels(state).includes('Prepare to fight!'), 'live solo round')
  await client.capture()
  const firstBot = botAvatars(live)[0]
  assert.ok(firstBot, 'live solo round renders a bot avatar')
  const staging = { x: firstBot.Transform.position.x + 3, y: firstBot.Transform.position.y, z: firstBot.Transform.position.z }
  await client.command(`/move_player_to ${staging.x} ${staging.y} ${staging.z}`)
  const exposed = await client.until(state => distance(player(state), staging) < 0.5, 'player reaches bot firing lane')
  const hit = await client.until(state => {
    const health = readHud(state)?.health
    return health !== undefined && health > 0 && health < 100 && painSprites(state).length > 0 && damageSound(state)
  }, 'bot hit produces a directional pain indicator and impact sound', 10000, 0)
  assert.ok(painSprites(hit).some(sprite => sprite.UiTransform?.width === 128 && sprite.UiTransform?.height === 48), 'front damage uses the original 128×48 pain frame')
  assert.ok(rotationDistance(cameraRotation(exposed), cameraRotation(hit)) > 0.001, 'damage hit jolts the camera immediately')
  if (evidencePath) {
    const capture = await client.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(dirname(evidencePath), 'damage-hit.png'), Buffer.from(capture.data, 'base64'))
  }
  const death = await client.until(state => readHud(state)?.health === 0, 'bot kills the player', 20000)
  const detectedAt = Date.now()
  const corpse = player(death)
  const initialCamera = camera(death)
  await pause(700)
  const fallen = await client.snapshot()
  assert.ok(camera(fallen).y < corpse.y + 1, 'death camera falls toward the body')
  assert.equal(spectatorLabel(fallen), undefined, 'chase waits for the death transition')
  const chase = await client.until(state => {
    if (!spectatorLabel(state)) return false
    return botAvatars(state).some(bot => distance(camera(state), { ...bot.Transform.position, y: bot.Transform.position.y + 1.6 }) < 3.2)
  }, 'camera chases a living bot after death', 4500)
  const firstTarget = spectatorLabel(chase)
  const handoffMs = Date.now() - detectedAt
  assert.ok(handoffMs >= 2300, 'observer handoff preserves the three-second death window')
  const hiddenViewMeshes = cameraViewMeshes(chase)
  assert.ok(hiddenViewMeshes.length >= 4, 'first-person view meshes are present for the visibility check')
  assert.ok(hiddenViewMeshes.every(component => component.VisibilityComponent?.visible === false), 'spectating hides every first-person weapon mesh')
  const ammo = readHud(chase).clip
  await client.shoot(70)
  const cycled = await client.until(state => spectatorLabel(state) !== undefined && spectatorLabel(state) !== firstTarget, 'click cycles to another bot')
  assert.equal(readHud(cycled).clip, ammo, 'spectator click does not consume ammunition')
  if (evidencePath) {
    const capture = await client.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(dirname(evidencePath), 'death-spectator.png'), Buffer.from(capture.data, 'base64'))
    await writeFile(evidencePath, JSON.stringify({
      date: new Date().toISOString(),
      fixture: extendedHitWindow ? 'Isolated bot fire interval extended to 500 ms for frame-level pain sprite capture' : undefined,
      handoffMs,
      corpse,
      initialCamera,
      fallenCamera: camera(fallen),
      firstTarget,
      cycledTarget: spectatorLabel(cycled),
      hitHealth: readHud(hit)?.health,
      hitCameraRadians: rotationDistance(cameraRotation(exposed), cameraRotation(hit)),
      checks: ['directional CS pain sprite', 'impact sound', 'hitgroup and armor-dependent camera punch', 'camera fall and 80-degree roll rules', 'three-second observer handoff', 'hidden first-person weapon meshes', 'living bot chase', 'click-to-cycle without firing']
    }, null, 2) + '\n')
  }
  console.log('PASS: hit feedback → death transition → living bot chase → click cycles without firing')
} finally {
  if (client.sessionId) await client.evaluate('document.exitPointerLock()').catch(error => console.warn(error.message))
  client.socket.close()
}
