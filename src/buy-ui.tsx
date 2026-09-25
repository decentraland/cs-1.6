import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { inputSystem, InputAction, PointerEventType } from '@dcl/sdk/ecs'
import { PlayerEquipment, PlayerHealth, PlayerMoney, PlayerTeam, PlayerInventory, Weapon } from './components'
import { getLocalPlayerEntity } from './client'
import { buyEquipment, canOpenBuyMenu, closeBuyMenu, isBuyMenuVisible, openBuyMenu } from './buy-client'
import { GunCategory, GunProfile, gunProfile, buyMenuGuns } from './weapon-profiles'
import { equipmentPrice } from './economy-rules'
import { ammoFillPrice } from './inventory-rules'
import { GRENADES } from './grenade-profiles'
import { grenadeCount } from './grenade-rules'
import { getMenuCursor } from './menu-state'
import { isTouchPlatform } from './platform'
import { ClassicTouchBuyMenu, clearTouchBuySelection } from './touch-buy-ui'
import { amber, isMenuButtonHovered, MenuButton, MenuFrame, MenuInfoPanel, menuLayout } from './menu-ui'

// CS 1.6 BuyMenu.res flow: a category list, then a submenu per category; 6/7 buy ammo directly.
type Category = 'root' | GunCategory | 'equipment'
interface BuyRow {
  label: string
  purchase?: boolean
  quickBuy?: boolean
  price?: number
  detail?: string
  position?: { left: number; top: number; width: number }
  enabled: boolean
  info: readonly string[]
  action: () => void
}
let category: Category = 'root'
let keyDown = false

const ROW_TOP = 116
const ROW_PITCH = 28

function money(value: number) {
  return `$${value}`
}

function gunInfo(gun: GunProfile): string[] {
  return [
    gun.name.toUpperCase(),
    '',
    `Price: ${money(gun.price)}`,
    `Clip: ${gun.clip}   Reserve: ${gun.reserve}`,
    `Damage: ${gun.damage}`,
    `Rate of fire: ${Math.round(60 / gun.fireRate)} rpm`,
    gun.pellets > 1
      ? `${gun.pellets} pellets per shell`
      : gun.id === 'awp' || gun.id === 'scout'
        ? 'Bolt-action'
        : gun.automatic
          ? 'Automatic fire'
          : 'Semi-automatic'
  ]
}

