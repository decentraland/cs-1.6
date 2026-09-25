import assert from 'node:assert/strict'
import { test } from 'node:test'
import { humanServer } from './helpers/human-server.mjs'

function rifle() {
  const game = humanServer()
  const shooter = game.addPlayer('shooter', 2, { x: 95, y: 10.026, z: 52 })
  Object.assign(shooter.weapon(), { name: 'M4A1', fireRate: 0.0875 })
  return { game, shooter }
}

test('the real server preserves all eight M4 shots from the captured touch FIRE trace', () => {
  const { game, shooter } = rifle()
  const epoch = 1790047627.051
  const arrivals = [0, 0.068, 0.133, 0.239, 0.339, 0.434, 0.506, 0.597]
  const ticks = [0, 0.105, 0.197, 0.27, 0.367, 0.472, 0.539, 0.638]
  let previous = 0
  for (let i = 0; i < arrivals.length; i++) {
    game.at(epoch + arrivals[i])
    game.shoot('shooter', { shotId: i + 1 })
    assert.equal(shooter.weapon().ammoClip, i ? 30 - i : 29, 'queued shots spend no ammo before their deadline')
    game.tick(epoch + ticks[i])
    const weapon = shooter.weapon()
    assert.equal(weapon.lastFiredShotId, i + 1)
    assert.equal(weapon.ammoClip, 29 - i)
    assert.ok(weapon.lastShotTime <= epoch + ticks[i])
    if (i) assert.ok(Math.abs(weapon.lastShotTime - previous - 0.0875) < 1e-6)
    previous = weapon.lastShotTime
  }
  assert.equal(game.sent.filter((event) => event.type === 'shotRejected').length, 0)
  game.tick(epoch + 2)
  assert.equal(shooter.weapon().ammoClip, 22, 'no additional shots without requests')
})

test('early and overlapping requests report distinct reasons without spending extra ammo', () => {
  const { game, shooter } = rifle()
  game.at(10)
  game.shoot('shooter')
  game.at(10.01)
  game.shoot('shooter', { shotId: 2 })
  game.at(10.06)
  game.shoot('shooter', { shotId: 3 })
  game.at(10.07)
  game.shoot('shooter', { shotId: 4 })
  assert.equal(shooter.weapon().ammoClip, 29)
  assert.deepEqual(
    game.sent.filter((event) => event.type === 'shotRejected').map((event) => event.data.shotId),
    [2, 4]
  )
  assert.ok(game.logs.includes('[SERVER] Shot rejected: 2 cadence'))
  assert.ok(game.logs.includes('[SERVER] Shot rejected: 4 pending'))
  game.tick(10.1)
  assert.equal(shooter.weapon().ammoClip, 28)
  assert.equal(shooter.weapon().lastFiredShotId, 3)
})

test('a queued shot reports a death rejection once and leaves ammunition unchanged', () => {
  const { game, shooter } = rifle()
  game.at(10)
  game.shoot('shooter')
  game.at(10.06)
  game.shoot('shooter', { shotId: 2 })
  shooter.health().current = 0
  game.tick(10.1)
  assert.equal(shooter.weapon().ammoClip, 29)
  assert.deepEqual(
    game.logs.filter((line) => line.startsWith('[SERVER] Shot rejected:')),
    ['[SERVER] Shot rejected: 2 dead']
  )
})
