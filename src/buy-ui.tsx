import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { inputSystem, InputAction, PointerEventType } from '@dcl/sdk/ecs'
import { PlayerEquipment, PlayerHealth, PlayerMoney, PlayerTeam, PlayerInventory, Weapon } from './components'
import { getLocalPlayerEntity } from './client'
import { buyEquipment, canOpenBuyMenu, closeBuyMenu, isBuyMenuVisible, openBuyMenu } from './buy-client'
import { isTouchPlatform } from './platform'
import { GUNS, GunProfile, gunProfile } from './weapon-profiles'
import { equipmentPrice } from './economy-rules'
import { getMenuCursor } from './menu-state'
import { amber, isMenuButtonHovered, MenuButton, MenuFrame, MenuInfoPanel, menuLayout } from './menu-ui'

// CS 1.6 BuyMenu.res flow: a category list, then a submenu per category; 6/7 buy ammo directly.
type Category = 'root' | 'pistols' | 'rifles' | 'equipment'
interface BuyRow {
  label: string
  price?: number
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
    gun.automatic ? 'Fully automatic' : 'Semi-automatic'
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
    reserve: weapon.ammoReserve
  }
  const priced = (label: string, price: number | undefined, info: readonly string[], action: () => void): BuyRow => ({
    label,
    price,
    enabled: price !== undefined && funds >= price,
    info,
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
    return reserve < gun.reserve ? gun.ammoPrice : undefined
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
  const locked = (label: string): BuyRow => ({
    label,
    enabled: false,
    info: ['Not available in this scene.'],
    action: () => {}
  })
  const guns = Object.values(GUNS).filter((gun) => !gun.team || gun.team === team)
  if (category === 'pistols')
    return [...guns.filter((gun) => gun.slot === 'secondary').map((gun, index) => gunRow(index + 1, gun)), back()]
  if (category === 'rifles')
    return [...guns.filter((gun) => gun.slot === 'primary').map((gun, index) => gunRow(index + 1, gun)), back()]
  if (category === 'equipment') {
    const rows = [
      priced(
        '1 KEVLAR',
        equipmentPrice(account, 'kevlar', team),
        ['KEVLAR VEST', '', 'Price: $650', 'Protects the torso from bullets.'],
        () => buyEquipment('kevlar')
      ),
      priced(
        '2 KEVLAR+HELMET',
        equipmentPrice(account, 'assaultsuit', team),
        ['KEVLAR VEST & HELMET', '', 'Price: $1000', 'Adds head protection to the vest.'],
        () => buyEquipment('assaultsuit')
      )
    ]
    if (team === 2)
      rows.push(
        priced(
          '3 DEFUSAL KIT',
          equipmentPrice(account, 'defusekit', team),
          ['DEFUSAL KIT', '', 'Price: $200', 'Defuses the C4 in 5 seconds instead of 10.'],
          () => buyEquipment('defusekit')
        )
      )
    return [...rows, back()]
  }
  return [
    open('1 PISTOLS', 'pistols', ['PISTOLS', '', 'Sidearms for both teams.']),
    locked('2 SHOTGUNS'),
    locked('3 SUB-MACHINE GUNS'),
    open('4 RIFLES', 'rifles', [
      'RIFLES',
      '',
      team === 1 ? 'AK-47 for the Terrorists.' : 'M4A1 for the Counter-Terrorists.'
    ]),
    locked('5 MACHINE GUN'),
    priced('6 PRIMARY AMMO', ammoPrice('primary'), ['PRIMARY AMMO', '', 'One magazine for your rifle.'], () =>
      buyEquipment('ammo')
    ),
    priced('7 SECONDARY AMMO', ammoPrice('secondary'), ['SECONDARY AMMO', '', 'One magazine for your pistol.'], () =>
      buyEquipment('secondaryammo')
    ),
    open('8 EQUIPMENT', 'equipment', ['EQUIPMENT', '', 'Armor and defusal kit.']),
    { label: '0 CANCEL', enabled: true, info: [], action: closeBuyMenu }
  ]
}

// Keys 1-4 pick the matching row of the open list; the explorer has no 5-8/0 keys, those rows are click-only.
export function buyMenuInputSystem() {
  if (!isBuyMenuVisible()) {
    category = 'root'
    keyDown = false
    return
  }
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

export function BuyHud({ width, height }: { width: number; height: number }) {
  const player = getLocalPlayerEntity()
  if (player === null) return null
  const equipment = PlayerEquipment.getOrNull(player)
  const funds = PlayerMoney.getOrNull(player)?.amount ?? 0
  const visible = isBuyMenuVisible()
  const layout = menuLayout(width, height)
  const cursor = getMenuCursor()
  const rows = visible ? buyRows() : []
  const buttons = rows.map((row, index) => ({
    label: row.label,
    detail: row.price === undefined ? undefined : money(row.price),
    left: layout.x(76),
    top: layout.y(ROW_TOP + index * ROW_PITCH),
    width: layout.size(148),
    height: layout.size(20),
    size: layout.font,
    enabled: row.enabled,
    cursor,
    action: row.action
  }))
  const hovered = buttons.findIndex((props) => isMenuButtonHovered(props))
  const info = [`MONEY: ${money(funds)}`, '', ...(hovered >= 0 ? rows[hovered].info : [])]
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { left: 0, top: 0 }, width: 0, height: 0 }}>
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
        {canOpenBuyMenu() && !visible && !isTouchPlatform() && (
          <Label value="Esc: Buy Equipment" color={amber} fontSize={16} uiTransform={{ width: 320, height: 25 }} />
        )}
        {canOpenBuyMenu() && !visible && isTouchPlatform() && (
          <UiEntity
            onMouseDown={openBuyMenu}
            uiTransform={{ width: 120, height: 36, borderWidth: 1, borderColor: amber }}
            uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
          >
            <Label value="BUY" color={amber} fontSize={18} uiTransform={{ width: 120, height: 36 }} />
          </UiEntity>
        )}
      </UiEntity>
      {visible && (
        <MenuFrame width={width} height={height} title="BUY" layout={layout} onBackdropClick={closeBuyMenu}>
          {buttons.map((props, index) => (
            <MenuButton key={String(index)} {...props} />
          ))}
          <MenuInfoPanel layout={layout} lines={info} />
        </MenuFrame>
      )}
    </UiEntity>
  )
}
