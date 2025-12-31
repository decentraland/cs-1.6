// Delay system for scheduling callbacks without setTimeout
type DelayedCallback = {
  executeAt: number
  callback: () => void
}

const delayedCallbacks: DelayedCallback[] = []

export function delay(milliseconds: number, callback: () => void) {
  const executeAt = Date.now() + milliseconds
  delayedCallbacks.push({ executeAt, callback })
}

export function delaySystem() {
  const now = Date.now()

  // Find callbacks that should execute now
  for (let i = delayedCallbacks.length - 1; i >= 0; i--) {
    if (delayedCallbacks[i].executeAt <= now) {
      const { callback } = delayedCallbacks[i]
      delayedCallbacks.splice(i, 1)
      callback()
    }
  }
}
