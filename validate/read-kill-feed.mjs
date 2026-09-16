import { DEATH_ICONS } from '../src/death-icons.ts'
import { readTextEntities } from './read-scoreboard.mjs'

export function readKillFeed(state) {
  const rows = new Map()
  for (const value of Object.values(state)) {
    const texture = value.UiBackground?.texture?.tex?.texture?.src
    const uv = value.UiBackground?.uvs,
      transform = value.UiTransform
    if (!texture?.startsWith('assets/ui/death-') || !uv || !transform) continue
    const rect = [
      Math.round(uv[0] * 256),
      Math.round((1 - uv[3]) * 256),
      Math.round((uv[4] - uv[0]) * 256),
      Math.round((uv[3] - uv[1]) * 256)
    ]
    const key = Object.entries(DEATH_ICONS).find(
      ([, icon]) => texture === `assets/ui/death-${icon.sprite}.png` && icon.rect.every((v, i) => v === rect[i])
    )?.[0]
    if (!key) continue
    const row = rows.get(transform.parent) ?? { icons: [] }
    row.icons.push(key)
    rows.set(transform.parent, row)
  }
  const texts = readTextEntities(state)
  return [...rows]
    .map(([parent, row]) => {
      const names = texts
        .filter((text) => text.UiTransform?.parent === parent)
        .sort((a, b) => a.UiTransform.positionLeft - b.UiTransform.positionLeft)
        .map((text) => text.UiText.value)
      return {
        icon: row.icons.find((key) => key !== 'headshot'),
        headshot: row.icons.includes('headshot'),
        killer: names.length > 1 ? names[0] : '',
        victim: names[names.length - 1],
        top: state[parent]?.UiTransform.positionTop
      }
    })
    .sort((a, b) => a.top - b.top)
}
