import {enh,finite,label,record,validatePackage} from '../domain/wildlife/habitat.ts';
import {entityId} from '../domain/wildlife/ids.ts';
import type {WildlifeContentId,WildlifeFrame,WildlifePackage} from '../domain/wildlife/types.ts';
export const WILDLIFE_MAX_BYTES=32768;
export const wildlifeCapability=(identity:WildlifeContentId)=>({name:'wildlife-v1',...identity});
export function sameCapability(value:unknown,identity:WildlifeContentId|undefined){
 if(!identity)return value===undefined;
 return record(value)&&value.name==='wildlife-v1'&&value.realmId===identity.realmId&&value.contentHash===identity.contentHash&&value.behaviorVersion===identity.behaviorVersion;
}
export const frameBytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
export type WildlifeWire=ReturnType<typeof wireFrame>;
type JSONData=null|boolean|number|string|JSONData[]|{[key:string]:JSONData};
/** The transport's JSON constraint requires mutable arrays and structural records. */
export function wireFrame(frame:WildlifeFrame|null):{[key:string]:JSONData}{return JSON.parse(JSON.stringify(frame??{}));}
const integer=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0;
const states={
 'woodland-bird':['perched','alert','takeoff','flying','hidden'],
 'red-squirrel':['forage','alert','ground-bound','mount','climb','trunk-idle','hidden'],
 'roe-deer':['graze','alert','walk-away','flee','recover','hidden'],
};
export function frameValidator(data:WildlifePackage){
 validatePackage(data);
 const cells=new Map(data.cells.map(c=>[c.id,c])),ids=new Map(data.cells.flatMap(c=>c.sites.flatMap(s=>Array.from({length:s.maxResidents},(_,i)=>[entityId(data.identity.realmId,c.id,s.id,i),{site:s,cell:c}]))));
 return (value:unknown):value is WildlifeFrame=>{
  try{
   if(!record(value)||frameBytes(value)>WILDLIFE_MAX_BYTES||value.v!==1||!label(value.authorityEpoch)||!record(value.content)||!sameCapability({name:'wildlife-v1',...value.content},data.identity)||!integer(value.seq)||!finite(value.simMs)||value.simMs<0||!integer(value.eventWatermark)||!Array.isArray(value.entities)||value.entities.length>data.limits.maxActiveEntities||!Array.isArray(value.recentEvents)||value.recentEvents.length>data.limits.maxRecentEvents)return false;
   const seen=new Set<string>();
   for(const e of value.entities){
    if(!record(e)||!label(e.id)||seen.has(e.id)||!ids.has(e.id)||!integer(e.generation)||!enh(e.point)||!finite(e.headingDeg)||Math.abs(e.headingDeg)>360||!finite(e.speedMps)||e.speedMps<0||e.speedMps>30||!finite(e.stateSinceMs)||e.stateSinceMs<0||e.stateSinceMs>value.simMs||!finite(e.routeStartMs)||e.routeStartMs<0||e.routeStartMs>value.simMs||!finite(e.routeStartDistanceM)||e.routeStartDistanceM<0||!integer(e.animationVariant)||Number(e.animationVariant)>15)return false;
    const {site}=ids.get(e.id)!;if(site.id!==e.siteId||site.species!==e.species||!states[site.species].includes(String(e.state)))return false;
    if(e.route!==null){
     if(!record(e.route)||!label(e.route.cellId)||!label(e.route.routeId))return false;
     const ref=e.route,point=e.point,r=cells.get(ref.cellId as string)?.routes.find(r=>r.id===ref.routeId);
     if(!r||!site.allowedRoutes.includes(r.id)||e.route.cellId!==site.cellId||e.routeStartDistanceM>r.lengthM)return false;
     if((['e','n','h'] as const).some(k=>point[k]<r.bounds.min[k]-.01||point[k]>r.bounds.max[k]+.01))return false;
    }else if(e.speedMps!==0||Math.hypot(e.point.e-site.home.e,e.point.n-site.home.n,e.point.h-site.home.h)>.01)return false;
    seen.add(e.id);
   }
   let last=0;
   for(const e of value.recentEvents){
    if(!record(e)||!integer(e.seq)||Number(e.seq)<=last||Number(e.seq)>Number(value.eventWatermark)||!label(e.entityId)||!ids.has(e.entityId)||!integer(e.entityGeneration)||!['bird-flush','squirrel-scramble','deer-startle'].includes(String(e.kind))||!finite(e.atMs)||e.atMs<0||e.atMs>value.simMs||value.simMs-e.atMs>data.limits.eventLifetimeMs||!enh(e.position)||!integer(e.cueVariant)||Number(e.cueVariant)>15)return false;
    const kind={'woodland-bird':'bird-flush','red-squirrel':'squirrel-scramble','roe-deer':'deer-startle'}[ids.get(e.entityId)!.site.species];if(e.kind!==kind)return false;last=Number(e.seq);
   }
   return true;
  }catch{return false;}
 };
}
