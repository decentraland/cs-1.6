import ReactEcs, { Label, UiEntity, ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { engine, inputSystem, InputAction, UiCanvasInformation } from '@dcl/sdk/ecs'
import {
  PlayerHealth,
  PlayerPose,
  Weapon,
  DamageFeedback,
  CrosshairState,
  Dead,
  Bot,
  PlayerMoney,
  PlayerEquipment
} from './components'
import { getLocalPlayerEntity, isSyncStale } from './client'
import { getPractice } from './practice'
import { myProfile } from '@dcl/sdk/network'
import { room } from './index'
import { Scoreboard } from './scoreboard-ui'
import { getBomb } from './bomb'
import { hasBombSelected } from './bomb-client'
import { BombHud } from './bomb-ui'
import { getCameraZoom } from './fps-camera'
import { ScopeHud } from './scope-ui'
import { AMMO_ICONS } from './weapon-hud'
import { Hud } from './hud'
import { Radar } from './radar-ui'
import { BuyHud } from './buy-ui'
import { getObserverMode, getSpectatorTarget, isDeathTransitioning, isSpectating } from './spectator'
import { PainCompass } from './pain-ui'
import { profileByName } from './weapon-profiles'
import { TeamMenu } from './team-menu-ui'
import { isTouchPlatform } from './platform'
import { isTeamMenuOpen } from './menu-state'
import { GrenadeFade } from './grenade-ui'
import { damagePulse } from './combat-effects'
import { KillFeedState } from './kill-feed'
import { KillFeed } from './kill-feed-ui'

const amber = Color4.create(1, 0.68, 0.2, 0.85)
const green = Color4.create(0.2, 1, 0.2, 1)
const killFeed = new KillFeedState()
let notice = ''
let touchScoreboard = false
let noticeUntil = 0

export function setupUI() {
  room.onMessage('playerKill', (data) => {
    killFeed.add(data, Date.now() / 1000)
  })
  room.onMessage('matchNotice', (data) => {
    if (data.address === myProfile.userId?.toLowerCase()) {
      notice = data.message
      noticeUntil = Date.now() + 5000
    }
  })
  room.onMessage('playerVoice', (data) => {
    if (data.address === myProfile.userId?.toLowerCase() && data.clip === 'kit-pickup') {
      notice = 'You picked up a defuser kit!'
      noticeUntil = Date.now() + 5000
    }
  })
  ReactEcsRenderer.setUiRenderer(() => <GameUI />, { virtualWidth: 0, virtualHeight: 0, screenInset: 'none' })
}

function botTeam(): number | undefined {
  for (const [, bot] of engine.getEntitiesWith(Bot)) return bot.team
  return undefined
}

function GameUI() {
  const canvas = UiCanvasInformation.getOrNull(engine.RootEntity)
  const width = canvas?.width ?? 1280
  const height = canvas?.height ?? 720
  const player = getLocalPlayerEntity()
  const health = player !== null ? PlayerHealth.getOrNull(player) : undefined
  const weapon = player !== null ? Weapon.getOrNull(player) : undefined
  const weaponProfile = weapon && profileByName(weapon.name)
  const feedback = player !== null ? DamageFeedback.getOrNull(player) : undefined
  const practice = getPractice()
  const seat = practice?.roster.find((seat) => seat.address === myProfile.userId?.toLowerCase() && seat.connected)
  const playingSeat = seat?.team === 1 || seat?.team === 2
  const enemyBots = playingSeat && botTeam() === 3 - seat.team
  const spectated = getSpectatorTarget()
  const observing = isSpectating() && !isDeathTransitioning()
  const result = ['won', 'lost', 'draw'].includes(practice?.phase ?? '')
  const scoreboard =
    (inputSystem.isPressed(InputAction.IA_MODIFIER) && inputSystem.isPressed(InputAction.IA_ACTION_3)) ||
    touchScoreboard ||
    !!practice?.matchOver
  // Crosshair is authored at 720p; scale it with the canvas so phones and 4K windows read the same spread.
  const ui = Math.max(1, height / 720)
  const gap = Math.round((5 + (player !== null ? (CrosshairState.getOrNull(player)?.spread ?? 0) : 0) * 15) * ui)
  const arm = Math.round(10 * ui)
  const thick = Math.max(2, Math.round(2 * ui))
  const active = practice?.phase === 'live' || practice?.phase === 'freeze'
  const menuOpen = isTeamMenuOpen()
  const connectionNotice = isSyncStale()
    ? 'Reconnecting to the match...'
    : active &&
        playingSeat &&
        !observing &&
        (health?.current ?? 0) > 0 &&
        player !== null &&
        !PlayerPose.getOrNull(player)?.valid
      ? 'Waiting for player position...'
      : ''
  const time = practice?.timeLeft ?? 120
  const title =
    practice?.phase === 'won'
      ? 'Counter-Terrorists Win!'
      : practice?.phase === 'lost'
        ? 'Terrorists Win!'
        : practice?.phase === 'draw'
          ? 'Round Draw!'
          : 'Counter-Strike'

  return (
    <UiEntity uiTransform={{ width, height, positionType: 'absolute', position: { left: 0, top: 0 } }}>
      {active &&
        player !== null &&
        !Dead.has(player) &&
        weaponProfile?.kind === 'gun' &&
        ['awp', 'scout', 'g3sg1', 'sg550'].includes(weaponProfile.id) &&
        getCameraZoom() !== 90 && <ScopeHud width={width} height={height} />}
      <Hud
        defuseKit={
          seat?.team === 2 &&
          (health?.current ?? 0) > 0 &&
          player !== null &&
          !!PlayerEquipment.getOrNull(player)?.defuseKit
        }
        width={width}
        height={height}
        health={health?.current ?? 100}
        armor={health?.armor ?? 0}
        clip={weapon?.ammoClip ?? 30}
        reserve={weapon?.ammoReserve ?? 90}
        money={player !== null ? (PlayerMoney.getOrNull(player)?.amount ?? 800) : 800}
        seconds={time}
        hideTime={getBomb()?.phase === 'planted'}
        hideAmmo={observing || weaponProfile?.kind === 'knife'}
        hidePlayerStats={observing}
        hideClip={weaponProfile?.kind === 'grenade'}
        ammoIcon={weaponProfile ? AMMO_ICONS[weaponProfile.id] : undefined}
      />
      <Radar width={width} />
      <BombHud width={width} />
      {active && !isSpectating() && (
        <Label
          value={`${weapon?.name ?? ''}${weaponProfile?.kind === 'gun' && weaponProfile.alternate ? ' (E: ' + (weaponProfile.alternate === 'scope' ? 'Zoom' : weaponProfile.alternate === 'silencer' ? 'Silencer' : 'Burst') + ')' : ''}   1: Primary   2: Pistol   3: Knife   4: C4   Shift+3: Grenades`}
          color={amber}
          fontSize={14}
          uiTransform={{ positionType: 'absolute', position: { right: 22, bottom: 95 }, width: 560, height: 24 }}
        />
      )}
      {active &&
        player !== null &&
        !Dead.has(player) &&
        !hasBombSelected() &&
        !['awp', 'scout', 'g3sg1', 'sg550'].includes(weaponProfile?.id ?? '') && (
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { left: '50%', top: '50%' }, width: 1, height: 1 }}
          >
            {[-1, 1].map((side) => (
              <UiEntity
                key={`h${side}`}
                uiTransform={{
                  positionType: 'absolute',
                  position: { left: side < 0 ? -gap - arm : gap, top: 0 },
                  width: arm,
                  height: thick
                }}
                uiBackground={{ color: green }}
              />
            ))}
            {[-1, 1].map((side) => (
              <UiEntity
                key={`v${side}`}
                uiTransform={{
                  positionType: 'absolute',
                  position: { left: 0, top: side < 0 ? -gap - arm : gap },
                  width: thick,
                  height: arm
                }}
                uiBackground={{ color: green }}
              />
            ))}
          </UiEntity>
        )}
      {practice?.phase === 'freeze' && (
        <Label
          value="Prepare to fight!"
          color={amber}
          fontSize={20}
          uiTransform={{ positionType: 'absolute', position: { top: '35%', left: '35%' }, width: '30%', height: 35 }}
        />
      )}
      <KillFeed entries={killFeed.entries(Date.now() / 1000)} width={width} height={height} observing={observing} />
      {!observing && (
        <PainCompass
          width={width}
          height={height}
          health={health?.current ?? 100}
          directions={feedback}
          pulse={damagePulse()}
        />
      )}
      {connectionNotice && (
        <Label
          value={connectionNotice}
          color={amber}
          fontSize={18}
          uiTransform={{
            positionType: 'absolute',
            position: { left: '25%', top: '20%' },
            width: '50%',
            height: 40,
            pointerFilter: 'none'
          }}
        />
      )}
      {playingSeat && player !== null && Dead.has(player) && active && (
        <Label
          value="Waiting for the next round"
          color={amber}
          fontSize={observing ? 15 : 20}
          uiTransform={{
            positionType: 'absolute',
            position: observing ? { bottom: 72, left: '30%' } : { top: '40%', left: '30%' },
            width: '40%',
            height: 40,
            pointerFilter: 'none'
          }}
        />
      )}
      {observing && (
        <Label
          value={
            getObserverMode() === 'roaming'
              ? 'Free Look'
              : spectated
                ? `Spectating: ${spectated.name} (${spectated.health})`
                : 'No living players to watch'
          }
          color={
            spectated?.team === 1
              ? Color4.create(1, 64 / 255, 64 / 255, 1)
              : spectated?.team === 2
                ? Color4.create(153 / 255, 204 / 255, 1, 1)
                : amber
          }
          fontSize={18}
          uiTransform={{
            positionType: 'absolute',
            position: { bottom: 130, left: '20%' },
            width: '60%',
            height: 28,
            pointerFilter: 'none'
          }}
        />
      )}
      {observing && (
        <Label
          value={
            seat?.team === 0 && !isTouchPlatform()
              ? 'Space: chase/free look / WASD: fly / Click: next / Shift+click: previous / Esc: menu'
              : 'Click: next / Shift+click: previous / Esc: team menu'
          }
          color={amber}
          fontSize={15}
          uiTransform={{
            positionType: 'absolute',
            position: { bottom: 102, left: '20%' },
            width: '60%',
            height: 26,
            pointerFilter: 'none'
          }}
        />
      )}
      {result && (
        <Label
          value={title}
          color={amber}
          fontSize={22}
          uiTransform={{ positionType: 'absolute', position: { top: '35%', left: '25%' }, width: '50%', height: 35 }}
        />
      )}
      {scoreboard && <Scoreboard width={width} height={height} />}
      {isTouchPlatform() && !menuOpen && (
        <UiEntity
          onMouseDown={() => {
            touchScoreboard = !touchScoreboard
          }}
          uiTransform={{
            positionType: 'absolute',
            position: { right: 22, top: 60 },
            width: 110,
            height: 36,
            borderWidth: 1,
            borderColor: amber
          }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
        >
          <Label value="SCORES" color={amber} fontSize={18} uiTransform={{ width: 110, height: 36 }} />
        </UiEntity>
      )}
      {active && enemyBots && (
        <Label
          value={`Enemies left: ${practice?.remaining ?? 0}`}
          color={amber}
          fontSize={15}
          uiTransform={{ positionType: 'absolute', position: { left: 22, top: 142 }, width: 180, height: 25 }}
        />
      )}
      <GrenadeFade width={width} height={height} />
      <BuyHud width={width} height={height} />
      {notice && Date.now() < noticeUntil && (
        <Label
          value={notice}
          color={amber}
          fontSize={18}
          uiTransform={{
            positionType: 'absolute',
            position: { left: '25%', top: '25%' },
            width: '50%',
            height: 40,
            pointerFilter: 'none'
          }}
        />
      )}
      {menuOpen && <TeamMenu width={width} height={height} />}
    </UiEntity>
  )
}