function buyRows(): BuyRow[] {
  const player = getLocalPlayerEntity()
  if (player === null) return []
  const equipment = PlayerEquipment.getOrNull(player),
    health = PlayerHealth.getOrNull(player),
    funds = PlayerMoney.getOrNull(player)?.amount ?? 0,
    weapon = Weapon.getOrNull(player),
    inventory = PlayerInventory.getOrNull(player),
    team = PlayerTeam.getOrNull(player)?.team ?? 0
  if (!equipment || !health || !weapon || !inventory) return []
  const account = {
    money: funds,
    armor: health.armor,
    helmet: equipment.helmet,
    defuseKit: equipment.defuseKit,
    nightVision: equipment.nightVision,
    reserve: weapon.ammoReserve
  }
  const priced = (label: string, price: number | undefined, info: readonly string[], action: () => void): BuyRow => ({
    label,
    purchase: true,
    price,
    enabled: price !== undefined && funds >= price,
    info: [
      ...info,
      ...(price === undefined
        ? ['', 'Already owned, full or unavailable.']
        : funds < price
          ? ['', 'Not enough money.']
          : [])
    ],
    action
  })
  const gunRow = (key: number, gun: GunProfile) =>
    priced(
      `${key} ${gun.name.toUpperCase()}`,
      inventory.items.some((stored) => stored.id === gun.id) ? undefined : gun.price,
      gunInfo(gun),
      () => buyEquipment('weapon:' + gun.id)
    )
  const ammoPrice = (slot: 'primary' | 'secondary') => {
    const stored = inventory.items.find((item) => gunProfile(item.id)?.slot === slot)
    const gun = stored && gunProfile(stored.id)
    if (!stored || !gun) return undefined
    const reserve = inventory.active === stored.id ? weapon.ammoReserve : stored.reserve
    return reserve < gun.reserve ? Math.max(gun.ammoPrice, ammoFillPrice(gun, reserve, funds)) : undefined
  }
  const back = (): BuyRow => ({
    label: '0 BACK',
    enabled: true,
    info: [],
    action: () => {
      category = 'root'
    }
  })
  const open = (label: string, next: Category, info: readonly string[]): BuyRow => ({
    label,
    enabled: true,
    info,
    action: () => {
      category = next
    }
  })
  if (category !== 'root' && category !== 'equipment')
    return [...buyMenuGuns(team, category).map((gun, index) => gunRow(index + 1, gun)), back()]
  if (category === 'equipment') {
    const helmetPrice = equipmentPrice(account, 'assaultsuit', team)
    const rows = [
      priced(
        '1 KEVLAR',
        equipmentPrice(account, 'kevlar', team),
        ['KEVLAR VEST', '', 'Price: $650', 'Protects the torso from bullets.'],
        () => buyEquipment('kevlar')
      ),
      priced(
        '2 KEVLAR+HELMET',
        helmetPrice,
        [
          'KEVLAR VEST & HELMET',
          '',
          helmetPrice === undefined ? 'Already equipped.' : `Price: ${money(helmetPrice)}`,
          'Adds head protection to the vest.'
        ],
        () => buyEquipment('assaultsuit')
      )
    ]
    for (const [index, id] of (['flashbang', 'hegrenade', 'smokegrenade'] as const).entries()) {
      const grenade = GRENADES[id]
      rows.push(
        priced(
          `${index + 3} ${grenade.name.toUpperCase()}`,
          grenadeCount(inventory, id) < grenade.capacity ? grenade.price : undefined,
          [
            grenade.name.toUpperCase(),
            '',
            `Price: ${money(grenade.price)}`,
            `Carry limit: ${grenade.capacity}`,
            'Hold fire to pull the pin; release to throw.'
          ],
          () => buyEquipment('grenade:' + id)
        )
      )
    }
    rows.push(
      priced(
        '6 NIGHTVISION',
        equipmentPrice(account, 'nightvision', team),
        ['NIGHTVISION', '', 'Price: $1250', 'Use the goggles button to toggle.'],
        () => buyEquipment('nightvision')
      )
    )
    if (team === 2)
      rows.push(
        priced(
          '7 DEFUSAL KIT',
          equipmentPrice(account, 'defusekit', team),
          ['DEFUSAL KIT', '', 'Price: $200', 'Defuses the C4 in 5 seconds instead of 10.'],
          () => buyEquipment('defusekit')
        )
      )
    if (team === 2) rows.push(priced('8 TACTICAL SHIELD', undefined, ['TACTICAL SHIELD', '', 'Price: $2200'], () => {}))
    return [...rows, back()]
  }
  return [
    open('1 PISTOLS', 'pistols', ['PISTOLS', '', 'Sidearms for both teams.']),
    open('2 SHOTGUNS', 'shotguns', ['SHOTGUNS', '', 'Pump-action and automatic shotguns.']),
    open('3 SUB-MACHINE GUNS', 'smgs', ['SUB-MACHINE GUNS', '', 'Close-range automatic weapons.']),
    open('4 RIFLES', 'rifles', ['RIFLES', '', 'Assault rifles and sniper rifles.']),
    open('5 MACHINE GUN', 'machineguns', ['MACHINE GUN', '', 'M249 light machine gun.']),
    priced(
      '6 PRIMARY AMMO',
      ammoPrice('primary'),
      ['PRIMARY AMMO', '', 'Buy as much primary ammo as you can afford.'],
      () => buyEquipment('ammo')
    ),
    priced(
      '7 SECONDARY AMMO',
      ammoPrice('secondary'),
      ['SECONDARY AMMO', '', 'Buy as much pistol ammo as you can afford.'],
      () => buyEquipment('secondaryammo')
    ),
    open('8 EQUIPMENT', 'equipment', ['EQUIPMENT', '', 'Armor, grenades and defusal kit.']),
    {
      label: 'AUTO BUY',
      purchase: true,
      quickBuy: true,
      enabled: true,
      detail: 'Rifle, ammo, armor; may replace primary',
      info: [
        'AUTO BUY',
        '',
        'Buy the default CS loadout you can afford.',
        'Rifle, ammo, defusal kit and armor.',
        'May replace your current primary weapon.'
      ],
      position: { left: 249, top: 116, width: 160 },
      action: () => buyEquipment('autobuy')
    },
    {
      label: 'REBUY',
      purchase: true,
      quickBuy: true,
      enabled: true,
      detail: 'Repeat previous equipment',
      info: [
        'REBUY',
        '',
        'Restore the equipment from your last purchase.',
        'Buys what you can afford.',
        'Keeps your current primary weapon.'
      ],
      position: { left: 249, top: 148, width: 160 },
      action: () => buyEquipment('rebuy')
    },
    {
      label: '0 CANCEL',
      enabled: true,
      info: [],
      action: closeBuyMenu,
      position: { left: 76, top: ROW_TOP + 8 * ROW_PITCH, width: 148 }
    }
  ]
}

