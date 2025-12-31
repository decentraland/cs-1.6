import ReactEcs, { Label, UiEntity, ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { engine } from '@dcl/sdk/ecs'
import {
  PlayerHealth,
  PlayerTeam,
  Team,
  Weapon,
  CrosshairState,
  DamageFeedback,
  Dead,
  PlayerStats,
  PlayerAddress,
  MatchLeaderboard
} from './components'
import { isLocalPlayerReady, getLocalPlayerEntity, isConnected, getConnectionTime } from './client'

// Find local player entity
function getLocalPlayer() {
  const localEntity = getLocalPlayerEntity()
  if (!localEntity) return null

  const health = PlayerHealth.getOrNull(localEntity)
  const team = PlayerTeam.getOrNull(localEntity)

  if (!health || !team) return null
  return { health, team }
}

function getPlayerWeapon() {
  const localEntity = getLocalPlayerEntity()
  if (!localEntity) return null
  return Weapon.getOrNull(localEntity)
}

function getCrosshairState() {
  const localEntity = getLocalPlayerEntity()
  if (!localEntity) return null
  return CrosshairState.getOrNull(localEntity)
}

function getDamageFeedback() {
  const localEntity = getLocalPlayerEntity()
  if (!localEntity) return null
  return DamageFeedback.getOrNull(localEntity)
}

function isPlayerDead() {
  const localEntity = getLocalPlayerEntity()
  if (!localEntity) return false
  return Dead.has(localEntity)
}

export function setupUI() {
  ReactEcsRenderer.setUiRenderer(() => {
    const playerReady = isLocalPlayerReady()

    return (
      <UiEntity
        uiTransform={{
          width: '100%',
          height: '100%',
          positionType: 'absolute'
        }}
      >
        {!playerReady && <LoadingScreen />}

        {playerReady && (
          <UiEntity
            uiTransform={{
              width: '100%',
              height: '100%',
              positionType: 'absolute'
            }}
          >
            {/* Health & Armor - Bottom Left */}
            <HealthDisplay />

            {/* Ammo - Bottom Right */}
            <AmmoDisplay />

            {/* Team Indicator - Top Left */}
            <TeamDisplay />

            {/* Crosshair - Center */}
            <Crosshair />

            {/* Damage Overlay - Full Screen */}
            <DamageOverlay />

            {/* Death Overlay - Full Screen Gray */}
            <DeathOverlay />

            {/* Leaderboard - Top Right */}
            <Leaderboard />

            {/* Connection Notification - Top Center */}
            <ConnectionNotification />
          </UiEntity>
        )}
      </UiEntity>
    )
  })
}

function HealthDisplay() {
  const player = getLocalPlayer()
  if (!player) return null

  const health = player.health
  const healthPercent = (health.current / health.max) * 100

  return (
    <UiEntity
      uiTransform={{
        width: 200,
        height: 80,
        position: { left: 40, bottom: 40 },
        positionType: 'absolute'
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.7) }}
    >
      {/* Health */}
      <UiEntity
        uiTransform={{
          width: '90%',
          height: 30,
          margin: { top: 5, left: 5 }
        }}
      >
        <Label
          value={`HP: ${health.current}`}
          fontSize={18}
          color={healthPercent > 50 ? Color4.Green() : healthPercent > 25 ? Color4.Yellow() : Color4.Red()}
          uiTransform={{ width: '100%', height: '100%' }}
        />
      </UiEntity>

      {/* Armor */}
      <UiEntity
        uiTransform={{
          width: '90%',
          height: 30,
          margin: { top: 5, left: 5 }
        }}
      >
        <Label
          value={`ARMOR: ${health.armor}`}
          fontSize={14}
          color={Color4.create(0.5, 0.7, 1, 1)}
          uiTransform={{ width: '100%', height: '100%' }}
        />
      </UiEntity>
    </UiEntity>
  )
}

function AmmoDisplay() {
  const weapon = getPlayerWeapon()
  if (!weapon) return null

  return (
    <UiEntity
      uiTransform={{
        width: 380,
        height: 80,
        position: { right: 40, bottom: 40 },
        positionType: 'absolute'
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.7) }}
    >
      {/* Weapon Name */}
      <UiEntity
        uiTransform={{
          width: '95%',
          height: 25,
          margin: { top: 5, left: 10 }
        }}
      >
        <Label
          value={weapon.name}
          fontSize={14}
          color={Color4.White()}
          uiTransform={{ width: '100%', height: '100%' }}
        />
      </UiEntity>

      {/* Ammo and Reloading in a row */}
      <UiEntity
        uiTransform={{
          width: '95%',
          height: 35,
          margin: { top: 5, left: 10 },
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-start'
        }}
      >
        <Label
          value={`${weapon.ammoClip} / ${weapon.ammoReserve}`}
          fontSize={24}
          color={weapon.ammoClip === 0 ? Color4.Red() : weapon.ammoClip < 10 ? Color4.Yellow() : Color4.White()}
          uiTransform={{ width: 'auto', height: '100%', margin: { right: 15 } }}
        />

        {/* Reloading indicator - in same row */}
        {weapon.isReloading && (
          <Label
            value="RELOADING..."
            fontSize={14}
            color={Color4.Yellow()}
            uiTransform={{ width: 'auto', height: '100%' }}
          />
        )}
      </UiEntity>
    </UiEntity>
  )
}

