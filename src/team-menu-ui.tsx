import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { myProfile } from '@dcl/sdk/network'
import { BitmapText, scoreFontSize } from './bitmap-text'
import { isLocalPlayerReady } from './client'
import { room } from './index'
import { getPractice } from './practice'

const amber = Color4.create(1, 176 / 255, 0, 1)
const border = Color4.create(188 / 255, 112 / 255, 0, .5)
const disabled = Color4.create(80 / 255, 48 / 255, 0, 1)
const panel = Color4.create(0, 0, 0, 200 / 255)
const button = Color4.create(0, 0, 0, 64 / 255)
const selected = Color4.create(1, 176 / 255, 0, 100 / 255)
const transparent = Color4.create(0, 0, 0, 0)
const briefing = [
  'Dust II - Bomb/Defuse',
  '*** GameHelper.com exclusive ***',
  'by DaveJ (http://www.johnsto.co.uk/)',
  'textures by MacMan (MacManInfi@aol.com)',
  '',
  'Counter-Terrorists: Prevent Terrorists',
  'from bombing chemical weapon crates.',
  'Team members must defuse any bombs',
  'that threaten targeted areas.',
  '',
  'Terrorists: The Terrorist carrying the',
  'C4 must destroy one of the chemical',
  'weapon stashes.',
  '',
  'Other Notes: There are 2 chemical',
  'weapon stashes in the mission.'
]
let hovered = ''

interface MenuButtonProps {
  id: string
  label: string
  left: number
  top: number
  width: number
  height: number
  size: number
  enabled: boolean
  action?: () => void
}

function MenuButton(props: MenuButtonProps) {
  const active = props.enabled && hovered === props.id
  return <UiEntity
    onMouseEnter={props.enabled ? () => { hovered = props.id } : undefined}
    onMouseLeave={props.enabled ? () => { if (hovered === props.id) hovered = '' } : undefined}
    onMouseDown={props.enabled ? props.action : undefined}
    uiTransform={{
      positionType: 'absolute', position: { left: props.left, top: props.top },
      width: props.width, height: props.height, borderWidth: 1,
      borderColor: active ? amber : border
    }}
    uiBackground={{ color: active ? selected : button }}
  >
    <BitmapText value={props.label} left={6} width={props.width - 12} height={props.height} size={props.size} color={props.enabled ? amber : disabled} />
  </UiEntity>
}

