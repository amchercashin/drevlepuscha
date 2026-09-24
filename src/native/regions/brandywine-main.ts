import '../../style.css';
import cameraConfig from '../../../config/camera-presets.json';
import {WorldData} from '../../world/data.ts';
import {moveOnTerrain,treesBlock,trailIndex,tileKey} from '../../world/math.ts';
import {cameraOffset,normalizeAzimuth} from '../../domain/coordinates.ts';
import {terrainCameraLift} from '../../domain/showcase.ts';
import {surfaceAt,barrierAt} from '../../domain/regions/traversal.mjs';
import {regionSight} from '../../domain/regions/sight.ts';
import {RegionSession,alongRoute} from '../../domain/regions/session.ts';
import type {WaterState} from '../../domain/regions/session.ts';
import {RegionHunt} from '../../domain/regions/hunt.ts';
import {RegionVisitors} from '../../domain/regions/visitors.ts';
import type {HuntWorld,Weapon} from '../../domain/regions/hunt.ts';
import {brandywineStructureLayout,regionPierAt} from '../../domain/regions/structure-layout.ts';
import {brandywineVisuals} from '../../regions/visual-profile.ts';
import {regionInterface} from '../../regions/interface.ts';
import {createHuntInterface} from '../../regions/hunt-interface.ts';
import {createTouchControls} from '../../runtime/touch-controls.ts';
import {SceneStartup,bindInputFocus} from '../../runtime/startup.ts';
import {createNativeRegionRenderer} from './renderer.ts';
import type {NativeRegionActor} from './types.ts';

const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=$<HTMLCanvasElement>('world'),startup=new SceneStartup($<HTMLButtonElement>('resume'));
const errors:string[]=[],keys=new Set<string>();let paused=true,loading=true,dragging=false,frames=0;
let yaw=75,pitch=6,distance=6,previous=performance.now(),lastUi=0,saveAt=0;
const samples:number[]=[],renderSamples:number[]=[],cpuSamples:number[]=[];
const data=await startup.stage('Загружаем Брендивинский мост…',()=>new WorldData({baseUrl:'regions/brandywine-bridge/world/',cacheNamespace:'brandywine-bridge-',geographyKind:'brandywine'}).init());
const session=new RegionSession(data.geo,data.manifest.version),hunt=new RegionHunt(data.geo.source,data.manifest.version),visitors=new RegionVisitors(data.geo.source.worldSeed);
const saveKey='region:brandywine-bridge:session-v1',huntSaveKey='region:brandywine-bridge:hunt-v1';let restored=false;
try{const raw=localStorage.getItem(saveKey);if(raw){session.restore(JSON.parse(raw));restored=true;}}catch(error){errors.push('Прогулка: '+String(error));}
try{const raw=localStorage.getItem(huntSaveKey);if(raw)hunt.restore(JSON.parse(raw));}catch(error){errors.push('Дозор: '+String(error));}
try{const raw=localStorage.getItem('region:brandywine-bridge:camera');if(raw){const c=JSON.parse(raw);if([c.yaw,c.pitch,c.distance].every(Number.isFinite)){yaw=normalizeAzimuth(c.yaw);pitch=c.pitch;distance=c.distance;}}}catch{}
const player=session.state.player,layout=brandywineStructureLayout(data.geo,trailIndex(data.trails));
let renderer:Awaited<ReturnType<typeof createNativeRegionRenderer>>;
const stop=(error:string)=>{$('pause').hidden=false;$('pause-title').textContent='Не удалось продолжить';$('pause-description').textContent=error;paused=true;errors.push(error);};
renderer=await startup.stage('Готовим прямой WebGPU…',()=>createNativeRegionRenderer(canvas,{id:data.geo.source.regionId,data,layout,entry:{e:player.e,n:player.n},regionalAssetBase:'regions/brandywine-bridge/assets/',treeLibraryUrl:new URL(import.meta.env.BASE_URL+'world/library.json',location.origin).href,visuals:brandywineVisuals},stop));