function TeamDisplay() {
  const player = getLocalPlayer()
  if (!player) return null

  const teamName = player.team.team === Team.TERRORIST ? 'TERRORIST' : 'COUNTER-TERRORIST'
  const teamColor = player.team.team === Team.TERRORIST ? Color4.create(1, 0.5, 0, 1) : Color4.create(0, 0.5, 1, 1)

  return (
    <UiEntity
      uiTransform={{
        width: 180,
        height: 40,
        position: { top: 200, left: 20 },
        positionType: 'absolute'
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.7) }}
    >
      <Label
        value={teamName}
        fontSize={16}
        color={teamColor}
        uiTransform={{ width: '100%', height: '100%' }}
        textAlign="middle-center"
      />
    </UiEntity>
  )
}

function Crosshair() {
  const crosshairState = getCrosshairState()

  // Base gap and line size
  const baseGap = 5
  const lineLength = 10
  const lineThickness = 2
  const centerDotSize = 2

  // Calculate dynamic gap based on spread (0 = tight, 1 = max spread)
  const spread = crosshairState ? crosshairState.spread : 0
  const gap = baseGap + spread * 15 // Expands up to 20 pixels from center

  return (
    <UiEntity
      uiTransform={{
        width: 100,
        height: 100,
        position: { top: '50%', left: '50%' },
        margin: { top: -50, left: -50 },
        positionType: 'absolute'
      }}
    >
      {/* Top line */}
      <UiEntity
        uiTransform={{
          width: lineThickness,
          height: lineLength,
          position: { top: '50%', left: '50%' },
          margin: { top: -(gap + lineLength), left: -lineThickness / 2 },
          positionType: 'absolute'
        }}
        uiBackground={{ color: Color4.White() }}
      />

      {/* Bottom line */}
      <UiEntity
        uiTransform={{
          width: lineThickness,
          height: lineLength,
          position: { top: '50%', left: '50%' },
          margin: { top: gap, left: -lineThickness / 2 },
          positionType: 'absolute'
        }}
        uiBackground={{ color: Color4.White() }}
      />

      {/* Left line */}
      <UiEntity
        uiTransform={{
          width: lineLength,
          height: lineThickness,
          position: { top: '50%', left: '50%' },
          margin: { top: -lineThickness / 2, left: -(gap + lineLength) },
          positionType: 'absolute'
        }}
        uiBackground={{ color: Color4.White() }}
      />

      {/* Right line */}
      <UiEntity
        uiTransform={{
          width: lineLength,
          height: lineThickness,
          position: { top: '50%', left: '50%' },
          margin: { top: -lineThickness / 2, left: gap },
          positionType: 'absolute'
        }}
        uiBackground={{ color: Color4.White() }}
      />

      {/* Center dot */}
      <UiEntity
        uiTransform={{
          width: centerDotSize,
          height: centerDotSize,
          position: { top: '50%', left: '50%' },
          margin: { top: -centerDotSize / 2, left: -centerDotSize / 2 },
          positionType: 'absolute'
        }}
        uiBackground={{ color: Color4.White() }}
      />
    </UiEntity>
  )
}

function DamageOverlay() {
  const feedback = getDamageFeedback()

  // Don't show if no damage or intensity is 0
  if (!feedback || feedback.intensity <= 0) return null

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute'
      }}
      uiBackground={{
        color: Color4.create(1, 0, 0, feedback.intensity * 0.5) // Red overlay, max 50% opacity
      }}
    />
  )
}

function DeathOverlay() {
  const isDead = isPlayerDead()

  // Don't show if player is alive
  if (!isDead) return null

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute'
      }}
      uiBackground={{
        color: Color4.create(0.2, 0.2, 0.2, 0.8) // Gray overlay, 80% opacity
      }}
    >
      {/* Death message */}
      <UiEntity
        uiTransform={{
          width: 400,
          height: 100,
          position: { top: '40%', left: '50%' },
          margin: { left: -200, top: -50 },
          positionType: 'absolute'
        }}
      >
        <Label
          value="YOU DIED"
          fontSize={48}
          color={Color4.White()}
          uiTransform={{ width: '100%', height: '100%' }}
          textAlign="middle-center"
        />
      </UiEntity>

      {/* Respawn message */}
      <UiEntity
        uiTransform={{
          width: 400,
          height: 50,
          position: { top: '50%', left: '50%' },
          margin: { left: -200, top: 0 },
          positionType: 'absolute'
        }}
      >
        <Label
          value="Respawning in 5 seconds..."
          fontSize={18}
          color={Color4.create(0.8, 0.8, 0.8, 1)}
          uiTransform={{ width: '100%', height: '100%' }}
          textAlign="middle-center"
        />
      </UiEntity>
    </UiEntity>
  )
}

