import { readFileSync } from 'node:fs'
const atlas = JSON.parse(readFileSync(new URL('../src/score-font.json', import.meta.url), 'utf8'))
const glyphs = new Map(Object.values(atlas.fonts).flatMap(font => Object.entries(font.glyphs).map(([character, rect]) => [rect.slice(0, 4).join(','), character])))

export function readTextEntities(state) {
  const result = Object.values(state).filter(value => value.UiText)
  const groups = new Map()
  for (const value of Object.values(state)) {
    const uv = value.UiBackground?.uvs, transform = value.UiTransform
    if (!transform || uv?.length !== 8) continue
    const rect = [Math.round(uv[0] * atlas.width), Math.round((1 - uv[3]) * atlas.height), Math.round((uv[4] - uv[0]) * atlas.width), Math.round((uv[3] - uv[1]) * atlas.height)]
    const character = glyphs.get(rect.join(','))
    if (character === undefined) continue
    const group = groups.get(transform.parent) ?? []
    group.push({ character, left: transform.positionLeft }); groups.set(transform.parent, group)
  }
  for (const [parent, glyphs] of groups) result.push({ UiText: { value: glyphs.sort((a, b) => a.left - b.left).map(glyph => glyph.character).join('') }, UiTransform: state[parent].UiTransform })
  return result
}

export function readTeamScore(state, team) {
  const name = team === 1 ? 'Terrorists' : 'Counter-Terrorists'
  const text = readTextEntities(state)
  const header = text.find(value => value.UiText.value.startsWith(name + '   -   '))
  if (!header) return undefined
  const score = text.find(value => value.UiTransform?.parent === header.UiTransform.parent && /^\d+$/.test(value.UiText.value))
  return score ? Number(score.UiText.value) : undefined
}

export function readScoreRows(state) {
  const groups = new Map()
  for (const text of readTextEntities(state)) {
    if (!text.UiTransform) continue
    const parent = text.UiTransform.parent, group = groups.get(parent) ?? []
    group.push(text); groups.set(parent, group)
  }
  return [...groups].map(([id, cells]) => ({ id, top: state[id]?.UiTransform?.positionTop ?? 0, values: cells.sort((a,b) => a.UiTransform.positionLeft - b.UiTransform.positionLeft).map(cell => cell.UiText.value) })).sort((a,b) => a.top - b.top)
}
