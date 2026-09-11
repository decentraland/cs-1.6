import ReactEcs, { Label, UiEntity, ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { engine, inputSystem, InputAction, UiCanvasInformation } from '@dcl/sdk/ecs'
import { PlayerHealth, Weapon, DamageFeedback, CrosshairState, Dead } from './components'
import { getLocalPlayerEntity } from './client'
import { getPractice } from './practice'
import { myProfile } from '@dcl/sdk/network'
import { room } from './index'
import { Scoreboard } from './scoreboard-ui'
import { getBomb } from './bomb'
import { hasBombSelected } from './bomb-client'
import { BombHud } from './bomb-ui'
import { Hud } from './hud'
import { Radar } from './radar-ui'
import { BuyHud } from './buy-ui'
import { PlayerMoney } from './components'
import { getSpectatorTarget, isDeathTransitioning, isSpectating } from './spectator'
import { PainCompass } from './pain-ui'
import { profileByName } from './weapon-profiles'
import { TeamMenu } from './team-menu-ui'

const amber = Color4.create(1, 0.68, 0.2, 0.85)
const green = Color4.create(0.2, 1, 0.2, 1)
let lastKill = ''
let killUntil = 0
let notice = ''
let noticeUntil = 0

export function setupUI() {
  room.onMessage('practiceHit', (data) => {
    if (data.killed) { lastKill = `Player   AK-47   ${data.name}`; killUntil = Date.now() + 5000 }
  })
  room.onMessage('playerKill', data => {
    lastKill = `${data.killer}   ${data.weapon}   ${data.victim}`; killUntil = Date.now() + 5000
  })
  room.onMessage('matchNotice', data => {
    if (data.address === myProfile.userId?.toLowerCase()) { notice = data.message; noticeUntil = Date.now() + 5000 }
  })
  ReactEcsRenderer.setUiRenderer(() => <GameUI />, { virtualWidth: 0, virtualHeight: 0, screenInset: 'none' })
}

function GameUI() {
  const canvas = UiCanvasInformation.getOrNull(engine.RootEntity)
  const width = canvas?.width ?? 1280
  const height = canvas?.height ?? 720
  const player = getLocalPlayerEntity()
  const health = player !== null ? PlayerHealth.getOrNull(player) : undefined
  const weapon = player !== null ? Weapon.getOrNull(player) : undefined
  const weaponProfile=weapon&&profileByName(weapon.name)
  const feedback = player !== null ? DamageFeedback.getOrNull(player) : undefined
  const practice = getPractice()
  const seat = practice?.roster.find(seat => seat.address === myProfile.userId?.toLowerCase() && seat.connected)
  const teams = practice?.mode === 'teams'
  const playingSeat = seat?.team === 1 || seat?.team === 2
  const spectated = getSpectatorTarget()
  const result = ['won', 'lost', 'draw'].includes(practice?.phase ?? '')
  const scoreboard = inputSystem.isPressed(InputAction.IA_ACTION_3) || !!practice?.matchOver
  const gap = 5 + Math.round((player !== null ? CrosshairState.getOrNull(player)?.spread ?? 0 : 0) * 15)
  const active = practice?.phase === 'live' || practice?.phase === 'freeze'
  const menuOpen = !practice || practice.matchOver || practice.phase === 'ready' || practice.phase === 'waiting' || (teams && !seat)
  const time = practice?.timeLeft ?? 120
  const title = practice?.phase === 'won' ? 'Counter-Terrorists Win!' : practice?.phase === 'lost' ? 'Terrorists Win!' : practice?.phase === 'draw' ? 'Round Draw!' : 'Counter-Strike'

  return <UiEntity uiTransform={{ width, height, positionType: 'absolute', position: { left: 0, top: 0 } }}>
    <Hud width={width} height={height} health={health?.current ?? 100} armor={health?.armor ?? 0} clip={weapon?.ammoClip ?? 30} reserve={weapon?.ammoReserve ?? 90} money={player !== null ? PlayerMoney.getOrNull(player)?.amount ?? 800 : 800} seconds={time} hideTime={getBomb()?.phase === 'planted'} hideAmmo={weaponProfile?.kind==='knife'} />
    <Radar width={width} />
    <BombHud width={width} />
    <BuyHud />
    {active && !isSpectating() && <Label value={`${weapon?.name ?? ''}   2: Primary   Shift+2: Pistol   Shift+3: Knife`} color={amber} fontSize={14} uiTransform={{positionType:'absolute',position:{right:22,bottom:95},width:470,height:24}} />}
    {active && player !== null && !Dead.has(player) && !hasBombSelected() && <UiEntity uiTransform={{ positionType: 'absolute', position: { left: '50%', top: '50%' }, width: 1, height: 1 }}>
      {[-1, 1].map((side) => <UiEntity key={`h${side}`} uiTransform={{ positionType: 'absolute', position: { left: side < 0 ? -gap - 10 : gap, top: 0 }, width: 10, height: 2 }} uiBackground={{ color: green }} />)}
      {[-1, 1].map((side) => <UiEntity key={`v${side}`} uiTransform={{ positionType: 'absolute', position: { left: 0, top: side < 0 ? -gap - 10 : gap }, width: 2, height: 10 }} uiBackground={{ color: green }} />)}
    </UiEntity>}
    {practice?.phase === 'freeze' && <Label value="Prepare to fight!" color={amber} fontSize={20} uiTransform={{ positionType: 'absolute', position: { top: '35%', left: '35%' }, width: '30%', height: 35 }} />}
    {lastKill && Date.now() < killUntil && <Label value={lastKill} color={amber} fontSize={17} textAlign="middle-right" uiTransform={{ positionType: 'absolute', position: { right: 22, top: 20 }, width: 450, height: 30 }} />}
    <PainCompass width={width} height={height} health={health?.current ?? 100} directions={feedback} />
    {menuOpen && <TeamMenu width={width} height={height} />}
    {notice && Date.now() < noticeUntil && <Label value={notice} color={amber} fontSize={18} uiTransform={{ positionType: 'absolute', position: { left: '25%', top: '25%' }, width: '50%', height: 40 }} />}
    {teams && playingSeat && player !== null && Dead.has(player) && active && <Label value="Waiting for the next round" color={amber} fontSize={20} uiTransform={{ positionType: 'absolute', position: { top: '40%', left: '30%' }, width: '40%', height: 40 }} />}
    {spectated && <Label value={`Spectating: ${spectated.name} (${spectated.health})`} color={amber} fontSize={18} uiTransform={{ positionType: 'absolute', position: { bottom: 130, left: '20%' }, width: '60%', height: 28 }} />}
    {isSpectating() && !isDeathTransitioning() && <Label value="Free Chase Cam — Click: next / Shift+click: previous" color={amber} fontSize={15} uiTransform={{ positionType: 'absolute', position: { bottom: 102, left: '20%' }, width: '60%', height: 26 }} />}
    {result && <Label value={title} color={amber} fontSize={22} uiTransform={{ positionType: 'absolute', position: { top: '35%', left: '25%' }, width: '50%', height: 35 }} />}
    {scoreboard && <Scoreboard width={width} height={height} />}
    {active && !teams && <Label value={`Enemies left: ${practice?.remaining ?? 3}`} color={amber} fontSize={15} uiTransform={{ positionType: 'absolute', position: { left: 22, top: 142 }, width: 180, height: 25 }} />}
  </UiEntity>
}