function LoadingScreen() {
  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        positionType: 'absolute'
      }}
      uiBackground={{
        color: Color4.create(0.1, 0.1, 0.1, 0.95)
      }}
    >
      {/* Loading message */}
      <UiEntity
        uiTransform={{
          width: 400,
          height: 100,
          position: { top: '45%', left: '50%' },
          margin: { left: -200, top: -50 },
          positionType: 'absolute'
        }}
      >
        <Label
          value="CONNECTING..."
          fontSize={36}
          color={Color4.White()}
          uiTransform={{ width: '100%', height: '100%' }}
          textAlign="middle-center"
        />
      </UiEntity>

      {/* Subtext */}
      <UiEntity
        uiTransform={{
          width: 400,
          height: 50,
          position: { top: '52%', left: '50%' },
          margin: { left: -200, top: 0 },
          positionType: 'absolute'
        }}
      >
        <Label
          value="Waiting for server assignment..."
          fontSize={16}
          color={Color4.Gray()}
          uiTransform={{ width: '100%', height: '100%' }}
          textAlign="middle-center"
        />
      </UiEntity>
    </UiEntity>
  )
}

function ConnectionNotification() {
  const connected = isConnected()
  const connTime = getConnectionTime()
  const currentTime = Date.now() / 1000

  // Show notification for 3 seconds after connection
  const timeSinceConnection = currentTime - connTime
  const showNotification = connected && timeSinceConnection < 3

  if (!showNotification) return null

  // Fade out effect (opacity decreases in last second)
  const opacity = timeSinceConnection > 2 ? 1 - (timeSinceConnection - 2) : 1

  return (
    <UiEntity
      uiTransform={{
        width: 300,
        height: 50,
        position: { top: 100, left: '50%' },
        margin: { left: -150 },
        positionType: 'absolute'
      }}
      uiBackground={{ color: Color4.create(0.1, 0.5, 0.1, 0.9 * opacity) }}
    >
      <Label
        value="Connected to server"
        fontSize={20}
        color={Color4.create(1, 1, 1, opacity)}
        uiTransform={{ width: '100%', height: '100%' }}
        textAlign="middle-center"
      />
    </UiEntity>
  )
}

function Leaderboard() {
  // Get leaderboard data from singleton MatchLeaderboard entity
  let topPlayers: Array<{ address: string; name: string; kills: number; deaths: number }> = []

  // Find the MatchLeaderboard entity
  for (const [_, leaderboard] of engine.getEntitiesWith(MatchLeaderboard)) {
    topPlayers = [...leaderboard.players]
    break // Only one leaderboard entity
  }

  return (
    <UiEntity
      uiTransform={{
        width: 280,
        height: 200,
        position: { top: 80, right: 40 },
        positionType: 'absolute',
        flexDirection: 'column'
      }}
      uiBackground={{ color: Color4.create(0, 0, 0, 0.8) }}
    >
      {/* Title */}
      <UiEntity
        uiTransform={{
          width: '100%',
          height: 30,
          margin: { top: 5 }
        }}
      >
        <Label
          value="LEADERBOARD"
          fontSize={16}
          color={Color4.Yellow()}
          uiTransform={{ width: '100%', height: '100%' }}
          textAlign="middle-center"
        />
      </UiEntity>

      {/* Headers */}
      <UiEntity
        uiTransform={{
          width: '100%',
          height: 20,
          margin: { top: 35, left: 0 },
          flexDirection: 'row',
        }}
      >
        <Label
          value="Player"
          fontSize={12}
          color={Color4.Gray()}
          uiTransform={{ width: '80%', margin: { left: 20 } }}
          textAlign="middle-left"
        />
        <Label
          value="K"
          fontSize={12}
          color={Color4.Gray()}
          uiTransform={{ width: '10%' }}
          // uiTransform={{ width: 40, height: '100%', positionType: 'absolute', position: { left: 140 } }}
          textAlign="middle-center"
        />
        <Label
          value="D"
          fontSize={12}
          color={Color4.Gray()}
          uiTransform={{ width: '10%' }}
          // uiTransform={{ width: 40, height: '100%', positionType: 'absolute', position: { left: 180 } }}
          textAlign="middle-center"
        />
      </UiEntity>

      {/* Player rows */}
      {topPlayers.map((player) => (
        <UiEntity
          key={player.address}
          uiTransform={{
            width: '100%',
            height: 22,
            margin: { top: 16 }
          }}
        >
          {/* Player name */}
          <Label
            value={player.name}
            fontSize={11}
            color={Color4.White()}
            uiTransform={{ width: '80%', margin: { left: 20 } }}
            textAlign="middle-left"
          />
          {/* Kills */}
          <Label
            value={`${player.kills}`}
            fontSize={11}
            color={Color4.Green()}
            uiTransform={{ width: '10%' }}
            textAlign="middle-center"
          />
          {/* Deaths */}
          <Label
            value={`${player.deaths}`}
            fontSize={11}
            color={Color4.Red()}
            uiTransform={{ width: '10%' }}
            textAlign="middle-center"
          />
        </UiEntity>
      ))}
    </UiEntity>
  )
}
