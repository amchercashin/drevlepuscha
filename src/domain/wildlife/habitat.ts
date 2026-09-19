import type {ENH,HabitatCell,WildlifePackage} from './types.ts';
import {distance} from './routes.ts';
export const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
export const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
export const label=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&x.length<=160;
export const enh=(x:unknown):x is ENH=>record(x)&&['e','n','h'].every(k=>finite(x[k])&&Math.abs(x[k] as number)<1e8);
const list=(x:unknown,max:number):x is unknown[]=>Array.isArray(x)&&x.length<=max;
const natural=(x:unknown)=>Number.isSafeInteger(x)&&Number(x)>=0;
const strings=(x:unknown,max:number)=>list(x,max)&&x.every(label)&&new Set(x).size===x.length;
const bounds=(x:unknown)=>{if(!record(x)||!enh(x.min)||!enh(x.max))return false;const {min,max}=x;return (['e','n','h'] as const).every(k=>min[k]<=max[k]);};
function fail(reason:string):never{throw Error(`Invalid wildlife content: ${reason}`);}
export function validateCell(value:unknown,hash:string):asserts value is HabitatCell{
 if(!record(value)||!label(value.id)||value.contentHash!==hash||!list(value.sites,64)||!list(value.routes,256)||!strings(value.neighbors,16)||!list(value.obstacles,2048))fail('cell header/limits/hash');
 const routes=new Map<string,Record<string,unknown>>();
 for(const r of value.routes){
  if(!record(r)||!label(r.id)||routes.has(r.id)||!['ground','flight','mount-trunk','climb','refuge'].includes(String(r.kind))||!label(r.from)||!label(r.to)||!finite(r.lengthM)||r.lengthM<=0||!finite(r.clearanceM)||r.clearanceM<=0||!finite(r.maxSlopeDeg)||r.maxSlopeDeg<0||r.maxSlopeDeg>90||!bounds(r.bounds)||!list(r.samples,4096)||r.samples.length<2)fail('route');
  let length=0,previous:ENH|undefined;
  for(const [i,s] of r.samples.entries()){
   if(!record(s)||!enh(s.point)||!finite(s.distanceM)||!list(s.normal,3)||s.normal.length!==3||!s.normal.every(finite)||Math.abs(Math.hypot(...s.normal)-1)>.001)fail('route sample');
   if(previous){const segment=distance(previous,s.point);if(segment<1e-6)fail('zero segment');length+=segment;}
   if(Math.abs(s.distanceM-length)>1e-5||(i===0&&s.distanceM!==0))fail('arc length');
   const b=r.bounds as {min:ENH;max:ENH},p=s.point;if((['e','n','h'] as const).some(k=>p[k]<b.min[k]-1e-6||p[k]>b.max[k]+1e-6))fail('route bounds');
   previous=s.point;
  }
  if(Math.abs(length-r.lengthM)>1e-5)fail('route length');routes.set(r.id,r);
  if(r.motion!==undefined){if(!list(r.motion,16)||r.motion.length<2)fail('route motion');let time=-1,metres=-1;for(const [i,k] of r.motion.entries()){if(!record(k)||!finite(k.atMs)||!finite(k.distanceM)||k.atMs<=time||k.distanceM<metres||k.distanceM>length+1e-5||!['ground-bound','mount','climb','trunk-idle','walk-away','flee','recover'].includes(String(k.state))||(i===0&&(k.atMs!==0||k.distanceM!==0)))fail('motion key');time=k.atMs;metres=k.distanceM;}if(Math.abs(metres-length)>1e-5)fail('motion endpoint');}
 }
 const sites=new Set<string>();
 for(const s of value.sites){
  if(!record(s)||!label(s.id)||sites.has(s.id)||s.cellId!==value.id||!['woodland-bird','red-squirrel','roe-deer'].includes(String(s.species))||!enh(s.home)||!strings(s.allowedRoutes,16)||!strings(s.refuges,16)||!strings(s.tags,16)||!natural(s.maxResidents)||Number(s.maxResidents)<1||Number(s.maxResidents)>4||(s.treeId!==undefined&&!label(s.treeId)))fail('site');
  for(const id of s.allowedRoutes as string[]){const route=routes.get(id);if(!route||route.from!==s.id||!(s.refuges as string[]).includes(String(route.to)))fail('site route/refuge');if(route.motion){const allowed=s.species==='red-squirrel'?['ground-bound','mount','climb','trunk-idle']:s.species==='roe-deer'?['walk-away','flee','recover']:[];if((route.motion as {state:string}[]).some(k=>!allowed.includes(k.state)))fail('species motion');}const first=(route.samples as {point:ENH}[])[0].point;if(distance(first,s.home)>1e-5)fail('route discontinuity');}
  if(!(s.allowedRoutes as string[]).length)fail('no escape route');sites.add(s.id);
 }
 for(const o of value.obstacles)if(!record(o)||!label(o.id)||!bounds(o))fail('obstacle proxy');
}
export function validatePackage(value:unknown):asserts value is WildlifePackage{
 if(!record(value)||!record(value.identity)||!label(value.identity.realmId)||!/^([a-f0-9]{64})$/.test(String(value.identity.contentHash))||value.identity.behaviorVersion!==1||!list(value.cells,216)||!record(value.limits)||!record(value.bird))fail('package');
 const l=value.limits;
 for(const key of ['maxActiveEntities','decisionStepMs','maxCatchUpSteps','maxRecentEvents','maxVisibilityTestsPerStep','maxResidentCells','maxDormantRecords','activeRadiusM','exitRadiusM','exitDelayMs','eventLifetimeMs'])if(!natural(l[key])||Number(l[key])<1)fail(`limit ${key}`);
 if(Number(l.maxActiveEntities)>24||Number(l.maxCatchUpSteps)>2||Number(l.maxRecentEvents)>32||Number(l.maxResidentCells)>216||Number(l.maxDormantRecords)>384||Number(l.maxVisibilityTestsPerStep)>128||l.decisionStepMs!==200||Number(l.activeRadiusM)>Number(l.exitRadiusM))fail('safety caps');
 for(const key of ['alertRadiusM','fleeRadiusM','runningMultiplier','confirmMs','recoverMs','takeoffMs','speedMps','observerClearanceM','cooldownMs'])if(!finite(value.bird[key])||Number(value.bird[key])<=0)fail(`bird ${key}`);
 const ids=new Set<string>();for(const cell of value.cells){validateCell(cell,String(value.identity.contentHash));if(ids.has(cell.id))fail('duplicate cell');ids.add(cell.id);}
 if(value.treeBindings!==undefined){if(!list(value.treeBindings,1024))fail('tree bindings');const trees=new Set<string>();for(const t of value.treeBindings){if(!record(t)||!label(t.id)||!label(t.familyId)||!label(t.assetVersion)||trees.has(t.id))fail('tree binding');trees.add(t.id);}}
}
