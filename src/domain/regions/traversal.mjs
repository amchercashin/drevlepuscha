import {nearestOnLine} from '../geography.mjs';
export function surfaceAt(geo, terrain, e, n, context) {
  const ground=terrain(e,n);
  if(context.mode==='boat')return {height:geo.waterAt(e,n,context.water)?.level??ground,supportId:'water'};
  for(const bridge of geo.bridges){
    const q=nearestOnLine(e,n,bridge.points);
    if(q.distance>bridge.widthM/2-.3)continue;
    if(context.supportId===bridge.id||Math.abs(context.height-bridge.deckHeightM)<.4)
      return {height:bridge.deckHeightM,supportId:bridge.id};
  }
  return {height:ground,supportId:'terrain'};
}
export function barrierAt(geo,e,n,gateOpen=true){
  for(const hedge of geo.source.hedges){
    if(nearestOnLine(e,n,hedge.points).distance>hedge.widthM/2+.28)continue;
    if(gateOpen&&hedge.openings.some(o=>Math.hypot(e-o.point[0],n-o.point[1])<o.widthM/2-.28))continue;
    return true;
  }
  return false;
}
