import {lineLength} from './authoring-core.mjs';
import {alongRoute} from './session.ts';

export type Weapon='bow'|'sword';
export type ScoutMode='patrol'|'search'|'pursuit'|'down';
export interface HuntPlayer {e:number;n:number;height:number;mode:'walk'|'boat';speed:number;crouching:boolean;}
export interface ScoutState {id:string;routeId:string;distanceM:number;direction:1|-1;e:number;n:number;heading:number;health:number;alert:number;mode:ScoutMode;attackAt:number;lastSeenAt:number;}
export interface TrackClue {id:string;e:number;n:number;label:string;message:string;}
export interface ArrowState {id:number;e:number;n:number;height:number;ve:number;vn:number;vh:number;age:number;}
export interface HuntSave {schema:1;regionId:string;contentVersion:string;seed:number;clock:number;revision:number;health:number;arrows:number;weapon:Weapon;tracks:string[];scouts:ScoutState[];completed:boolean;}
export interface HuntWorld {height:(e:number,n:number)=>number;visible:(from:{e:number;n:number;height:number},to:{e:number;n:number;height:number})=>boolean;blocked:(e:number,n:number)=>boolean;}

const SCOUTS=[
 {id:'scout-lookout',routeId:'lookout-access',center:410,span:85},
 {id:'scout-hollow',routeId:'lookout-hollow',center:365,span:135},
 {id:'scout-ridge',routeId:'lookout-ridge',center:930,span:170},
] as const;
const TRACKS=[
 {id:'bridge-tracks',routeId:'east-approach',distanceM:58,label:'Следы у восточного подхода',message:'Трое сошли с дороги после моста. Отпечатки ведут к обзорному плечу.'},
 {id:'lookout-tracks',routeId:'lookout-access',distanceM:230,label:'Примятая трава',message:'Здесь лазутчики разделились: один остался у дороги, двое ушли к лесистым холмам.'},
 {id:'hollow-tracks',routeId:'lookout-hollow',distanceM:190,label:'Следы в ложбине',message:'Один след уходит к укрытию, другой поднимается по гребню. Лазутчики ещё поблизости.'},
] as const;

function segmentSphere(a:[number,number,number],b:[number,number,number],center:[number,number,number],radius:number){
 const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],length=dx*dx+dy*dy+dz*dz;
 const t=Math.max(0,Math.min(1,length?((center[0]-a[0])*dx+(center[1]-a[1])*dy+(center[2]-a[2])*dz)/length:0));
 return Math.hypot(a[0]+dx*t-center[0],a[1]+dy*t-center[1],a[2]+dz*t-center[2])<=radius;
}

/** Deterministic region combat and tracking state; no renderer or DOM dependency. */
export class RegionHunt {
 readonly routes=new Map<string,number[][]>();
 readonly clues:TrackClue[];
 readonly arrowsInFlight:ArrowState[]=[];
 readonly events:string[]=[];
 state:HuntSave;
 private arrowSerial=0;
 private nextBowAt=0;
 private nextSwordAt=0;
 private sightAt=new Map<string,number>();
 private canSee=new Map<string,boolean>();

