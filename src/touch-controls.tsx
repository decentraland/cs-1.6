import { canHandleWeapons } from './round-rules'
import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { engine, InputAction, UiCanvasInformation } from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'
import { Color4 } from '@dcl/sdk/math'
import { getLocalPlayerEntity, isSyncStale } from './client'
import { Dead, PlayerHealth, PlayerInventory, Weapon } from './components'
import { canOpenBuyMenu, isBuyMenuVisible, openBuyMenu } from './buy-client'
import {
  dropCombatWeapon,
  hasBombSelected,
  selectCombatBomb,
  selectCombatSlot,
  getLocalDefuseState
} from './bomb-client'
import { getBomb } from './bomb'
import { getPractice } from './practice'
import { isTeamMenuOpen, spectatorMenu, touchOptions } from './menu-state'
import { isTouchPlatform } from './platform'
import { isDeathTransitioning, isSpectating } from './spectator'
import { gunProfile, profileByName } from './weapon-profiles'
import { grenadeProfile } from './grenade-profiles'
import { amber } from './menu-ui'
import { isTouchControlPressed, setTouchControlPressed } from './combat-input'
import { TouchIcon, TouchIconName, touchIconBackground } from './touch-icons'
import { nightVisionStatus, toggleNightVision } from './nightvision-client'
import { NightVisionAdjustButton } from './nightvision-ui'
import { touchControlLayout } from './touch-layout'

interface TouchButtonProps {
  key?: string
  label: string
  icon: TouchIconName
  left: number
  top: number
  width: number
  height: number
  enabled?: boolean
  selected?: boolean
  color?: Color4
  actions?: InputAction[]
  action?: () => void
}