// Keys 1-4 pick the matching row of the open list; the explorer has no 5-8/0 keys, those rows are click-only.
export function buyMenuInputSystem() {
  if (!isBuyMenuVisible()) {
    category = 'root'
    keyDown = false
    clearTouchBuySelection()
    return
  }
  if (isTouchPlatform()) return
  const keys = [InputAction.IA_ACTION_3, InputAction.IA_ACTION_4, InputAction.IA_ACTION_5, InputAction.IA_ACTION_6]
  if (!keys.some((key) => inputSystem.isPressed(key))) keyDown = false
  if (keyDown || inputSystem.isPressed(InputAction.IA_MODIFIER)) return
  const rows = buyRows()
  keys.forEach((key, index) => {
    if (keyDown || !inputSystem.isTriggered(key, PointerEventType.PET_DOWN)) return
    keyDown = true
    const row = rows[index]
    if (row?.enabled) row.action()
  })
}

export function BuyHud({ width, height, notice }: { width: number; height: number; notice?: string }) {
  const player = getLocalPlayerEntity()
  if (player === null) return null
  const equipment = PlayerEquipment.getOrNull(player)
  const funds = PlayerMoney.getOrNull(player)?.amount ?? 0
  const visible = isBuyMenuVisible()
  const layout = menuLayout(width, height)
  const cursor = getMenuCursor()
  const rows = visible ? buyRows() : []
  if (isTouchPlatform())
    return visible ? (
      <ClassicTouchBuyMenu
        width={width}
        height={height}
        title={`BUY${category === 'root' ? '' : ` / ${category.toUpperCase()}`}`}
        funds={funds}
        notice={notice}
        rows={rows}
        onClose={closeBuyMenu}
      />
    ) : null
  const buttons = rows.map((row, index) => ({
    label: row.label,
    detail: row.price === undefined ? undefined : money(row.price),
    left: layout.x(row.position?.left ?? 76),
    top: layout.y(row.position?.top ?? ROW_TOP + index * ROW_PITCH),
    width: layout.size(row.position?.width ?? 148),
    height: layout.size(20),
    size: layout.font,
    enabled: row.enabled,
    cursor,
    action: row.action
  }))
  const hovered = buttons.findIndex((props) => isMenuButtonHovered(props))
  const info = [`MONEY: ${money(funds)}`, '', ...(hovered >= 0 ? rows[hovered].info : [])]
  return (
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { left: 0, top: 0 }, width, height, pointerFilter: 'none' }}
    >
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { left: 24, top: '16%' },
          width: 320,
          flexDirection: 'column'
        }}
      >
        {equipment?.defuseKit && (
          <Label value="Defuse Kit" color={amber} fontSize={16} uiTransform={{ width: 320, height: 25 }} />
        )}
      </UiEntity>
      {canOpenBuyMenu() && !visible && (
        <UiEntity
          onMouseDown={openBuyMenu}
          uiTransform={{
            positionType: 'absolute',
            position: { left: width - 132, top: 104 },
            width: 110,
            height: 36,
            borderWidth: 1,
            borderColor: amber
          }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
        >
          <Label value="BUY" color={amber} fontSize={18} uiTransform={{ width: 110, height: 36 }} />
        </UiEntity>
      )}
      {visible && (
        <MenuFrame
          width={width}
          height={height}
          title="BUY"
          layout={layout}
          notice={notice}
          onBackdropClick={closeBuyMenu}
        >
          {buttons.map((props, index) => (
            <MenuButton key={String(index)} {...props} />
          ))}
          <MenuInfoPanel layout={layout} lines={info} top={category === 'root' ? 184 : undefined} />
        </MenuFrame>
      )}
    </UiEntity>
  )
}
