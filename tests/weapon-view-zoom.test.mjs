import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { defineTransformComponent } from '@dcl/ecs/dist-cjs/components/manual/Transform.js'
import { Engine } from '@dcl/ecs/dist-cjs/engine/index.js'
import * as components from '@dcl/ecs/dist-cjs/components/generated/index.gen.js'

const source = buildSync({
  entryPoints: ['src/weapon-view.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  write: false,
  alias: { '@dcl/sdk/math': '@dcl/ecs-math' },
  external: ['@dcl/sdk/*', './bomb-client', './components', './fps-camera', './weapon-sounds']
}).outputFiles[0].text

function fixture(name) {
  const engine = Engine()
  const ecs = { engine, Transform: defineTransformComponent(engine), CameraType: { CT_FIRST_PERSON: 1 } }
  for (const name of ['Animator', 'VisibilityComponent', 'CameraModeArea', 'GltfContainer'])
    ecs[name] = components[name](engine)
  const state = { zoom: 90, dead: false, bomb: false }
  const weapon = { name, revision: 1, mode: 0, isReloading: false, ammoClip: 30 }
  const modules = {
    '@dcl/sdk/ecs': ecs,
    './components': { Weapon: { getOrNull: () => weapon }, Dead: { has: () => state.dead } },
    './fps-camera': {
      getCameraZoom: () => state.zoom,
      getViewPunch: () => ({ pitch: 0, yaw: 0 }),
      getPainPunch: () => ({ pitch: 0, roll: 0 })
    },
    './bomb-client': {
      hasBombSelected: () => state.bomb,
      getC4Animation: () => ({ serial: 1, clip: 'idle1' })
    },
    './weapon-sounds': { playModelSound() {} }
  }
  const module = { exports: {} }
  runInNewContext(source, {
    module,
    Date: { now: () => 10000 },
    require: (name) => {
      assert.ok(name in modules, name)
      return modules[name]
    }
  })
  const view = module.exports
  const update = () => view.updateWeaponView(512)
  const models = () => [...engine.getEntitiesWith(ecs.GltfContainer, ecs.VisibilityComponent)]
  return { ecs, state, weapon, view, update, models }
}

test('AUG and SG552 keep their real view entities and firing animations visible at 55-degree zoom', () => {
  for (const name of ['AUG', 'SG552']) {
    const f = fixture(name)
    for (const zoom of [90, 55, 90, 55]) {
      f.state.zoom = zoom
      f.update()
      const [[entity, gltf, visibility]] = f.models()
      assert.ok(gltf.src.endsWith(`${name.toLowerCase()}-view.glb`))
      assert.equal(visibility.visible, true, `${name} FOV ${zoom}`)
      f.view.predictWeaponShot(29)
      assert.ok(f.ecs.Animator.get(entity).states.some((clip) => clip.playing && clip.clip.includes('shoot')))
    }
  }
})

test('sniper viewmodels hide at each scope level and return during bolt unscope or manual unzoom', () => {
  for (const [name, levels] of [
    ['AWP', [40, 10]],
    ['Scout', [40, 15]],
    ['G3SG1', [40, 15]],
    ['SG550', [40, 15]]
  ]) {
    const f = fixture(name)
    for (const zoom of [90, ...levels, 90, ...levels, 90]) {
      f.state.zoom = zoom
      f.update()
      assert.equal(f.models()[0][2].visible, zoom === 90, `${name} FOV ${zoom}`)
    }
  }
})

test('zoom visibility never exposes a cached inactive weapon or the dead player viewmodel', () => {
  const f = fixture('AUG')
  f.update()
  f.state.zoom = 55
  f.update()
  f.weapon.name = 'SG552'
  f.weapon.revision++
  f.update()
  const visible = () => f.models().filter(([, , visibility]) => visibility.visible)
  assert.equal(visible().length, 1)
  assert.ok(visible()[0][1].src.endsWith('sg552-view.glb'))
  f.state.dead = true
  f.update()
  assert.equal(visible().length, 0)
})
