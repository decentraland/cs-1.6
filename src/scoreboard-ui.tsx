import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { engine } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import { myProfile } from '@dcl/sdk/network'
import { Bot, Dead, MatchLeaderboard, PlayerAddress, PlayerStats } from './components'
import { getPractice } from './practice'
import { getBomb } from './bomb'
import { rankScores } from './scoreboard'
import { BitmapText, scoreFontSize } from './bitmap-text'

const amber = Color4.create(1, 176 / 255, 0, 1)
const colors = [Color4.create(1, 64 / 255, 64 / 255, 1), Color4.create(153 / 255, 204 / 255, 1, 1)]
interface Row { name: string; status: string; kills: string; deaths: string; latency: string; color: Color4; header?: boolean; local?: boolean }

export function Scoreboard({ width, height }: { width: number; height: number }) {
  const match = getPractice(), local = myProfile.userId?.toLowerCase() ?? ''
  const names = new Map(Array.from(engine.getEntitiesWith(MatchLeaderboard)).flatMap(([, board]) => board.players.map(player => [player.address, player.name] as const)))
  const stats = Array.from(engine.getEntitiesWith(PlayerAddress, PlayerStats))
  const localTeam = match?.roster.find(seat => seat.address === local && seat.connected)?.team
  const bots = Array.from(engine.getEntitiesWith(Bot)).map(([, bot]) => bot)
  const rows: Row[] = []
  for (const team of [1, 2]) {
    const color = colors[team - 1]
    const members = match?.mode === 'teams'
      ? stats.filter(([, identity]) => match.roster.some(seat => seat.connected && seat.team === team && seat.address === identity.address)).map(([entity, identity, score]) => ({ ...score, address: identity.address, name: names.get(identity.address) ?? identity.address.slice(0, 10) + '...', dead: Dead.has(entity), bot: false }))
      : team === 1 ? bots.map(bot => ({ address: `bot:${bot.index}`, name: ['Guerilla', 'Phoenix', 'Arctic'][bot.index], kills: match?.botKills[bot.index] ?? 0, deaths: match?.botDeaths[bot.index] ?? 0, dead: !bot.alive, bot: true }))
        : stats.filter(([, identity]) => identity.address === match?.owner).map(([entity, identity, score]) => ({ ...score, address: identity.address, name: names.get(identity.address) ?? identity.address.slice(0, 10) + '...', dead: Dead.has(entity), bot: false }))
    rows.push({ name: `${team === 1 ? 'Terrorists' : 'Counter-Terrorists'}   -   ${members.length} ${members.length === 1 ? 'player' : 'players'}`, status: '', kills: String(team === 1 ? match?.tScore ?? 0 : match?.ctScore ?? 0), deaths: '', latency: '-', color, header: true })
    for (const member of rankScores(members)) rows.push({ name: member.name, status: member.dead ? 'Dead' : localTeam === team && getBomb()?.carrier === member.address ? 'Bomb' : '', kills: String(member.kills), deaths: String(member.deaths), latency: member.bot ? 'BOT' : '-', color, local: member.address === local })
  }
  const scale = Math.min(width / 640, height / 480), boardWidth = 520 * scale, boardHeight = 340 * scale
  const rowHeight = 13 * scale, fontSize = scoreFontSize(height)
  let y = 24 * scale
  return <UiEntity uiTransform={{ positionType: 'absolute', position: { left: (width - boardWidth) / 2, top: 48 * scale }, width: boardWidth, height: boardHeight, borderRadius: 4 * scale, borderWidth: 1, borderColor: Color4.create(188 / 255, 112 / 255, 0, .5), pointerFilter: 'none' }} uiBackground={{ color: Color4.create(0, 0, 0, 128 / 255) }}>
    <ScoreRow row={{ name: 'Counter-Strike 1.6 - de_dust2', status: '', kills: 'Score', deaths: 'Deaths', latency: 'Latency', color: amber }} top={2 * scale} width={boardWidth} height={20 * scale} size={fontSize} scale={scale} />
    <UiEntity uiTransform={{ positionType: 'absolute', position: { left: 4 * scale, top: 22 * scale }, width: boardWidth - 8 * scale, height: 1, pointerFilter: 'none' }} uiBackground={{ color: Color4.create(188 / 255, 112 / 255, 0, .5) }} />
    {rows.map((row, index) => {
      if (row.header && index > 0) y += 8 * scale
      const top = y; y += rowHeight
      return <ScoreRow key={String(index)} row={row} top={top} width={boardWidth} height={rowHeight} size={fontSize} scale={scale} />
    })}
  </UiEntity>
}

function ScoreRow(props: { key?: string; row: Row; top: number; width: number; height: number; size: number; scale: number }) {
  const { row, scale } = props, width = props.width - 12 * scale
  const edges = [0, .50, .64, .73, .84, 1]
  return <UiEntity uiTransform={{ positionType: 'absolute', position: { left: 6 * scale, top: props.top }, width, height: props.height, pointerFilter: 'none' }} uiBackground={{ color: Color4.create(1, 1, 1, row.local ? 16 / 255 : 0) }}>
    {[row.name, row.status, row.kills, row.deaths, row.latency].map((value, index) => <BitmapText key={String(index)} value={value} left={edges[index] * width + (index === 0 && !row.header ? 3 * scale : 0)} width={(edges[index + 1] - edges[index]) * width - 3 * scale} height={props.height} size={props.size} color={row.color} align={index === 0 ? 'left' : 'right'} />)}
    {row.header && <UiEntity uiTransform={{ positionType: 'absolute', position: { left: 0, bottom: 0 }, width, height: 1, pointerFilter: 'none' }} uiBackground={{ color: row.color }} />}
  </UiEntity>
}