export function TeamMenu({ width, height }: { width: number; height: number }) {
  const scale = Math.min(width / 640, height / 480)
  const originX = (width - 640 * scale) / 2
  const originY = (height - 480 * scale) / 2
  const x = (value: number) => originX + value * scale
  const y = (value: number) => originY + value * scale
  const localX = (value: number) => value * scale
  const localY = (value: number) => value * scale
  const font = height < 480 ? 10 : scoreFontSize(height)
  const titleFont = height < 600 ? 14 : 18
  const match = getPractice()
  const ready = isLocalPlayerReady()
  const address = myProfile.userId?.toLowerCase()
  const seat = match?.roster.find(player => player.address === address && player.connected)
  const teams = match?.mode === 'teams'
  const playingSeat = seat?.team === 1 || seat?.team === 2
  const teamCount = (team: number) => match?.roster.filter(player => player.connected && player.team === team).length ?? 0
  const join = (team: number) => room.send('teamJoin', { team })
  const autoAssign = () => join(teamCount(1) <= teamCount(2) ? 1 : 2)
  const actionLabel = teams && seat ? seat.team === 0 ? 'LEAVE SPECTATOR' : 'LEAVE TEAM' : match?.matchOver ? 'PLAY AGAIN WITH BOTS' : 'PRACTICE WITH BOTS'
  const action = teams && seat ? () => room.send('teamLeave', {}) : () => room.send('practiceStart', {})
  const spectate = () => room.send('teamSpectate', {})

  return <UiEntity uiTransform={{ positionType: 'absolute', position: { left: 0, top: 0 }, width, height, pointerFilter: 'block' }}>
    <UiEntity uiTransform={{ positionType: 'absolute', position: { left: x(20), top: y(20) }, width: localX(600), height: localY(440), borderRadius: localX(8), pointerFilter: 'block' }} uiBackground={{ color: panel }} />
    <UiEntity uiTransform={{ positionType: 'absolute', position: { left: x(26), top: y(20) }, width: localX(32), height: localY(32), pointerFilter: 'none' }} uiBackground={{ texture: { src: 'assets/ui/cs-logo.png', filterMode: 'point' }, textureMode: 'stretch', color: amber }} />
    <BitmapText value="SELECT TEAM" left={x(76)} top={y(22)} width={localX(500)} height={localY(48)} size={titleFont} color={amber} />
    <UiEntity uiTransform={{ positionType: 'absolute', position: { left: x(20), top: y(72) }, width: localX(600), height: 1, pointerFilter: 'none' }} uiBackground={{ color: border }} />

    <MenuButton id="terrorists" label="1 TERRORIST FORCES" left={x(76)} top={y(116)} width={localX(148)} height={localY(20)} size={font} enabled={ready} action={() => join(1)} />
    <MenuButton id="counter-terrorists" label="2 CT FORCES" left={x(76)} top={y(148)} width={localX(148)} height={localY(20)} size={font} enabled={ready} action={() => join(2)} />
    <MenuButton id="auto-assign" label="5 AUTO ASSIGN" left={x(76)} top={y(212)} width={localX(148)} height={localY(20)} size={font} enabled={ready} action={autoAssign} />
    <MenuButton id="spectate" label="6 SPECTATE" left={x(76)} top={y(244)} width={localX(148)} height={localY(20)} size={font} enabled={ready} action={spectate} />
    <MenuButton id="scene-action" label={actionLabel} left={x(76)} top={y(308)} width={localX(148)} height={localY(20)} size={font} enabled={ready && (!teams || !!seat)} action={action} />
    {!ready && <BitmapText value="CONNECTING..." left={x(76)} top={y(340)} width={localX(148)} height={localY(20)} size={font} color={disabled} />}
    {teams && seat && <BitmapText value={`JOINED ${seat.team === 0 ? 'SPECTATORS' : seat.team === 1 ? 'TERRORISTS' : 'CT FORCES'}`} left={x(76)} top={y(340)} width={localX(148)} height={localY(20)} size={font} color={amber} />}
    {teams && playingSeat && match?.matchOver && <MenuButton id="play-again" label="PLAY AGAIN" left={x(76)} top={y(372)} width={localX(148)} height={localY(20)} size={font} enabled={ready} action={() => room.send('teamRestart', {})} />}

    <UiEntity uiTransform={{ positionType: 'absolute', position: { left: x(244), top: y(116) }, width: localX(316), height: localY(286), borderWidth: 1, borderColor: border, pointerFilter: 'none' }} uiBackground={{ color: panel }}>
      {briefing.map((line, index) => <BitmapText key={String(index)} value={line} left={localX(4)} top={localY(3 + index * 14)} width={localX(306)} height={localY(14)} size={font} color={amber} />)}
    </UiEntity>
    <UiEntity uiTransform={{ positionType: 'absolute', position: { left: 0, top: 0 }, width: 1, height: 1, overflow: 'hidden', pointerFilter: 'none' }}>
      <Label value="Select a team" color={transparent} fontSize={1} uiTransform={{ width: 1, height: 1, pointerFilter: 'none' }} />
      {!teams && <Label value={match?.round ? 'Play again' : 'Start game'} color={transparent} fontSize={1} uiTransform={{ width: 1, height: 1, pointerFilter: 'none' }} />}
      {seat && <Label value={`Joined ${seat.team === 0 ? 'Spectators' : seat.team === 1 ? 'Terrorists' : 'Counter-Terrorists'}`} color={transparent} fontSize={1} uiTransform={{ width: 1, height: 1, pointerFilter: 'none' }} />}
    </UiEntity>
  </UiEntity>
}
