import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { defineTransformComponent } from '@dcl/ecs/dist-cjs/components/manual/Transform.js'
import { defineVirtualCameraComponent } from '@dcl/ecs/dist-cjs/components/extended/VirtualCamera.js'
import { Engine } from '@dcl/ecs/dist-cjs/engine/index.js'
import * as components from '@dcl/ecs/dist-cjs/components/generated/index.gen.js'

const build = (file, external) =>
  buildSync({
    entryPoints: [`src/${file}.ts`],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    alias: { '@dcl/sdk/math': '@dcl/ecs-math' },
    external: ['@dcl/sdk/ecs', ...external]
  }).outputFiles[0].text
const viewCode = build('weapon-view', ['./bomb-client', './components', './fps-camera', './weapon-sounds'])
const cameraCode = build('fps-camera', ['./world-query', './platform'])

function fixture() {
  let now = 10
  const engine = Engine()
  const ecs = { engine, Transform: defineTransformComponent(engine), CameraType: { CT_FIRST_PERSON: 1 } }
  for (const name of [
    'Animator',
    'VisibilityComponent',
    'CameraModeArea',
    'GltfContainer',
    'MainCamera',
    'VirtualCamera'
  ])
    ecs[name] = components[name](engine)
  ecs.VirtualCamera = defineVirtualCameraComponent(engine)
  ecs.Transform.create(engine.PlayerEntity, { position: { x: 95, y: 10.026, z: 52 } })
  ecs.Transform.create(engine.CameraEntity, { position: { x: 95, y: 11.626, z: 52 } })
  const weapon = { name: 'Dual Elites', revision: 1, mode: 1, isReloading: false, ammoClip: 30 }
  const modules = {
    '@dcl/sdk/ecs': ecs,
    './components': { Weapon: { getOrNull: () => weapon }, Dead: { has: () => false } },
    './bomb-client': { hasBombSelected: () => false },
    './weapon-sounds': { playModelSound() {}, playLocalSound() {} },
    './world-query': { mapDistance: () => 0 },
    './platform': { isTouchPlatform: () => false }
  }
  const evaluate = (code) => {
    const module = { exports: {} }
    runInNewContext(code, {
      module,
      Date: { now: () => now * 1000 },
      require: (name) => {
        assert.ok(name in modules, name)
        return modules[name]
      }
    })
    return module.exports
  }
  const camera = evaluate(cameraCode)
  modules['./fps-camera'] = camera
  const view = evaluate(viewCode)
  camera.resetFpsCamera(1, -Math.PI / 2, 1234)
  camera.syncCameraWeapon('elite', 1, 1)
  view.updateWeaponView(512)
  const clip = () => {
    const [[entity]] = [...engine.getEntitiesWith(ecs.GltfContainer)]
    return ecs.Animator.get(entity).states.find((state) => state.playing).clip
  }
  return {
    camera,
    view,
    weapon,
    clip,
    at: (value) => {
      now = value
    }
  }
}

test('production camera rays and SDK Animator use the same predicted Elite hand and shot interval', () => {
  const f = fixture()
  const first = f.camera.predictCameraKick(1, 0, undefined, 1)
  assert.ok(Math.abs(first.origin.z - 51.875) < 1e-6)
  f.view.predictWeaponShot(29, -1, 1)
  assert.equal(f.clip(), 'fixed_v_elite shoot_left5')
  f.at(10.1)
  const second = f.camera.predictCameraKick(2, 0, undefined, 0)
  assert.ok(Math.abs(second.origin.z - 52.125) < 1e-6)
  f.view.predictWeaponShot(28, -1, 0)
  assert.equal(f.clip(), 'fixed_v_elite shoot_right1')
  f.at(10.55)
  f.view.predictWeaponShot(1, -1, 1)
  assert.equal(f.clip(), 'fixed_v_elite shoot_left4', 'one remaining round is not the empty animation')
  f.at(10.7)
  f.view.predictWeaponShot(0, -1, 0)
  assert.equal(f.clip(), 'fixed_v_elite shoot_rightlast')
})

test('Elite idle holds the source left-empty pose when one round remains', () => {
  const f = fixture()
  f.weapon.ammoClip = 1
  f.view.predictWeaponShot(1, -1, 1)
  f.at(13)
  f.view.updateWeaponView(512)
  assert.equal(f.clip(), 'fixed_v_elite idle_leftempty')
})
