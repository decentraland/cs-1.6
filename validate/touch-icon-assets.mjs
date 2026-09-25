import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const png = await readFile(new URL('../assets/ui/touch-controls.png', import.meta.url))
const svg = await readFile(new URL('../asset-sources/touch-controls/icons.svg', import.meta.url), 'utf8')
assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a')
assert.equal(png.readUInt32BE(16), 1024)
assert.equal(png.readUInt32BE(20), 384)
assert.equal(png[25], 6, 'RGBA keeps icon backgrounds transparent')
assert.equal(
  createHash('sha256').update(png).digest('hex'),
  '20dce9451df16a140b1b90db1afa7d518271f9c78306e3b4990e838b1b22ea8d'
)
assert.equal([...svg.matchAll(/<g id=/g)].length, 24)
console.log('PASS: 24 original mobile control icons, transparent atlas and editable SVG')

for (const name of [
  'fire',
  'reload',
  'jump',
  'walk',
  'run',
  'zoom',
  'burst',
  'single',
  'auto',
  'silencer',
  'knife',
  'grenade',
  'bomb'
]) {
  const icon = await readFile(new URL(`../assets/ui/touch/${name}.png`, import.meta.url))
  assert.equal(icon.toString('hex', 0, 8), '89504e470d0a1a0a', name)
  assert.equal(icon.readUInt32BE(16), 128, name)
  assert.equal(icon.readUInt32BE(20), 128, name)
  assert.equal(icon[25], 6, `${name}: transparent RGBA`)
}
console.log('PASS: 13 standalone native gamepad icons')
