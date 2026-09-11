import ReactEcs, { Label, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { PlayerEquipment, PlayerHealth, PlayerMoney, PlayerTeam, PlayerInventory, Weapon } from './components'
import { getLocalPlayerEntity } from './client'
import { buyEquipment, canOpenBuyMenu, closeBuyMenu, isBuyMenuVisible } from './buy-client'
import { GUNS, gunProfile } from './weapon-profiles'
import { equipmentPrice } from './economy-rules'

const amber = Color4.create(1,.63,0,1)
export function BuyHud() {
  const player = getLocalPlayerEntity()
  if (player === null) return null
  const equipment = PlayerEquipment.getOrNull(player), health = PlayerHealth.getOrNull(player), money = PlayerMoney.getOrNull(player), weapon = Weapon.getOrNull(player), team = PlayerTeam.getOrNull(player)?.team
  if (!equipment || !health || !money || !weapon || !team) return null
  const inventory=PlayerInventory.getOrNull(player)
  const account = {money:money.amount,armor:health.armor,helmet:equipment.helmet,defuseKit:equipment.defuseKit,reserve:weapon.ammoReserve}
  return <UiEntity uiTransform={{positionType:'absolute',position:{left:24,top:'16%'},width:320,flexDirection:'column'}}>
    {equipment.defuseKit && <Label value="Defuse Kit" color={amber} fontSize={16} uiTransform={{width:320,height:25}} />}
    {canOpenBuyMenu() && !isBuyMenuVisible() && <Label value="Esc: Buy Equipment" color={amber} fontSize={16} uiTransform={{width:320,height:25}} />}
    {isBuyMenuVisible() && <UiEntity uiTransform={{width:320,flexDirection:'column',padding:14}} uiBackground={{color:Color4.create(.1,.12,.08,.85)}}>
      <Label value="Buy Equipment" color={amber} fontSize={22} uiTransform={{width:290,height:36}} />
      {[{item:'kevlar',label:'Kevlar Vest'},{item:'assaultsuit',label:'Kevlar Vest & Helmet'},...(team===2?[{item:'defusekit',label:'Defuse Kit'}]:[]),
        ...Object.values(GUNS).filter(gun=>!gun.team||gun.team===team).map(gun=>({item:'weapon:'+gun.id,label:gun.name})),
        {item:'ammo',label:'Primary Ammo'},{item:'secondaryammo',label:'Secondary Ammo'}].map(({item,label})=>{
        const gun=item.startsWith('weapon:')?gunProfile(item.slice(7)):undefined
        const ammo=inventory?.items.find(stored=>gunProfile(stored.id)?.slot===(item==='ammo'?'primary':'secondary'))
        const ammoGun=ammo&&gunProfile(ammo.id)
        const price=gun ? inventory?.items.some(stored=>stored.id===gun.id)?undefined:gun.price
          : item==='ammo'||item==='secondaryammo' ? ammo&&ammoGun&&(inventory?.active===ammo.id?weapon.ammoReserve:ammo.reserve)<ammoGun.reserve?ammoGun.ammoPrice:undefined
          : equipmentPrice(account,item,team)
        return <UiEntity key={item} onMouseDown={()=>buyEquipment(item)} uiTransform={{width:290,height:32}}>
          <Label value={`${label}    ${price === undefined ? 'Full' : '$'+price}`} color={price!==undefined&&money.amount>=price?amber:Color4.Gray()} fontSize={17} textAlign="middle-left" uiTransform={{width:290,height:32}} />
        </UiEntity>
      })}
      <UiEntity onMouseDown={closeBuyMenu} uiTransform={{width:290,height:32}}><Label value="Close" color={amber} fontSize={17} textAlign="middle-left" uiTransform={{width:290,height:32}} /></UiEntity>
    </UiEntity>}
  </UiEntity>
}
