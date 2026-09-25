const { readFileSync, mkdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Resvg } = require('@resvg/resvg-js')

const svg = readFileSync(resolve(__dirname, 'icons.svg'), 'utf8')
const output = resolve(__dirname, '../../assets/ui/touch')
const names = new Set([
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
])
mkdirSync(output, { recursive: true })
for (const [group, name] of svg.matchAll(/<g id="([^"]+)"[^>]*>[\s\S]*?<\/g>/g)) {
  if (!names.has(name)) continue
  const glyph = group.replace(/ transform="[^"]*"/, '')
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 64 64">${glyph}</svg>`
  writeFileSync(resolve(output, `${name}.png`), new Resvg(source).render().asPng())
}
console.log(`Rendered ${names.size} native touch icons`)
