import { buildSync } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { Engine, createInputSystem } from '@dcl/ecs/dist-cjs/engine/index.js'
import { createPointerEventsSystem } from '@dcl/ecs/dist-cjs/systems/events.js'
import { PointerEventsResult } from '@dcl/ecs/dist-cjs/components/generated/index.gen.js'
import {
  InputAction,
  PointerEventType
} from '@dcl/ecs/dist-cjs/components/generated/pb/decentraland/sdk/components/common/input_action.gen.js'

export { InputAction, PointerEventType }
const output = buildSync({
  entryPoints: ['src/combat-input.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  write: false,
  external: ['@dcl/sdk/ecs', './platform']
}).outputFiles[0].text

export function nativeInput() {
  const engine = Engine(),
    events = PointerEventsResult(engine),
    sdk = createInputSystem(engine),
    pointerEvents = createPointerEventsSystem(engine, sdk)
  const state = { mobile: true }
  const module = { exports: {} }
  runInNewContext(output, {
    module,
    require: (name) => {
      if (name === '@dcl/sdk/ecs')
        return { engine, PointerEventsResult: events, inputSystem: sdk, InputAction, PointerEventType }
      if (name === './platform') return { isTouchPlatform: () => state.mobile }
      throw new Error('Unexpected native input dependency: ' + name)
    }
  })
  const controls = {
    isCombatInputPressed: sdk.isPressed,
    isCombatInputTriggered: sdk.isTriggered,
    ...module.exports
  }
  controls.initializeCombatInput()
  const ui = engine.addEntity()
  return {
    state,
    engine,
    sdk,
    pointerEvents,
    controls,
    events,
    ui,
    add(entity, action, down, timestamp) {
      events.addValue(entity, {
        button: action,
        state: down ? PointerEventType.PET_DOWN : PointerEventType.PET_UP,
        timestamp,
        tickNumber: timestamp
      })
    },
    frame: () => engine.update(0.016)
  }
}
