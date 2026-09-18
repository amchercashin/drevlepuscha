import type {BirdBehavior,ENH,ObstacleProxy,PreparedRoute,WildlifeObserver} from './types.ts';
import {distance} from './routes.ts';
/** Conservative proxy visibility, a bounded query supplied by the authority. */
export function blocksSight(a:ENH,b:ENH,box:ObstacleProxy){
 let lo=0,hi=1;for(const k of ['e','n','h'] as const){const d=b[k]-a[k];if(Math.abs(d)<1e-9){if(a[k]<box.min[k]||a[k]>box.max[k])return false;}else{const t0=(box.min[k]-a[k])/d,t1=(box.max[k]-a[k])/d;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)return false;}}
 return hi>.001&&lo<.999;
}
export function threats(point:ENH,observers:readonly WildlifeObserver[],bird:BirdBehavior,visible:(o:WildlifeObserver)=>boolean){
 let alert=false,flee=false;
 for(const o of [...observers].sort((a,b)=>a.id.localeCompare(b.id))){
  const d=Math.hypot(o.e-point.e,o.n-point.n),heading=o.headingDeg*Math.PI/180,closing=((point.e-o.e)*Math.sin(heading)+(point.n-o.n)*Math.cos(heading))*o.speedMps/Math.max(.01,d);
  const gain=o.running?bird.runningMultiplier:closing>1?1.1:1;
  if(d>bird.alertRadiusM*gain)continue;
  if(!o.running&&!visible(o))continue;
  alert=true;if(d<=bird.fleeRadiusM*gain)flee=true;
 }
 return {alert,flee};
}
export function safeRoutes(routes:readonly PreparedRoute[],observers:readonly WildlifeObserver[],bird:BirdBehavior){
 return routes.map(route=>{
  let safety=Infinity;
  for(const o of observers)for(const s of route.samples){
   if(s.distanceM<.5)continue;
   const d=distance(s.point,{e:o.e,n:o.n,h:o.h+1});safety=Math.min(safety,d);
  }
  return {route,safety};
 }).filter(r=>r.safety>=bird.observerClearanceM).sort((a,b)=>b.safety-a.safety||a.route.lengthM-b.route.lengthM||a.route.id.localeCompare(b.route.id));
}
