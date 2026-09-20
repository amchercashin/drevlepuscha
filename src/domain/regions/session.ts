import {distance,lineLength} from './authoring-core.mjs';
import {barrierAt} from './traversal.mjs';

export type WaterState='low'|'normal'|'high';
export interface Position {e:number;n:number;}
export interface Boat extends Position {id:string;heading:number;occupied:boolean;revision:number;}
export interface RegionPlayer extends Position {height:number;heading:number;mode:'walk'|'boat';supportId:string;water:WaterState;boatId:string|null;}
export interface Encounter {id:string;seed:number;truth:'lodging'|'help'|'scouting';intent:string;phase:'travelling'|'waiting'|'resolved';distanceM:number;offsetM:number;route:number[][];clues:string[];outcome:string|null;revision:number;createdAt:number;}
export interface RegionSave {schema:1;regionId:string;contentVersion:string;seed:number;revision:number;clock:number;gateOpen:boolean;knownPlaces:string[];player:RegionPlayer;boats:Boat[];encounter:Encounter;}
export function alongRoute(points:number[][],distanceM:number):Position {
 let left=Math.max(0,distanceM);
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=distance(a,b);if(left<=length){const t=left/length;return {e:a[0]+(b[0]-a[0])*t,n:a[1]+(b[1]-a[1])*t};}left-=length;}
 const p=points.at(-1)!;return {e:p[0],n:p[1]};
}
export function createEncounter(source:any):Encounter {
 const truth=(['lodging','help','scouting'] as const)[Math.abs(source.worldSeed)%3];
 const edge=(id:string)=>source.topology.edges.find((e:any)=>e.id===id).points as number[][];
 const route=truth==='lodging'?[...edge('grove-inn')].reverse():truth==='help'?[...edge('inn-lower-bank'),...edge('lower-cove').slice(1)]:edge('inn-lower-bank');
 return {id:'traveller-left-road',seed:source.worldSeed,truth,intent:{lodging:'Ищет тихий ночлег у рощи',help:'Ищет потерянного спутника у заводи',scouting:'Разведывает обходную переправу'}[truth],phase:'travelling',distanceM:65,offsetM:0,route:structuredClone(route),clues:[],outcome:null,revision:0,createdAt:0};
}
/** One authority owns boats, encounter and revisions. Streaming never owns this state. */
export class RegionSession {
 state:RegionSave;
 geo:any;
 constructor(geo:any,contentVersion:string){
  this.geo=geo;
  const source=geo.source;
  this.state={schema:1,regionId:source.regionId,contentVersion,seed:source.worldSeed,revision:0,clock:0,gateOpen:true,knownPlaces:source.pois.filter((p:any)=>!/LANDING|SHELTER|COVE/.test(p.id)).map((p:any)=>p.id),
   player:{e:-220,n:-105,height:geo.height(-220,-105),heading:75,mode:'walk',supportId:'terrain',water:'normal',boatId:null},
   boats:['lower-boat','upper-boat'].map((id,i)=>({...this.dock(id,i===0?0:1,'normal').boat,id,heading:0,occupied:false,revision:0})),encounter:createEncounter(source)};
 }
 discover(visible:(e:number,n:number)=>boolean){
  const p=this.state.player,candidates=[...this.geo.source.pois.map((x:any)=>({id:x.id,e:x.point[0],n:x.point[1]})),...this.state.boats];
  for(const x of candidates)if(!this.state.knownPlaces.includes(x.id)&&Math.hypot(x.e-p.e,x.n-p.n)<35&&visible(x.e,x.n)){this.state.knownPlaces.push(x.id);this.state.revision++;}
 }
 dock(id:string,side:number,water:WaterState){
  const edge=this.geo.source.topology.edges.find((e:any)=>e.id===id),a=edge.points[side],b=edge.points[1-side],len=distance(a,b);
  let shore:Position={e:a[0],n:a[1]};
  for(let d=0;d<len/2;d+=.2){const p={e:a[0]+(b[0]-a[0])*d/len,n:a[1]+(b[1]-a[1])*d/len},depth=this.geo.waterAt(p.e,p.n,water)?.depth??0;
   if(depth<=.28)shore=p;
   if(depth>.45)return {shore,boat:p};
  }
  throw Error('No navigable landing '+id);
 }
 canFloat(p:Position,water:WaterState,heading=0,blocked=(e:number,n:number)=>false){
  const a=heading*Math.PI/180;
  for(const [forward,side] of [[0,0],[1.6,0],[-1.6,0],[0,.6],[0,-.6]]){
   const e=p.e+Math.sin(a)*forward+Math.cos(a)*side,n=p.n+Math.cos(a)*forward-Math.sin(a)*side,w=this.geo.waterAt(e,n,water),b=this.geo.source.playBounds;
   if(e<b.minE+2||e>b.maxE-2||n<b.minN+2||n>b.maxN-2||!w||w.depth<.18||blocked(e,n))return false;
  }return true;
 }
 board(id:string){
  const {player:p,boats}=this.state,b=boats.find(b=>b.id===id);
  if(!b||p.mode!=='walk'||b.occupied||Math.hypot(p.e-b.e,p.n-b.n)>5||!this.canFloat(b,p.water,b.heading))return false;
  b.occupied=true;b.revision++;Object.assign(p,{e:b.e,n:b.n,height:this.geo.waterAt(b.e,b.n,p.water).level+.2,mode:'boat',boatId:b.id,supportId:b.id});this.state.revision++;return true;
 }
 row(de:number,dn:number,ready:(e:number,n:number)=>boolean,blocked:(e:number,n:number)=>boolean){
  const p=this.state.player,b=this.state.boats.find(b=>b.id===p.boatId);if(!b||!b.occupied||p.mode!=='boat')return;
  const length=Math.hypot(de,dn);if(!length)return;const steps=Math.ceil(length/.12),heading=Math.atan2(de,dn)*180/Math.PI;
  for(let i=0;i<steps;i++){const next={e:b.e+de/steps,n:b.n+dn/steps};if(!ready(next.e,next.n)||!this.canFloat(next,p.water,heading,blocked))break;Object.assign(b,next,{heading});}
  Object.assign(p,{e:b.e,n:b.n,heading:b.heading,height:(this.geo.waterAt(b.e,b.n,p.water)?.level??p.height)+.2});b.revision++;this.state.revision++;
 }
 landing(ready:(e:number,n:number)=>boolean,blocked:(e:number,n:number)=>boolean){
  const p=this.state.player;if(p.mode!=='boat')return null;
  for(let r=1.5;r<=4.5;r+=.3)for(let i=0;i<32;i++){
   const a=i*Math.PI/16,e=p.e+Math.sin(a)*r,n=p.n+Math.cos(a)*r,h=this.geo.height(e,n),depth=this.geo.waterAt(e,n,p.water)?.depth??0;
   if(depth>.28||h>p.height+1||!ready(e,n)||blocked(e,n))continue;
   // The short step ashore cannot pass a pier, hedge, or a high bank.
   let clear=true;for(let d=.25;d<r;d+=.25){const x=p.e+Math.sin(a)*d,y=p.n+Math.cos(a)*d;if(blocked(x,y)||this.geo.height(x,y)>p.height+1){clear=false;break;}}
   if(clear)return {e,n,height:h};
  }return null;
 }
 disembark(ready:(e:number,n:number)=>boolean,blocked:(e:number,n:number)=>boolean){
  const target=this.landing(ready,blocked);if(!target)return false;const p=this.state.player,b=this.state.boats.find(b=>b.id===p.boatId)!;
  b.occupied=false;b.revision++;Object.assign(p,target,{mode:'walk',boatId:null,supportId:'terrain'});this.state.revision++;return true;
 }
 setWater(water:WaterState){
  if(!(water in this.geo.source.states.waterLevelsM))return false;
  const p=this.state.player;if(p.mode==='boat')return false;
  if((this.geo.waterAt(p.e,p.n,water)?.depth??0)>.35&&p.supportId==='terrain')return false;
  const moves:Position[]=this.state.boats.map(b=>{
   if(this.canFloat(b,water,b.heading))return b;
   for(let r=.5;r<=5;r+=.5)for(let i=0;i<24;i++){const point={e:b.e+Math.cos(i*Math.PI/12)*r,n:b.n+Math.sin(i*Math.PI/12)*r};if(this.canFloat(point,water,b.heading))return point;}
   return b;
  });
  if(moves.some((b,i)=>!this.canFloat(b,water,this.state.boats[i].heading)))return false;
  moves.forEach((p,i)=>{Object.assign(this.state.boats[i],p);this.state.boats[i].revision++;});p.water=water;this.state.revision++;return true;
 }
 toggleGate(){const p=this.state.player,g=this.geo.source.pois.find((p:any)=>p.id==='NORTH_GATE').point;
  if(p.mode!=='walk'||distance([p.e,p.n],g)>10||this.state.gateOpen&&barrierAt(this.geo,p.e,p.n,false))return false;
  this.state.gateOpen=!this.state.gateOpen;this.state.revision++;return true;
 }
 routePosition(distanceM:number,offsetM:number){const e=this.state.encounter,p=alongRoute(e.route,distanceM),ahead=alongRoute(e.route,Math.min(lineLength(e.route),distanceM+.2)),behind=alongRoute(e.route,Math.max(0,distanceM-.2)),dx=ahead.e-behind.e,dn=ahead.n-behind.n,len=Math.hypot(dx,dn)||1;return {e:p.e+dn/len*offsetM,n:p.n-dx/len*offsetM};}
 actor(){const e=this.state.encounter,p=this.routePosition(e.distanceM,e.offsetM);return {...p,height:this.geo.height(p.e,p.n)};}
 tick(dt:number,blocked:(e:number,n:number)=>boolean=()=>false){
  this.state.clock+=dt;const e=this.state.encounter;if(e.phase==='resolved')return;
  const length=lineLength(e.route),p=this.actor(),step=Math.min(.1,dt*.9),nextDistance=Math.min(length,e.distanceM+step),towardPath=e.offsetM-Math.sign(e.offsetM)*Math.min(Math.abs(e.offsetM),step*.25),next=this.routePosition(nextDistance,towardPath);
  const currentHeight=this.geo.height(p.e,p.n),safe=(x:number,n:number)=>!blocked(x,n)&&!barrierAt(this.geo,x,n,this.state.gateOpen)&&(this.geo.waterAt(x,n,this.state.player.water)?.depth??0)<.35&&Math.abs(this.geo.height(x,n)-currentHeight)<.3;
  if(Math.hypot(p.e-this.state.player.e,p.n-this.state.player.n)<3){e.phase='waiting';return;}
  if(safe(next.e,next.n)){e.distanceM=nextDistance;e.offsetM=towardPath;e.phase=e.distanceM>=length?'waiting':'travelling';}
  else {e.phase='waiting';const sign=e.offsetM?Math.sign(e.offsetM):e.seed%2?1:-1;for(const side of [sign,-sign]){const offset=e.offsetM+side*step,q=this.routePosition(e.distanceM,offset);if(Math.abs(offset)<=3&&safe(q.e,q.n)){e.offsetM=offset;e.phase='travelling';break;}}}
  if(e.phase==='travelling'){e.revision++;this.state.revision++;}
 }
 clue(id:string){if(!['testimony','tracks'].includes(id))return false;const p=this.state.player,at=id==='testimony'?{e:-220,n:-105}:alongRoute(this.state.encounter.route,30);if(Math.hypot(p.e-at.e,p.n-at.n)>7)return false;if(!this.state.encounter.clues.includes(id)){this.state.encounter.clues.push(id);this.state.encounter.revision++;this.state.revision++;}return true;}
 resolve(choice:'help'|'observe'){
  const e=this.state.encounter,p=this.actor();if(e.phase==='resolved'||Math.hypot(p.e-this.state.player.e,p.n-this.state.player.n)>5)return false;
  e.outcome=choice==='observe'?'Путник выслушан; направление и намерение записаны.':e.truth==='help'?'Вы оставили путнику припасы и сообщили, где искать помощь.':e.truth==='lodging'?'Путник получил направление к постоялому двору.':'Вы договорились передать весточку об обходной переправе.';e.phase='resolved';e.revision++;this.state.revision++;return true;
 }
 snapshot(){return structuredClone(this.state);}
 restore(value:unknown){
  const v=value as RegionSave,expected=this.state;
  if(!v||v.schema!==1||v.regionId!==expected.regionId||v.contentVersion!==expected.contentVersion||v.seed!==expected.seed)throw Error('Сохранение относится к другой версии региона');
  const b=this.geo.source.playBounds,valid=(p:Position)=>Number.isFinite(p.e)&&Number.isFinite(p.n)&&p.e>=b.minE&&p.e<=b.maxE&&p.n>=b.minN&&p.n<=b.maxN;
  if(!valid(v.player)||!Number.isFinite(v.player.heading)||!Number.isFinite(v.player.height)||!['walk','boat'].includes(v.player.mode)||!(v.player.water in this.geo.source.states.waterLevelsM)||!Array.isArray(v.boats)||v.boats.length!==2||new Set(v.boats.map(b=>b.id)).size!==2||v.boats.some(b=>!expected.boats.some(e=>e.id===b.id)||!valid(b)||!Number.isFinite(b.heading)||typeof b.occupied!=='boolean'))throw Error('Повреждённое положение игрока или лодки');
  const occupied=v.boats.filter(b=>b.occupied);if(v.player.mode==='boat'?(occupied.length!==1||occupied[0].id!==v.player.boatId||Math.hypot(occupied[0].e-v.player.e,occupied[0].n-v.player.n)>.01):occupied.length!==0)throw Error('Повреждённое владение лодкой');
  const e=v.encounter;if(!e||e.seed!==expected.encounter.seed||e.truth!==expected.encounter.truth||JSON.stringify(e.route)!==JSON.stringify(expected.encounter.route)||!Number.isFinite(e.distanceM)||e.distanceM<0||e.distanceM>lineLength(e.route)||!['travelling','waiting','resolved'].includes(e.phase)||!Array.isArray(e.clues)||e.clues.some(c=>!['testimony','tracks'].includes(c))||typeof v.gateOpen!=='boolean'||!Number.isFinite(v.clock)||v.clock<0)throw Error('Повреждённое событие');
  if(!Number.isFinite(e.offsetM)||Math.abs(e.offsetM)>3)throw Error('Повреждённое смещение путника');
  const ids=new Set([...this.geo.source.pois.map((p:any)=>p.id),...expected.boats.map(b=>b.id)]);if(!Array.isArray(v.knownPlaces)||v.knownPlaces.some(id=>!ids.has(id)))throw Error('Повреждённые отметки карты');
  this.state=structuredClone(v);
 }
}
