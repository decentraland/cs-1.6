import { engine, InputAction, inputSystem, PointerEventsResult, PointerEventType } from '@dcl/sdk/ecs'
import { isTouchPlatform } from './platform'

let lastRootTimestamp = -1
const actions = new Map<number, { timestamp: number; state: number }>()
const transitions: { button: number; state: number }[] = []
const touchPresses = new Map<string, readonly InputAction[]>()
const suppressedNativeActions = new Set<InputAction>()
const touchTransitions: { button: number; state: number }[] = []
let touchContext = ''

export function isTouchControlPressed(id: string) {
  return touchPresses.has(id)
}

export function setTouchControlPressed(id: string, buttons: readonly InputAction[], pressed: boolean) {
  if (!isTouchPlatform()) return
  if (!pressed && !touchPresses.has(id)) return
  const before = buttons.map((button) => isCombatInputPressed(button))
  for (const button of buttons) {
    if (pressed || actions.get(button)?.state === PointerEventType.PET_DOWN) suppressedNativeActions.add(button)
  }
  if (pressed) touchPresses.set(id, buttons)
  else touchPresses.delete(id)
  buttons.forEach((button, index) => {
    const held = isCombatInputPressed(button)
    if (held !== before[index])
      touchTransitions.push({ button, state: held ? PointerEventType.PET_DOWN : PointerEventType.PET_UP })
  })
}

export function cancelTouchAction(button: InputAction) {
  if (!isTouchPlatform()) return
  const held = isCombatInputPressed(button)
  for (const [id, buttons] of touchPresses) if (buttons.includes(button)) touchPresses.delete(id)
  if (actions.get(button)?.state === PointerEventType.PET_DOWN) suppressedNativeActions.add(button)
  for (const events of [transitions, touchTransitions])
    for (let i = events.length - 1; i >= 0; i--) if (events[i].button === button) events.splice(i, 1)
  if (held) touchTransitions.push({ button, state: PointerEventType.PET_UP })
}

export function updateTouchControlContext(context: string) {
  if (context === touchContext) return
  touchContext = context
  touchPresses.clear()
  transitions.length = 0
  touchTransitions.length = 0
  for (const button of [
    InputAction.IA_ACTION_3,
    InputAction.IA_ACTION_4,
    InputAction.IA_ACTION_6,
    InputAction.IA_SECONDARY,
    InputAction.IA_PRIMARY,
    InputAction.IA_MODIFIER
  ]) {
    const previous = actions.get(button)
    if (previous?.state === PointerEventType.PET_DOWN) suppressedNativeActions.add(button)
    if (previous) actions.set(button, { ...previous, state: PointerEventType.PET_UP })
  }
}

export function fireInputAction() {
  // UI taps also emit IA_POINTER; a dedicated touch action prevents accidental shots.
  return isTouchPlatform() ? InputAction.IA_ACTION_6 : InputAction.IA_POINTER
}

export function initializeCombatInput() {
  // Read callback edges after the SDK pointer system, before gameplay systems.
  engine.addSystem(combatInputSystem)
}

export function combatInputSystem() {
  transitions.length = 0
  const touch = isTouchPlatform()
  if (touch) transitions.push(...touchTransitions)
  touchTransitions.length = 0
  if (!PointerEventsResult.has(engine.RootEntity)) {
    actions.clear()
    return
  }
  let newest = lastRootTimestamp
  // SDK 7.27 can skip a native action after scanning another entity's UI pointer event.
  for (const command of PointerEventsResult.get(engine.RootEntity)) {
    if (command.timestamp <= lastRootTimestamp) continue
    newest = Math.max(newest, command.timestamp)
    if (command.state !== PointerEventType.PET_DOWN && command.state !== PointerEventType.PET_UP) continue
    if (!touch) {
      transitions.push(command)
      continue
    }
    const previous = actions.get(command.button)
    if (previous && command.timestamp < previous.timestamp) continue
    const held = isCombatInputPressed(command.button)
    actions.set(command.button, command)
    // A native release ends suppression for this gesture, not every future press.
    if (command.state === PointerEventType.PET_UP) suppressedNativeActions.delete(command.button)
    if (held !== isCombatInputPressed(command.button)) transitions.push(command)
  }
  lastRootTimestamp = newest
}

export function isCombatInputPressed(action: InputAction) {
  if (!isTouchPlatform()) return inputSystem.isPressed(action)
  if (Array.from(touchPresses.values()).some((buttons) => buttons.includes(action))) return true
  return !suppressedNativeActions.has(action) && actions.get(action)?.state === PointerEventType.PET_DOWN
}

export function isCombatInputTriggered(action: InputAction, event: PointerEventType) {
  return (
    transitions.some((command) => command.button === action && command.state === event) ||
    (!isTouchPlatform() && inputSystem.isTriggered(action, event))
  )
}
