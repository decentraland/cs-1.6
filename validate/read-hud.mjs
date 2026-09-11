const digitX = [0,23,47,70,95,119,144,169,192,216]

export function readHud(state) {
 const groups=new Map()
 for(const value of Object.values(state)) {
  const uv=value.UiBackground?.uvs
  if(!uv||uv.length!==8||!value.UiTransform)continue
  const x=Math.round(uv[0]*256),y=Math.round((1-uv[3])*256)
  const width=Math.round((uv[4]-uv[0])*256),height=Math.round((uv[3]-uv[1])*256)
  const digit=digitX.indexOf(x)
  if(y!==0||width!==20||height!==25||digit<0)continue
  const parent=value.UiTransform.parent
  groups.set(parent,[...(groups.get(parent)??[]),{digit,left:value.UiTransform.positionLeft}])
 }
 const width=state['0']?.UiCanvasInformation?.width
 if(!width)return undefined
 const scale=Math.min(1,width/640)
 const at=(left)=>{
  const group=[...groups].find(([parent])=>Math.abs(state[parent]?.UiTransform?.positionLeft-left)<.1)
  if(!group)return undefined
  return Number(group[1].sort((a,b)=>a.left-b.left).map(d=>d.digit).join(''))
 }
 const timerX=(width-114*scale)/2
 const minutes=at(timerX+24*scale),seconds=at(timerX+74*scale)
 return {health:at(34*scale),armor:at(width/5+24*scale),clip:at(width-184*scale),reserve:at(width-102*scale),money:at(width-108*scale),seconds:minutes===undefined||seconds===undefined?undefined:minutes*60+seconds}
}