const nearTrees=(e:number,n:number)=>treesBlock([...data.tiles.values()].flatMap(tile=>tile.trees),e,n);
const blocked=(e:number,n:number)=>barrierAt(data.geo,e,n,session.state.gateOpen)||layout.colliders.some(c=>Math.abs(e-c.e)<c.width/2+.28&&Math.abs(n-c.n)<c.depth/2+.28)||nearTrees(e,n);
const surface=(e:number,n:number)=>surfaceAt(data.geo,(x:number,y:number)=>data.height(x,y),e,n,player);
const query={height:(e:number,n:number)=>surface(e,n).height,ready:(e:number,n:number)=>data.ready(e,n),waterDepth:(e:number,n:number)=>surface(e,n).supportId!=='terrain'?0:Math.max(0,(data.geo.waterAt(e,n,player.water)?.level??-Infinity)-data.height(e,n)),blocked};
const huntWorld:HuntWorld={height:(e,n)=>data.height(e,n),visible:(a,b)=>regionSight({e:a.e,n:a.n,h:a.height},{e:b.e,n:b.n,h:b.height},data.height.bind(data)).visible,blocked:(e,n)=>blocked(e,n)||query.waterDepth(e,n)>.35};
function save(){try{localStorage.setItem(saveKey,JSON.stringify(session.snapshot()));localStorage.setItem(huntSaveKey,JSON.stringify(hunt.snapshot()));localStorage.setItem('region:brandywine-bridge:camera',JSON.stringify({yaw,pitch,distance}));}catch(error){errors.push('Сохранение: '+String(error));}}
async function travel(e:number,n:number){if(player.mode==='boat')return;loading=true;keys.clear();try{await data.load(tileKey(e,n));if((data.geo.waterAt(e,n,player.water)?.depth??0)>.35)throw Error('Точка под водой');Object.assign(player,{e,n,height:data.height(e,n),supportId:'terrain'});save();}finally{loading=false;}}
function setPaused(value:boolean){paused=value;keys.clear();dragging=false;$('pause').hidden=!value;previous=performance.now();if(!value)canvas.focus({preventScroll:true});}
function nearbyAction(){if(player.mode==='boat')return {id:'land',label:'Высадиться у берега'};if(hunt.nearbyClue(player))return {id:'hunt-track',label:'Осмотреть следы лазутчиков'};if(hunt.state.arrows<12&&Math.hypot(player.e+220,player.n+105)<8)return {id:'arrows',label:'Пополнить колчан'};const npc=session.actor();if(Math.hypot(npc.e-player.e,npc.n-player.n)<5)return {id:'npc',label:'Поговорить с путником'};if(Math.hypot(player.e-550,player.n+180)<10)return {id:'gate',label:session.state.gateOpen?'Закрыть ворота':'Открыть ворота'};const boat=session.state.boats.find(b=>Math.hypot(player.e-b.e,player.n-b.n)<5);if(boat)return {id:boat.id,label:'Сесть в лодку'};if(Math.hypot(player.e+220,player.n+105)<7)return {id:'testimony',label:'Расспросить у постоялого двора'};const tracks=alongRoute(session.state.encounter.route,30);if(Math.hypot(player.e-tracks.e,player.n-tracks.n)<7)return {id:'tracks',label:'Осмотреть следы'};return null;}
function interact(){if(paused||loading)return;const action=nearbyAction();if(!action)return;
 if(action.id==='land'){if(!session.disembark(query.ready,blocked))ui.show('Здесь не выйти: подведите лодку ближе к пологому берегу.');}
 else if(action.id==='hunt-track'){hunt.inspect(player);hunt.drainEvents().forEach(ui.show);}
 else if(action.id==='arrows'){hunt.resupply(player);hunt.drainEvents().forEach(ui.show);}
 else if(action.id==='gate'){if(!session.toggleGate())ui.show('Отойдите от створки ворот.');}
 else if(action.id==='npc'){if(session.state.encounter.outcome)ui.show(session.state.encounter.outcome);else ui.talk();}
 else if(action.id.endsWith('boat')){if(!session.board(action.id))ui.show('Подойдите ближе к лодке.');}
 else if(session.clue(action.id))ui.show(action.id==='testimony'?'Путник ушёл по боковой тропе.':'Следы продолжаются к берегу и роще.');save();
}
const ui=regionInterface(session,{data},hunt,{interact,resolve(choice){if(session.resolve(choice)){ui.show(session.state.encounter.outcome!);save();}},water(value:WaterState){if(session.setWater(value))save();else ui.show('Уровень воды можно менять только на сухой земле.');},save(){save();ui.show('Прогулка сохранена.');},pause:setPaused});
const huntUi=createHuntInterface(hunt,{select(weapon:Weapon){hunt.select(weapon);huntUi.update(player,paused,keys.has('ControlLeft')||keys.has('ControlRight'));},attack});
const elevation=()=>Math.max(-.12,Math.min(.35,.04-(pitch-6)*Math.PI/300));
function attack(){if(paused||loading||document.querySelector('dialog[open]'))return;const body={e:player.e,n:player.n,height:player.height,mode:player.mode,speed:0,crouching:keys.has('ControlLeft')||keys.has('ControlRight')};
 const fired=hunt.state.weapon==='bow'?hunt.fireBow(body,yaw,elevation()):hunt.swing(body,yaw,huntWorld);
 if(hunt.state.weapon==='sword'&&fired)visitors.repel(player,yaw);
 if(!fired&&hunt.state.weapon==='bow'&&hunt.state.arrows===0)ui.show('Колчан пуст. Возьмите стрелы у двора.');}
