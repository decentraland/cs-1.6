import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const destination = process.argv[2] && resolve(process.argv[2])
assert.ok(destination, 'Pass a fresh isolated directory')
execFileSync(process.execPath, [fileURLToPath(new URL('./prepare-c4.mjs', import.meta.url)), destination, 'defuse'], {
  stdio: 'inherit'
})
async function edit(file, from, to) {
  const path = resolve(destination, 'src', file),
    text = await readFile(path, 'utf8')
  assert.ok(text.includes(from), file + ': fixture anchor')
  await writeFile(path, text.replace(from, to))
}
await edit('buy-client.ts', 'let sequence = 0', 'let sequence = 0\nlet firstReviewCapture = true')
await edit(
  'buy-client.ts',
  '  PointerLock.create(request, { isPointerLocked: true })',
  `  if (firstReviewCapture) {
    firstReviewCapture = false
    delay(800, () => PointerLock.create(request, { isPointerLocked: true }))
  } else PointerLock.create(request, { isPointerLocked: true })`
)
await edit('c4-review.ts', 'engine, TextShape, Transform', 'engine, TextShape, Transform, inputSystem, InputAction')
await edit(
  'c4-review.ts',
  'import { getC4Animation }',
  "import { isFireInputReady } from './client'\nimport { getC4Animation }"
)
await edit(
  'c4-review.ts',
  'inventory: PlayerInventory.getOrNull(entity)',
  'input: { ready: isFireInputReady(), pointer: inputSystem.isPressed(InputAction.IA_POINTER), use: inputSystem.isPressed(InputAction.IA_PRIMARY) }, inventory: PlayerInventory.getOrNull(entity)'
)
console.log(
  'Input fixture: the first buy-menu capture is requested 800 ms later so the click is released first. Read-only input diagnostics; production firing, menus and C4 rules.'
)