export function TouchButton(props: TouchButtonProps) {
  const enabled = props.enabled !== false
  const selected = props.selected || isTouchControlPressed(props.label)
  const color = !enabled
    ? Color4.create(1, 1, 1, 0.25)
    : (props.color ?? (selected ? amber : Color4.create(1, 1, 1, 0.85)))
  const release = () => {
    if (props.actions) setTouchControlPressed(props.label, props.actions, false)
  }
  return (
    <UiEntity
      key={props.label}
      onMouseDown={() => {
        if (!enabled) return
        if (props.actions) setTouchControlPressed(props.label, props.actions, true)
        props.action?.()
      }}
      onMouseUp={release}
      onMouseLeave={release}
      uiInputBinding={{ actions: enabled ? (props.actions ?? []) : [] }}
      uiTransform={{
        positionType: 'absolute',
        position: { left: props.left, top: props.top },
        width: props.width,
        height: props.height,
        pointerFilter: 'block',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      uiBackground={touchIconBackground('circle', color)}
    >
      <TouchIcon icon={props.icon} size={Math.min(props.width, props.height) * 0.64} color={color} />
    </UiEntity>
  )
}

export function TouchControls(props: { width: number; height: number; scores: boolean; toggleScores: () => void }) {
  if (!isTouchPlatform() || isTeamMenuOpen() || isBuyMenuVisible()) {
    touchOptions.open = false
    return null
  }
  const player = getLocalPlayerEntity(),
    match = getPractice()
  if (player === null || !match) return null
  const weapon = Weapon.getOrNull(player),
    inventory = PlayerInventory.getOrNull(player)
  if (!weapon || !inventory) return null
  const profile = profileByName(weapon.name),
    bomb = getBomb(),
    selectedBomb = hasBombSelected()
  const defuse = getLocalDefuseState()
  const alive = !Dead.has(player) && (PlayerHealth.getOrNull(player)?.current ?? 0) > 0
  const observing = isSpectating() && !isDeathTransitioning()
  const enabled = alive && !isSyncStale() && canHandleWeapons(match)
  const layout = touchControlLayout(
    props.width,
    props.height,
    UiCanvasInformation.getOrNull(engine.RootEntity)?.screenInsetArea
  )
  const s = layout.scale,
    right = layout.left + layout.width,
    bottom = layout.top + layout.height
  const portrait = layout.portrait
  const button = (
    label: string,
    icon: TouchIconName,
    left: number,
    top: number,
    size: number,
    extra: Partial<TouchButtonProps> = {}
  ) => (
    <TouchButton
      key={label}
      label={label}
      icon={icon}
      left={left}
      top={top}
      width={size * s}
      height={size * s}
      {...extra}
    />
  )
  const slots = [
    {
      label: 'PRIMARY',
      icon: 'rifle' as const,
      slot: 'primary',
      enabled: inventory.items.some((item) => gunProfile(item.id)?.slot === 'primary')
    },
    {
      label: 'PISTOL',
      icon: 'pistol' as const,
      slot: 'secondary',
      enabled: inventory.items.some((item) => gunProfile(item.id)?.slot === 'secondary')
    },
    { label: 'KNIFE', icon: 'knife' as const, slot: 'melee', enabled: true },
    {
      label: 'GRENADE',
      icon: 'grenade' as const,
      slot: 'grenade',
      enabled: inventory.items.some((item) => !!grenadeProfile(item.id) && item.reserve > 0)
    }
  ].filter((slot) => slot.enabled)
  const carriesBomb = bomb?.carrier === myProfile.userId?.toLowerCase()
  const slotCount = slots.length + (carriesBomb ? 1 : 0)
  const slotWidth = 56 * s,
    slotGap = 8 * s
  const slotSpan = slotCount * (slotWidth + slotGap) - slotGap
  const slotLeft = layout.left + (layout.width - slotSpan) / 2
  const slotTop = bottom - (portrait ? 304 : 72) * s
  const options = touchOptions.open
  const closeOptions = (action: () => void) => () => {
    touchOptions.open = false
    action()
  }
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', width: props.width, height: props.height, pointerFilter: 'none' }}
    >
      {button('OPTIONS', options ? 'close' : 'scores', right - 68 * s, layout.top + 28 * s, 56, {
        selected: options,
        action: () => {
          touchOptions.open = !touchOptions.open
        }
      })}
      {alive &&
        !isSyncStale() &&
        canOpenBuyMenu() &&
        button('BUY', 'buy', right - 132 * s, layout.top + 28 * s, 56, { action: openBuyMenu })}
      {options && (
        <UiEntity
          uiTransform={{ positionType: 'absolute', width: props.width, height: props.height, pointerFilter: 'none' }}
        >
          {button('SCORES', 'scores', right - 132 * s, layout.top + 92 * s, 56, {
            selected: props.scores,
            action: closeOptions(props.toggleScores)
          })}
          {button('TEAM', 'team', right - 68 * s, layout.top + 92 * s, 56, {
            action: closeOptions(() => {
              spectatorMenu.open = true
            })
          })}
          {enabled &&
            (selectedBomb || profile.kind === 'gun') &&
            button('DROP', 'drop', right - 132 * s, layout.top + 156 * s, 56, {
              action: closeOptions(dropCombatWeapon)
            })}
          {nightVisionStatus().available &&
            button('NIGHTVISION', 'nightvision', right - 68 * s, layout.top + 156 * s, 56, {
              action: toggleNightVision,
              selected: nightVisionStatus().on
            })}
          <NightVisionAdjustButton direction={-1} left={right - 132 * s} top={layout.top + 220 * s} size={56 * s} />
          <NightVisionAdjustButton direction={1} left={right - 68 * s} top={layout.top + 220 * s} size={56 * s} />
        </UiEntity>
      )}
      {enabled && !options && (
        <UiEntity
          uiTransform={{ positionType: 'absolute', width: props.width, height: props.height, pointerFilter: 'none' }}
        >
          {defuse !== 'none' &&
            button('DEFUSE\nHOLD', 'defuse', right - 68 * s, layout.top + 92 * s, 56, {
              actions: [InputAction.IA_PRIMARY],
              color: defuse === 'ready' ? Color4.create(0.2, 1, 0.35, 1) : undefined
            })}
          {slots.map((slot, index) => (
            <TouchButton
              key={slot.slot}
              label={slot.label}
              icon={slot.icon}
              left={slotLeft + index * (slotWidth + slotGap)}
              top={slotTop}
              width={slotWidth}
              height={slotWidth}
              enabled={slot.enabled}
              selected={
                !selectedBomb &&
                (slot.slot === 'melee'
                  ? profile.kind === 'knife'
                  : slot.slot === 'grenade'
                    ? profile.kind === 'grenade'
                    : profile.kind === 'gun' && profile.slot === slot.slot)
              }
              action={() => selectCombatSlot(slot.slot)}
            />
          ))}
          {carriesBomb && (
            <TouchButton
              label="C4"
              icon="bomb"
              left={slotLeft + slots.length * (slotWidth + slotGap)}
              top={slotTop}
              width={slotWidth}
              height={slotWidth}
              selected={selectedBomb}
              action={selectCombatBomb}
            />
          )}
        </UiEntity>
      )}
      {observing && !options && (
        <UiEntity
          uiTransform={{ positionType: 'absolute', width: props.width, height: props.height, pointerFilter: 'none' }}
        >
          {button('NEXT', 'next', right - 88 * s, bottom - 224 * s, 72, { actions: [InputAction.IA_ACTION_6] })}
          {button('PREVIOUS', 'previous', right - 168 * s, bottom - 224 * s, 72, {
            actions: [InputAction.IA_ACTION_6, InputAction.IA_MODIFIER]
          })}
        </UiEntity>
      )}
    </UiEntity>
  )
}
