import type {BirdBehavior,HabitatCell,HabitatSite,PreparedRoute,WildlifeContentId,WildlifeEvent,WildlifeFrame,WildlifeLimits,WildlifePose,WildlifeStepInput} from './types.ts';
import {entityId,choice} from './ids.ts';
import {distance,routeHeading,sampleRoute} from './routes.ts';
import {blocksSight,safeRoutes,threats} from './perception.ts';
import {validateCell,enh,finite} from './habitat.ts';
export interface WildlifeWorldOptions {content:WildlifeContentId;authorityEpoch:string;seed:string;cells:ReadonlyMap<string,HabitatCell>;limits:WildlifeLimits;bird:BirdBehavior;}
interface Agent {pose:Extract<WildlifePose,{species:'woodland-bird'}>;cellId:string;site:HabitatSite;decision:number;threatSince:number|null;quietSince:number|null;farSince:number|null;}
/** The caller owns all clocks/timers. snapshot is a detached, side-effect-free read. */
export class WildlifeWorld {
 private readonly options:WildlifeWorldOptions;
 private readonly cells=new Map<string,HabitatCell>();private readonly agents=new Map<string,Agent>();
 private readonly dormant=new Map<string,{generation:number;nextMs:number}>();
 private pendingLeaves=new Set<string>();private recent:WildlifeEvent[]=[];private watermark=0;
 private time=0;private nextDecision=0;private disposed=false;
 private counters={decisionSteps:0,clockReconciliations:0,visibilityTests:0};
 constructor(options:WildlifeWorldOptions){
  this.options=structuredClone({...options,cells:undefined}) as unknown as WildlifeWorldOptions;
  for(const cell of [...options.cells.values()].sort((a,b)=>a.id.localeCompare(b.id)))this.enterCell(cell);
 }
 enterCell(cell:HabitatCell){
  if(this.disposed)throw Error('Wildlife world disposed');validateCell(cell,this.options.content.contentHash);
  this.pendingLeaves.delete(cell.id);
  if(this.cells.has(cell.id))return;
  if(this.cells.size>=this.options.limits.maxResidentCells)throw Error('Wildlife resident cell budget');
  this.cells.set(cell.id,structuredClone(cell));
 }
 leaveCell(id:string){
  if([...this.agents.values()].some(a=>a.cellId===id||a.pose.route?.cellId===id)){this.pendingLeaves.add(id);return false;}
  this.cells.delete(id);this.pendingLeaves.delete(id);return true;
 }
 private route(a:Agent):PreparedRoute|undefined{return a.pose.route?this.cells.get(a.pose.route.cellId)?.routes.find(r=>r.id===a.pose.route!.routeId):undefined;}
 private position(a:Agent,time:number){const r=this.route(a);if(!r)return {...a.pose.point};const d=a.pose.routeStartDistanceM+Math.max(0,time-a.pose.routeStartMs)*a.pose.speedMps/1000;return sampleRoute(r,d).point;}
 private retire(id:string,a:Agent,now:number){
  this.agents.delete(id);this.dormant.delete(id);this.dormant.set(id,{generation:a.pose.generation,nextMs:now+this.options.bird.cooldownMs});
  while(this.dormant.size>this.options.limits.maxDormantRecords)this.dormant.delete(this.dormant.keys().next().value!);
 }
 private decide(input:WildlifeStepInput,now:number,silent:boolean){
  const {limits,bird,seed,content}=this.options;let sightBudget=limits.maxVisibilityTestsPerStep;
  this.counters.decisionSteps++;
  // Stable iteration and independent per-agent choices. No quality/camera inputs.
  for(const cell of [...this.cells.values()].sort((a,b)=>a.id.localeCompare(b.id))){
   if(this.pendingLeaves.has(cell.id))continue;
   for(const site of [...cell.sites].sort((a,b)=>a.id.localeCompare(b.id))){
    if(site.species!=='woodland-bird')continue; // W4/W5 add their own typed FSMs.
    for(let slot=0;slot<site.maxResidents;slot++){
     const id=entityId(content.realmId,cell.id,site.id,slot),dormant=this.dormant.get(id);
     if(this.agents.has(id)||this.agents.size>=limits.maxActiveEntities||(dormant&&now<dormant.nextMs)||input.environment.daylight01<.2||input.environment.precipitation01>.6)continue;
     const nearest=Math.min(...input.observers.map(o=>Math.hypot(o.e-site.home.e,o.n-site.home.n)));
     if(nearest>limits.activeRadiusM||nearest<bird.alertRadiusM*2)continue;
     this.agents.set(id,{cellId:cell.id,site,decision:0,threatSince:null,quietSince:null,farSince:null,pose:{id,generation:(dormant?.generation??-1)+1,species:'woodland-bird',siteId:site.id,state:'perched',stateSinceMs:now,point:{...site.home},headingDeg:0,route:null,routeStartMs:now,routeStartDistanceM:0,speedMps:0,animationVariant:choice(seed,id,0,3)}});
    }
   }
  }
  for(const [id,a] of [...this.agents].sort(([a],[b])=>a.localeCompare(b))){
   const p=a.pose,cell=this.cells.get(a.cellId)!;p.point=this.position(a,now);
   const near=Math.min(...input.observers.map(o=>Math.hypot(o.e-p.point.e,o.n-p.point.n)));
   if(near>limits.exitRadiusM){a.farSince??=now;if(now-a.farSince>=limits.exitDelayMs){this.retire(id,a,now);continue;}}else a.farSince=null;
   if(p.route){
    const route=this.route(a)!;const travelled=p.routeStartDistanceM+Math.max(0,now-p.routeStartMs)*p.speedMps/1000;
    p.headingDeg=routeHeading(route,travelled);
    if(travelled>=route.lengthM){
     // Stay visibly at the end if someone is inspecting the refuge nearby.
     if(near>bird.alertRadiusM*1.5&&p.state!=='hidden'){p.state='hidden';p.stateSinceMs=now;}
     if(p.state==='hidden'&&now-p.stateSinceMs>=bird.cooldownMs)this.retire(id,a,now);
    }else if(now-p.stateSinceMs>=bird.takeoffMs&&p.state==='takeoff'){p.state='flying';p.stateSinceMs=now;}
    continue;
   }
   const threat=threats(p.point,input.observers,bird,o=>{
    if(sightBudget<=0)return true; // Conservative hearing/uncertainty, never unlimited raycasts.
    sightBudget--;this.counters.visibilityTests++;
    return !cell.obstacles.some(b=>b.id!==a.site.treeId&&blocksSight({...o,h:o.h+1.6},p.point,b));
   });
   if(threat.alert){
    a.quietSince=null;a.threatSince??=now;
    if(p.state==='perched'&&now-a.threatSince>=bird.confirmMs){p.state='alert';p.stateSinceMs=now;}
    if(p.state==='alert'&&threat.flee&&now-p.stateSinceMs>=bird.confirmMs){
     const candidates=safeRoutes(cell.routes.filter(r=>a.site.allowedRoutes.includes(r.id)),input.observers,bird);
     if(candidates.length){const best=candidates[0].safety,ties=candidates.filter(c=>c.safety===best),route=ties[choice(seed,id,++a.decision,ties.length)].route;
      p.state='takeoff';p.stateSinceMs=now;p.route={cellId:a.cellId,routeId:route.id};p.routeStartMs=now;p.routeStartDistanceM=0;p.speedMps=bird.speedMps;
      if(!silent){this.recent.push({seq:++this.watermark,entityId:id,entityGeneration:p.generation,kind:'bird-flush',atMs:now,position:{...p.point},cueVariant:choice(seed,id,a.decision,3)});}
     }
    }
   }else {a.threatSince=null;a.quietSince??=now;if(p.state==='alert'&&now-a.quietSince>=bird.recoverMs){p.state='perched';p.stateSinceMs=now;}}
  }
  for(const id of [...this.pendingLeaves])this.leaveCell(id);
 }
 advance(input:WildlifeStepInput){
  if(this.disposed)throw Error('Wildlife world disposed');
  if(!finite(input.simMs)||input.simMs<this.time||input.simMs<0||input.observers.length>6||!Object.values(input.environment).every(finite)||input.observers.some(o=>!enh(o)||!finite(o.speedMps)||o.speedMps<0||!finite(o.headingDeg)||typeof o.running!=='boolean'))throw Error('Invalid wildlife step');
  const {decisionStepMs:step,maxCatchUpSteps:cap}=this.options.limits;
  const due=Math.max(0,Math.floor((input.simMs-this.nextDecision)/step)+1);
  if(due>cap){this.counters.clockReconciliations++;this.recent=[];this.decide(input,input.simMs,true);this.nextDecision=(Math.floor(input.simMs/step)+1)*step;}
  else for(let i=0;i<due;i++){this.decide(input,this.nextDecision,false);this.nextDecision+=step;}
  this.time=input.simMs;
  this.recent=this.recent.filter(e=>input.simMs-e.atMs<=this.options.limits.eventLifetimeMs).slice(-this.options.limits.maxRecentEvents);
 }
 snapshot():WildlifeFrame{
  return structuredClone({v:1,authorityEpoch:this.options.authorityEpoch,content:this.options.content,seq:Math.floor(this.time),simMs:this.time,eventWatermark:this.watermark,entities:[...this.agents.values()].sort((a,b)=>a.pose.id.localeCompare(b.pose.id)).map(a=>({...a.pose,point:this.position(a,this.time)})),recentEvents:this.recent});
 }
 stats(){return {...this.counters,activeEntities:this.agents.size,residentCells:this.cells.size,dormantRecords:this.dormant.size,pendingLeaves:this.pendingLeaves.size};}
 /** Explicit exit to solo: retain visible poses, reset perception memory and event history. */
 restoreVisible(frame:WildlifeFrame){
  if(this.agents.size||frame.content.contentHash!==this.options.content.contentHash)throw Error('Cannot restore incompatible wildlife');
  this.time=frame.simMs;this.nextDecision=(Math.floor(this.time/this.options.limits.decisionStepMs)+1)*this.options.limits.decisionStepMs;
  for(const pose of frame.entities){if(pose.species!=='woodland-bird')continue;
   const cell=[...this.cells.values()].find(c=>c.sites.some(s=>s.id===pose.siteId));const site=cell?.sites.find(s=>s.id===pose.siteId);
   if(!cell||!site)throw Error('Unknown restored wildlife site');
   this.agents.set(pose.id,{pose:structuredClone(pose),cellId:cell.id,site,decision:1,threatSince:null,quietSince:null,farSince:null});
  }
 }
 dispose(){this.disposed=true;this.cells.clear();this.agents.clear();this.dormant.clear();this.pendingLeaves.clear();this.recent=[];}
}