 constructor(source:any,contentVersion:string){
  for(const edge of source.topology.edges)this.routes.set(edge.id,edge.points);
  const route=(id:string)=>{const points=this.routes.get(id);if(!points)throw Error('Missing scout route '+id);return points;};
  this.clues=TRACKS.map(({id,routeId,distanceM,label,message})=>({id,...alongRoute(route(routeId),distanceM),label,message}));
  const scouts=SCOUTS.map(({id,routeId,center})=>{const p=alongRoute(route(routeId),center);return {id,routeId,distanceM:center,direction:1 as const,e:p.e,n:p.n,heading:0,health:100,alert:0,mode:'patrol' as const,attackAt:0,lastSeenAt:-100};});
  this.state={schema:1,regionId:source.regionId,contentVersion,seed:source.worldSeed,clock:0,revision:0,health:100,arrows:12,weapon:'bow',tracks:[],scouts,completed:false};
 }
 get nextClue(){return this.clues.find(clue=>!this.state.tracks.includes(clue.id))??null;}
 get downCount(){return this.state.scouts.filter(s=>s.mode==='down').length;}
 get activeScouts(){return this.state.scouts.filter(s=>s.mode!=='down');}
 select(weapon:Weapon){if(this.state.weapon===weapon)return;this.state.weapon=weapon;this.state.revision++;}
 nearbyClue(player:{e:number;n:number}){const clue=this.nextClue;return clue&&Math.hypot(clue.e-player.e,clue.n-player.n)<6?clue:null;}
 inspect(player:{e:number;n:number}){const clue=this.nearbyClue(player);if(!clue)return null;this.state.tracks.push(clue.id);this.state.revision++;this.events.push(clue.message);return clue;}
 resupply(player:{e:number;n:number}){if(Math.hypot(player.e+220,player.n+105)>8||this.state.arrows>=12)return false;this.state.arrows=12;this.state.revision++;this.events.push('Колчан пополнен у постоялого двора.');return true;}
 fireBow(player:HuntPlayer,yawDeg:number,elevation:number){
  if(this.state.weapon!=='bow'||player.mode!=='walk'||this.state.arrows<1||this.state.clock<this.nextBowAt)return false;
  const yaw=yawDeg*Math.PI/180,speed=52,flat=speed*Math.cos(elevation);
  this.arrowsInFlight.push({id:++this.arrowSerial,e:player.e+Math.cos(yaw)*.6,n:player.n-Math.sin(yaw)*.6,height:player.height+1.45,ve:Math.sin(yaw)*flat,vn:Math.cos(yaw)*flat,vh:Math.sin(elevation)*speed,age:0});
  this.state.arrows--;this.state.revision++;this.nextBowAt=this.state.clock+.55;
  for(const scout of this.activeScouts)if(Math.hypot(scout.e-player.e,scout.n-player.n)<45){scout.alert=Math.max(scout.alert,.45);scout.mode='search';}
  return true;
 }
 swing(player:HuntPlayer,yawDeg:number,world:HuntWorld){
  if(this.state.weapon!=='sword'||player.mode!=='walk'||this.state.clock<this.nextSwordAt)return false;
  this.nextSwordAt=this.state.clock+.8;
  const yaw=yawDeg*Math.PI/180,forward=[Math.sin(yaw),Math.cos(yaw)];
  const target=this.activeScouts.filter(s=>{const de=s.e-player.e,dn=s.n-player.n,d=Math.hypot(de,dn);return d<2.65&&(de*forward[0]+dn*forward[1])/Math.max(.01,d)>.2&&world.visible({e:player.e,n:player.n,height:player.height+1.45},{e:s.e,n:s.n,height:world.height(s.e,s.n)+1.1});}).sort((a,b)=>Math.hypot(a.e-player.e,a.n-player.n)-Math.hypot(b.e-player.e,b.n-player.n))[0];
  if(target)this.hit(target,55);
  return true;
 }
 private hit(scout:ScoutState,damage:number){
  scout.health=Math.max(0,scout.health-damage);scout.alert=1;scout.lastSeenAt=this.state.clock;
  if(scout.health===0){scout.mode='down';this.events.push('Лазутчик обезврежен.');}
  else {scout.mode='pursuit';this.events.push('Попадание! Лазутчик заметил вас.');}
  if(this.downCount===this.state.scouts.length){this.state.completed=true;this.events.push('Все лазутчики остановлены. Дозор у Брендивинского моста завершён.');}
  this.state.revision++;
 }
 update(dt:number,player:HuntPlayer,world:HuntWorld){
  const step=Math.max(0,Math.min(.05,dt));if(!step)return;
  this.state.clock+=step;
  for(let i=this.arrowsInFlight.length-1;i>=0;i--){
   const arrow=this.arrowsInFlight[i],before:[number,number,number]=[arrow.e,arrow.height,arrow.n];
   arrow.e+=arrow.ve*step;arrow.n+=arrow.vn*step;arrow.height+=arrow.vh*step-4.9*step*step;arrow.vh-=9.8*step;arrow.age+=step;
   const after:[number,number,number]=[arrow.e,arrow.height,arrow.n];
   const target=this.activeScouts.find(s=>segmentSphere(before,after,[s.e,world.height(s.e,s.n)+1.05,s.n],.8));
   if(target){this.hit(target,100);this.arrowsInFlight.splice(i,1);continue;}
   if(arrow.age>2.5||arrow.height<world.height(arrow.e,arrow.n)+.06||world.blocked(arrow.e,arrow.n))this.arrowsInFlight.splice(i,1);
  }
  for(const scout of this.activeScouts){
   const route=this.routes.get(scout.routeId)!,distance=Math.hypot(scout.e-player.e,scout.n-player.n);
   if(distance<65&&this.state.clock>=(this.sightAt.get(scout.id)??0)){
    this.sightAt.set(scout.id,this.state.clock+.18);
    this.canSee.set(scout.id,world.visible({e:scout.e,n:scout.n,height:world.height(scout.e,scout.n)+1.55},{e:player.e,n:player.n,height:player.height+(player.crouching?0.9:1.5)}));
   }
   const seen=player.mode==='walk'&&distance<65&&this.canSee.get(scout.id)===true;
   const noticeRadius=player.crouching?16:player.speed>4?55:33;
   if(seen&&distance<noticeRadius){scout.alert=Math.min(1,scout.alert+step*(player.crouching?0.16:player.speed>4?0.75:0.42)*(1-distance/90));scout.lastSeenAt=this.state.clock;}
   else if(player.speed>4&&distance<24)scout.alert=Math.min(1,scout.alert+step*0.12);
   else scout.alert=Math.max(0,scout.alert-step*0.055);
   if(scout.alert>=.95)scout.mode='pursuit';
   else if(scout.alert>.15&&scout.mode!=='pursuit')scout.mode='search';
   else if(scout.alert<=.15&&scout.mode==='search')scout.mode='patrol';
   if(scout.mode==='pursuit'&&this.state.clock-scout.lastSeenAt>12&&distance>35){scout.mode='search';scout.alert=.5;}
   if(scout.mode==='pursuit'&&distance<2.2&&player.mode==='walk'&&this.state.clock>=scout.attackAt){
    scout.attackAt=this.state.clock+1.5;this.state.health=Math.max(0,this.state.health-17);this.state.revision++;this.events.push('Удар лазутчика!');
    if(this.state.health===0){this.state.health=100;this.state.arrows=12;this.events.push('Вы очнулись у постоялого двора. Лазутчики ещё в лесу.');return 'respawn' as const;}
   }
   const previous={e:scout.e,n:scout.n};
   if(scout.mode==='pursuit'&&distance>1.7&&distance<100){
    const speed=2.8,move=Math.min(distance-1.5,speed*step),de=(player.e-scout.e)/distance*move,dn=(player.n-scout.n)/distance*move;
    const candidate={e:scout.e+de,n:scout.n+dn};
    if(this.walkable(scout,candidate,world)){scout.e=candidate.e;scout.n=candidate.n;}
    else for(const side of [-1,1]){const flank={e:scout.e+dn*side,n:scout.n-de*side};if(this.walkable(scout,flank,world)){scout.e=flank.e;scout.n=flank.n;break;}}
   }else{
    const spec=SCOUTS.find(x=>x.id===scout.id)!;
    const limit=Math.min(lineLength(route),spec.center+spec.span),min=Math.max(0,spec.center-spec.span);
    let progress=scout.distanceM+scout.direction*(scout.mode==='search'?0.65:1.15)*step;
    if(progress>limit){progress=limit;scout.direction=-1;}else if(progress<min){progress=min;scout.direction=1;}
    const p=alongRoute(route,progress);
    if(this.walkable(scout,p,world)){scout.distanceM=progress;scout.e=p.e;scout.n=p.n;}
   }
   const de=scout.e-previous.e,dn=scout.n-previous.n;
   if(Math.hypot(de,dn)>.001)scout.heading=Math.atan2(de,dn)*180/Math.PI;
  }
  return null;
 }
 private walkable(from:ScoutState,to:{e:number;n:number},world:HuntWorld){
  return !world.blocked(to.e,to.n)&&Math.abs(world.height(from.e,from.n)-world.height(to.e,to.n))<.35;
 }
 drainEvents(){return this.events.splice(0);}
 snapshot(){return structuredClone(this.state);}
 restore(value:unknown){
  const v=value as HuntSave,expected=this.state;
  if(!v||v.schema!==1||v.regionId!==expected.regionId||v.contentVersion!==expected.contentVersion||v.seed!==expected.seed||!Number.isFinite(v.clock)||v.clock<0||!Number.isFinite(v.health)||v.health<1||v.health>100||!Number.isInteger(v.arrows)||v.arrows<0||v.arrows>12||!['bow','sword'].includes(v.weapon)||!Array.isArray(v.tracks)||v.tracks.some(id=>!this.clues.some(c=>c.id===id))||new Set(v.tracks).size!==v.tracks.length||!Array.isArray(v.scouts)||v.scouts.length!==SCOUTS.length)throw Error('Повреждённое сохранение дозора');
  for(const scout of v.scouts){const spec=SCOUTS.find(s=>s.id===scout.id);if(!spec||scout.routeId!==spec.routeId||![scout.e,scout.n,scout.distanceM,scout.heading,scout.health,scout.alert,scout.attackAt,scout.lastSeenAt].every(Number.isFinite)||scout.health<0||scout.health>100||scout.alert<0||scout.alert>1||!['patrol','search','pursuit','down'].includes(scout.mode)||![1,-1].includes(scout.direction))throw Error('Повреждённое положение лазутчика');}
  if(new Set(v.scouts.map(s=>s.id)).size!==SCOUTS.length||v.completed!==v.scouts.every(s=>s.mode==='down'))throw Error('Повреждённое состояние дозора');
  this.state=structuredClone(v);this.arrowsInFlight.length=0;
 }
}