document.body.classList.remove('showcase');document.title='Дозор у Брендивинского моста · WebGPU';document.querySelector('h1')!.textContent='Брендивинский мост';
$('pause-title').textContent='У Брендивинского моста';$('pause-description').textContent='Выслеживайте лазутчиков на дорогах и лесных тропах. 1 — лук, 2 — меч, E — следы, Ctrl — тихий шаг.';
document.querySelector('.badge')!.textContent='Брендивинский мост · WebGPU';document.querySelector('.muted')!.textContent='Область 4 × 4 км · прямой WebGPU';$('forest-controls').hidden=true;
document.querySelector('.eyebrow')!.textContent='Древлепуща / Брендивинский мост';canvas.setAttribute('aria-label','Брендивинский мост. WASD — движение, E — действие, M — карта, 1 — лук, 2 — меч.');
document.querySelector('nav')!.innerHTML='';
for(const id of ['INN','NORTH_GATE','ROAD_LOOKOUT','RANGER_SHELTER','WATER_FOOTBRIDGE','UPPER_LANDING_W']){const p=data.geo.source.pois.find((p:any)=>p.id===id),button=document.createElement('button');button.textContent=p.name;button.onclick=()=>void travel(p.point[0],p.point[1]+(id==='WATER_FOOTBRIDGE'?-40:12)).catch(error=>ui.show(String(error)));document.querySelector('nav')!.append(button);}
document.querySelector('nav')!.hidden=new URLSearchParams(location.search).get('debug')!=='1';
$('reset').onclick=()=>void travel(-220,-105).catch(error=>ui.show(String(error)));
window.addEventListener('keydown',event=>{if((event.target as HTMLElement)?.matches('input,select,textarea')||document.querySelector('dialog[open]'))return;
 if(event.code==='KeyM'){ui.toggle();return;}if(event.code==='KeyE'&&!event.repeat){interact();return;}if(event.code==='Digit1'){hunt.select('bow');return;}if(event.code==='Digit2'){hunt.select('sword');return;}if(event.code==='Escape'){setPaused(!paused);return;}if(event.code==='Space'){yaw=player.heading;event.preventDefault();}keys.add(event.code);
});window.addEventListener('keyup',event=>keys.delete(event.code));bindInputFocus(canvas,()=>{keys.clear();dragging=false;});
canvas.addEventListener('contextmenu',event=>event.preventDefault());canvas.addEventListener('pointerdown',event=>{if(event.button===0&&event.pointerType==='mouse')attack();if(event.button===2){dragging=true;canvas.setPointerCapture(event.pointerId);}});canvas.addEventListener('pointerup',()=>dragging=false);
canvas.addEventListener('pointermove',event=>{if(dragging){yaw=normalizeAzimuth(yaw+event.movementX*.2);pitch=Math.max(-70,Math.min(cameraConfig.travel.pitchMaxDeg,pitch+event.movementY*.16));}});
canvas.addEventListener('wheel',event=>{distance=Math.max(cameraConfig.travel.distanceMinM,Math.min(cameraConfig.travel.distanceMaxM,distance+event.deltaY*.004));event.preventDefault();},{passive:false});
const touch=createTouchControls(canvas,{active:()=>!paused&&!loading,engage:()=>canvas.focus(),look:(dx,dy)=>{yaw=normalizeAzimuth(yaw+dx*.2);pitch=Math.max(-70,Math.min(cameraConfig.travel.pitchMaxDeg,pitch+dy*.16));},zoom:delta=>{distance=Math.max(cameraConfig.travel.distanceMinM,Math.min(cameraConfig.travel.distanceMaxM,distance+delta));}});
function state(){const sorted=[...samples].sort((a,b)=>a-b),render=[...renderSamples].sort((a,b)=>a-b),cpu=[...cpuSamples].sort((a,b)=>a-b);return {ready:startup.readyAt!==null,paused,loading,frames,player:{...player},hunt:hunt.snapshot(),visitor:visitors.visitor,world:data.stats(),graphics:renderer.stats(),renderer:'direct-webgpu',frameMs:{samples:sorted.length,median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],p99:sorted[Math.floor(sorted.length*.99)],over25:sorted.filter(ms=>ms>25).length},renderCpuMs:{median:render[Math.floor(render.length*.5)],p95:render[Math.floor(render.length*.95)]},frameCpuMs:{median:cpu[Math.floor(cpu.length*.5)],p95:cpu[Math.floor(cpu.length*.95)]},errors};}
if(new URLSearchParams(location.search).get('debug')==='1')(window as any).__region={state,travel,pause:setPaused,player,hunt,visitors,session,attack,interact,save,ui,data};
window.addEventListener('pagehide',save);
function frame(now:number){requestAnimationFrame(frame);if(document.hidden){previous=now;return;}const cpuStart=performance.now(),elapsed=now-previous,dt=Math.min(.05,Math.max(0,elapsed/1000));previous=now;
 try{
  if(!paused&&!loading){samples.push(elapsed);if(samples.length>600)samples.shift();}
  let speed=0;const running=keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.state.running,crouching=keys.has('ControlLeft')||keys.has('ControlRight');
  if(!paused&&!loading){let forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'))+touch.state.forward,right=Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+touch.state.right;const len=Math.max(1,Math.hypot(forward,right));forward/=len;right/=len;
   const a=yaw*Math.PI/180,v=crouching?.95:running?15:1.85,de=(Math.sin(a)*forward+Math.cos(a)*right)*v*dt,dn=(Math.cos(a)*forward-Math.sin(a)*right)*v*dt;
   if(player.mode==='boat')session.row(de/v*(running?1.6:.8),dn/v*(running?1.6:.8),query.ready,(e,n)=>regionPierAt(layout,e,n));
   else{const next=moveOnTerrain(player,de,dn,query,data.manifest.bounds);speed=Math.hypot(next.e-player.e,next.n-player.n)/Math.max(dt,.001);if(speed>.01)player.heading=normalizeAzimuth(Math.atan2(next.e-player.e,next.n-player.n)*180/Math.PI);Object.assign(player,next);const support=surface(player.e,player.n);player.height=support.height;player.supportId=support.supportId;}
   session.tick(dt,(e,n)=>data.ready(e,n)&&blocked(e,n));
   const result=hunt.update(dt,{e:player.e,n:player.n,height:player.height,mode:player.mode,speed,crouching},huntWorld);if(result==='respawn')void travel(-220,-105).catch(error=>errors.push(String(error)));
   const ambient=visitors.update(dt,player,{height:data.height.bind(data),blocked:huntWorld.blocked,forestAt:data.geo.forestAt});
   if(ambient.bite&&hunt.takeDamage(ambient.bite,'Волк ранил следопыта.')==='respawn')void travel(-220,-105).catch(error=>errors.push(String(error)));
   for(const message of visitors.drainEvents()){ui.show(message);if(message.includes('ворон')&&visitors.visitor)hunt.alertAt(visitors.visitor.e,visitors.visitor.n);}
   hunt.drainEvents().forEach(ui.show);
  }
  const h=player.height,offset=cameraOffset(yaw+180,Math.max(0,pitch),distance),eye={e:player.e+offset.x,n:player.n-offset.z,h:h+.95+offset.y},shoulder=hunt.state.weapon==='bow'&&!paused?1.15:0,rightE=Math.cos(yaw*Math.PI/180),rightN=-Math.sin(yaw*Math.PI/180);
  eye.e+=rightE*shoulder;eye.n+=rightN*shoulder;eye.h+=terrainCameraLift({x:eye.e,y:eye.h,z:-eye.n},{x:player.e,y:h+.95,z:-player.n},(e,n)=>data.height(e,n));
  const target={e:player.e+rightE*shoulder,n:player.n+rightN*shoulder,h:h+.95+Math.tan(Math.max(0,-pitch)*Math.PI/180)*distance};
  const npc=session.actor(),actors:NativeRegionActor[]=[{id:'player',e:player.e,n:player.n,h,yaw:Math.PI-player.heading*Math.PI/180,speed,kind:'hero',visible:true},{id:'traveller',e:npc.e,n:npc.n,h:npc.height,yaw:0,speed:1.1,kind:'southerner',visible:Math.hypot(npc.e-player.e,npc.n-player.n)<180}];
  for(const scout of hunt.state.scouts)actors.push({id:scout.id,e:scout.e,n:scout.n,h:data.height(scout.e,scout.n),yaw:Math.PI-scout.heading*Math.PI/180,speed:scout.mode==='pursuit'?3:scout.mode==='search'?.65:1.15,kind:hunt.kindOf(scout.id),visible:scout.mode!=='down'&&Math.hypot(scout.e-player.e,scout.n-player.n)<180});
  if(visitors.visitor)actors.push({id:visitors.visitor.id,e:visitors.visitor.e,n:visitors.visitor.n,h:visitors.visitor.h,yaw:-visitors.visitor.heading,speed:2,kind:visitors.visitor.kind,visible:true});
  if(hunt.nextClue)actors.push({id:hunt.nextClue.id,e:hunt.nextClue.e,n:hunt.nextClue.n,h:data.height(hunt.nextClue.e,hunt.nextClue.n)+.1,yaw:0,speed:0,kind:'clue',visible:Math.hypot(hunt.nextClue.e-player.e,hunt.nextClue.n-player.n)<40});
  const renderStart=performance.now();renderer.draw({eye:[eye.e,eye.h,-eye.n],target:[target.e,target.h,-target.n],player,time:session.state.clock,active:!paused&&!loading,actors,boats:session.state.boats,weapon:hunt.state.weapon,gateOpen:session.state.gateOpen,waterOffsetM:data.geo.source.states.waterLevelsM[player.water]});if(!paused&&!loading){renderSamples.push(performance.now()-renderStart);if(renderSamples.length>600)renderSamples.shift();}frames++;
  const rect=canvas.getBoundingClientRect();huntUi.setReticle(rect.left+rect.width*.5,rect.top+rect.height*.46);
  if(now-lastUi>500){lastUi=now;if(!paused&&!loading)session.discover((e,n)=>regionSight({e:player.e,n:player.n,h:h+1.65},{e,n,h:data.height(e,n)+1},data.height.bind(data)).visible);ui.update(nearbyAction()?.label??'');huntUi.update(player,paused,crouching);$('fps').textContent=Math.round(1000/Math.max(1,samples.at(-1)??16.7))+' FPS';$('metrics').textContent=`${renderer.stats().patches} участков · ${renderer.stats().trees} деревьев · кадр p95 ${state().frameMs.p95?.toFixed(1)??'—'} мс`;$('location').textContent=data.geo.zoneAt(player.e,player.n)?.name??'Пойма';}
  if(!loading&&now-saveAt>10000){saveAt=now;save();}
  if(!paused&&!loading){cpuSamples.push(performance.now()-cpuStart);if(cpuSamples.length>600)cpuSamples.shift();}
 }catch(error){const message=String(error);if(!errors.includes(message))console.error(error);stop(message);}
}
requestAnimationFrame(frame);loading=false;
await startup.reveal(()=>frames>0&&renderer.ready(),()=>setPaused(false));
if(restored)ui.show('Прогулка продолжена с сохранённого места.');
