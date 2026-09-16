import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { inputSystem, InputAction, PointerEventType } from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { BitmapText } from './bitmap-text'
import { capturePointer, isLocalPlayerReady } from './client'
import { room } from './index'
import { getMenuCursor, isTeamMenuOpen, spectatorMenu } from './menu-state'
import { amber, disabled, MenuButton, MenuFrame, MenuInfoPanel, menuLayout } from './menu-ui'
import { getPractice } from './practice'
import { isBotAddress } from './team-rules'
import { BOT_DIFFICULTIES, BOT_DIFFICULTY_PROFILES, BotDifficulty, parseBotDifficulty } from './bot-difficulty'

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
let joinKeyDown = false

function teamCount(team: number) {
  return (
    getPractice()?.roster.filter((player) => player.connected && player.team === team && !isBotAddress(player.address))
      .length ?? 0
  )
}
export function joinTeam(team: 1 | 2) {
  if (spectatorMenu.open) capturePointer()
  spectatorMenu.close()
  room.send('teamJoin', { team })
}
export function autoAssignTeam() {
  joinTeam(teamCount(1) <= teamCount(2) ? 1 : 2)
}
export function spectateTeam() {
  if (spectatorMenu.open) capturePointer()
  spectatorMenu.close()
  room.send('teamSpectate', {})
}
export function leaveTeam() {
  spectatorMenu.close()
  room.send('teamLeave', {})
}
export function restartTeamMatch() {
  room.send('teamRestart', {})
}
// Shared by the whole match, like the bot_difficulty server cvar in CS 1.6.
export function setBotDifficulty(level: BotDifficulty) {
  room.send('botDifficulty', { level })
}

// Keys 1/2 mirror Teammenu.res; the explorer has no 5/6 keys so auto assign and spectate stay click-only.
export function teamMenuInputSystem() {
  const one = inputSystem.isPressed(InputAction.IA_ACTION_3)
  const two = inputSystem.isPressed(InputAction.IA_ACTION_4)
  if (!one && !two) joinKeyDown = false
  if (joinKeyDown || !isTeamMenuOpen() || !isLocalPlayerReady() || inputSystem.isPressed(InputAction.IA_MODIFIER))
    return
  if (inputSystem.isTriggered(InputAction.IA_ACTION_3, PointerEventType.PET_DOWN)) {
    joinKeyDown = true
    joinTeam(1)
  } else if (inputSystem.isTriggered(InputAction.IA_ACTION_4, PointerEventType.PET_DOWN)) {
    joinKeyDown = true
    joinTeam(2)
  }
}

export function TeamMenu({ width, height }: { width: number; height: number }) {
  const layout = menuLayout(width, height)
  const { x, y, size, font } = layout
  const match = getPractice()
  const ready = isLocalPlayerReady()
  const address = myProfile.userId?.toLowerCase()
  const seat = match?.roster.find((player) => player.address === address && player.connected)
  const playingSeat = seat?.team === 1 || seat?.team === 2
  const cursor = getMenuCursor()
  const difficulty = parseBotDifficulty(match?.botDifficulty)
  const row = (label: string, top: number, action: () => void, enabled = ready) => (
    <MenuButton
      label={label}
      left={x(76)}
      top={y(top)}
      width={size(148)}
      height={size(20)}
      size={font}
      enabled={enabled}
      cursor={cursor}
      action={action}
    />
  )

  return (
    <MenuFrame width={width} height={height} title="SELECT TEAM" layout={layout}>
      {row('1 TERRORIST FORCES', 116, () => joinTeam(1))}
      {row('2 CT FORCES', 148, () => joinTeam(2))}
      {row('5 AUTO ASSIGN', 212, autoAssignTeam)}
      {row('6 SPECTATE', 244, spectateTeam)}
      {seat && row(seat.team === 0 ? 'LEAVE SPECTATOR' : 'LEAVE TEAM', 308, leaveTeam)}
      {!ready && (
        <BitmapText
          value="CONNECTING..."
          left={x(76)}
          top={y(340)}
          width={size(148)}
          height={size(20)}
          size={font}
          color={disabled}
        />
      )}
      {seat && (
        <BitmapText
          value={`JOINED ${seat.team === 0 ? 'SPECTATORS' : seat.team === 1 ? 'TERRORISTS' : 'CT FORCES'}`}
          left={x(76)}
          top={y(340)}
          width={size(148)}
          height={size(20)}
          size={font}
          color={amber}
        />
      )}
      {playingSeat && match?.matchOver && row('PLAY AGAIN', 372, restartTeamMatch)}
      {spectatorMenu.open &&
        row('RESUME SPECTATING', 372, () => {
          spectatorMenu.close()
          capturePointer()
        })}
      <BitmapText
        value="BOT SKILL"
        left={x(76)}
        top={y(412)}
        width={size(100)}
        height={size(20)}
        size={font}
        color={amber}
      />
      {BOT_DIFFICULTIES.map((level, index) => (
        <MenuButton
          key={level}
          label={
            level === difficulty ? `[${BOT_DIFFICULTY_PROFILES[level].label}]` : BOT_DIFFICULTY_PROFILES[level].label
          }
          left={x(180 + index * 84)}
          top={y(412)}
          width={size(76)}
          height={size(20)}
          size={font}
          enabled={ready && level !== difficulty}
          cursor={cursor}
          action={() => setBotDifficulty(level)}
        />
      ))}
      <MenuInfoPanel
        layout={layout}
        lines={
          match?.matchOver
            ? [
                match.ctScore > match.tScore ? 'COUNTER-TERRORISTS WIN THE MATCH' : 'TERRORISTS WIN THE MATCH',
                '',
                `Counter-Terrorists: ${match.ctScore}`,
                `Terrorists: ${match.tScore}`,
                '',
                'PLAY AGAIN starts a fresh match.'
              ]
            : briefing
        }
      />
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: 0, top: 0 },
          width: 1,
          height: 1,
          overflow: 'hidden',
          pointerFilter: 'none'
        }}
      >
        <Label
          value="Select a team"
          color={transparent}
          fontSize={1}
          uiTransform={{ width: 1, height: 1, pointerFilter: 'none' }}
        />
        {seat && (
          <Label
            value={`Joined ${seat.team === 0 ? 'Spectators' : seat.team === 1 ? 'Terrorists' : 'Counter-Terrorists'}`}
            color={transparent}
            fontSize={1}
            uiTransform={{ width: 1, height: 1, pointerFilter: 'none' }}
          />
        )}
      </UiEntity>
    </MenuFrame>
  )
}
