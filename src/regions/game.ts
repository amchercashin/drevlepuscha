import '../style.css';
import cameraConfig from '../../config/camera-presets.json';
import {Scene} from '@babylonjs/core/scene.js';
import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {Color3,Color4} from '@babylonjs/core/Maths/math.color.js';
import {DirectionalLight} from '@babylonjs/core/Lights/directionalLight.js';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight.js';
import {ShadowGenerator} from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {createRenderer} from '../runtime/engine.ts';
import {SceneStartup,bindInputFocus} from '../runtime/startup.ts';
import {createRanger} from '../runtime/ranger.ts';
import {createDaylight} from '../runtime/daylight.ts';
import {WindSystem} from '../runtime/wind.ts';
import {createWindControls} from '../runtime/wind-controls.ts';
import {createRain} from '../runtime/rain.ts';
import {ShowcaseAudio} from '../runtime/showcase-audio.ts';
import {createTouchControls} from '../runtime/touch-controls.ts';
import {cameraOffset,normalizeAzimuth} from '../domain/coordinates.ts';
import {terrainCameraLift} from '../domain/showcase.ts';
import {moveOnTerrain} from '../world/math.ts';
import {surfaceAt,barrierAt} from '../domain/regions/traversal.mjs';
import {RegionWorld} from './world.ts';
import {createStructures} from './structures.ts';
import {RegionSession,alongRoute} from '../domain/regions/session.ts';
import type {WaterState} from '../domain/regions/session.ts';
import {createRegionalActors} from './actors.ts';
import {regionInterface} from './interface.ts';
import {createRegionWildlife} from './wildlife.ts';
import {regionShade} from './shade.ts';
import {renderResolution} from '../runtime/resolution.ts';
import type {ResolutionQuality} from '../runtime/resolution.ts';
import {createUndergrowth} from './undergrowth.ts';
import {regionSight} from '../domain/regions/sight.ts';

const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const start=new SceneStartup($<HTMLButtonElement>('resume'));
const renderer=await start.stage('Запускаем графику…',()=>createRenderer($<HTMLCanvasElement>('world'),new URLSearchParams(location.search).get('debug')==='1'));
const {engine,canvas}=renderer,scene=new Scene(engine);scene.useRightHandedSystem=true;
scene.clearColor=new Color4(.74,.8,.84,1);scene.fogMode=Scene.FOGMODE_EXP2;scene.fogDensity=.0005;scene.fogColor=new Color3(.76,.82,.84);
const camera=new FreeCamera('region-camera',new Vector3(0,8,10),scene);camera.inputs.clear();camera.minZ=.1;camera.maxZ=6500;camera.fov=cameraConfig.travel.fovVerticalDeg*Math.PI/180;scene.activeCamera=camera;
const sun=new DirectionalLight('sun',new Vector3(-.35,-.65,.6),scene),fill=new HemisphericLight('fill',Vector3.Up(),scene);
const shadows=new ShadowGenerator(1024,sun);shadows.usePercentageCloserFiltering=true;shadows.setDarkness(.12);sun.autoUpdateExtends=false;sun.autoCalcShadowZBounds=false;sun.shadowMinZ=1;sun.shadowMaxZ=120;sun.orthoLeft=sun.orthoBottom=-40;sun.orthoRight=sun.orthoTop=40;
const wind=new WindSystem();createWindControls(wind);
const world=await start.stage('Реки, холмы и лес…',()=>RegionWorld.create(scene,sun,wind));
const structures=createStructures(scene,world),hero=new TransformNode('ranger',scene);
const ranger=await start.stage('Следопыт…',()=>createRanger(scene,hero));
const daylight=createDaylight(scene,camera,sun,fill,null,true,true);await daylight.loadSkyAssets();daylight.setFog(.00035);daylight.setSkySettings({low:{scale:[.38,.43],detailScale:2.6},high:{scale:[.20,.7]}});
const rain=createRain(scene,{origin:()=>({x:world.origin.e,z:-world.origin.n}),groundHeightAt:(x,z)=>world.data.height(x+world.origin.e,world.origin.n-z),shelterHeightAt:(x,z)=>{const e=x+world.origin.e,n=world.origin.n-z;return structures.colliders.find(c=>Math.abs(e-c.e)<c.width/2&&Math.abs(n-c.n)<c.depth/2)?.roof??null;}}),audio=new ShowcaseAudio(wind,[]);
const session=new RegionSession(world.data.geo,world.data.manifest.version),saveKey='region:brandywine-bridge:session-v1';let restored=false,restoreNotice='';
try{const stored=localStorage.getItem(saveKey);if(stored){session.restore(JSON.parse(stored));restored=true;}}catch(e){restoreNotice=String(e);}
const player=session.state.player,actors=createRegionalActors(scene,world,session),shade=regionShade(scene,world.data.geo,()=>world.origin,shadows);
world.floor.materials.forEach(shade);hero.getChildMeshes().forEach(m=>m.material&&shade(m.material));
const wildlife=await start.stage('Птицы и лесные обитатели…',()=>createRegionWildlife(scene,world,shadows,wind,audio,shade));
world.setWater(player.water);const undergrowth=createUndergrowth(scene,world);
let paused=true,loading=true,yaw=75,pitch=6,distance=6,dragging=false,frames=0,previous=performance.now(),lastUi=0;
const errors:string[]=[],keys=new Set<string>();
try{const c=JSON.parse(localStorage.getItem('region:brandywine-bridge:camera')??'null');if(c&&[c.yaw,c.pitch,c.distance].every(Number.isFinite)){yaw=normalizeAzimuth(c.yaw);pitch=Math.max(-70,Math.min(cameraConfig.travel.pitchMaxDeg,c.pitch));distance=Math.max(cameraConfig.travel.distanceMinM,Math.min(cameraConfig.travel.distanceMaxM,c.distance));}}catch{}
const performanceSamples:number[]=[];let saveAt=0,audioTreesAt=0;
const touch=createTouchControls(canvas,{active:()=>!paused&&!loading,engage:()=>canvas.focus(),look:(dx,dy)=>{yaw=normalizeAzimuth(yaw+dx*.2);pitch=Math.max(-70,Math.min(cameraConfig.travel.pitchMaxDeg,pitch+dy*.16));},zoom:delta=>{distance=Math.max(cameraConfig.travel.distanceMinM,Math.min(cameraConfig.travel.distanceMaxM,distance+delta));}});
function setPaused(value:boolean){paused=value;keys.clear();$('pause').hidden=!value;audio.setPaused(value);if(!value){void audio.start();canvas.focus();}}
const surface=(e:number,n:number)=>surfaceAt(world.data.geo,(x:number,y:number)=>world.data.height(x,y),e,n,player);
const query={height:(e:number,n:number)=>surface(e,n).height,ready:(e:number,n:number)=>world.data.ready(e,n)&&world.terrain.ready({e,n}),waterDepth:(e:number,n:number)=>surface(e,n).supportId!=='terrain'?0:Math.max(0,(world.data.geo.waterAt(e,n,player.water)?.level??-Infinity)-world.data.height(e,n)),blocked:(e:number,n:number)=>barrierAt(world.data.geo,e,n,session.state.gateOpen)||structures.blocked(e,n)||world.props.blocked(e,n)||world.trees.blocked(e,n)};
function state(){const sorted=[...performanceSamples].sort((a,b)=>a-b);return {ready:start.readyAt!==null,paused,loading,frames,player:{...player},camera:{yaw,pitch,distance},world:world.stats(),wildlife:wildlife.stats(),actors:actors.stats(),rain:rain.stats(),audio:audio.stats(),wind:wind.stats(),lighting:daylight.stats(),errors:[...errors,...structures.failures],renderer:renderer.kind,gpu:renderer.info,frameMs:{samples:sorted.length,median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)]},resolution:[engine.getRenderWidth(),engine.getRenderHeight()],gateOpen:session.state.gateOpen,boats:session.state.boats,encounter:session.state.encounter};}
function save(){try{if(restoreNotice){ui.show('Предыдущее сохранение несовместимо. Новая прогулка сохраняется отдельно.');localStorage.setItem(saveKey+':previous',localStorage.getItem(saveKey)??'');restoreNotice='';}localStorage.setItem(saveKey,JSON.stringify(session.snapshot()));localStorage.setItem('region:brandywine-bridge:camera',JSON.stringify({yaw,pitch,distance}));}catch{ui.show('Браузер не смог сохранить прогулку.');}}
async function travel(e:number,n:number){if(loading&&start.readyAt!==null)return;if(player.mode==='boat'){ui.show('Сначала высадитесь из лодки у берега.');return;}loading=true;keys.clear();try{await world.prepare({e,n});if((world.data.geo.waterAt(e,n,player.water)?.depth??0)>.35)throw Error('Точка под водой. Выберите сухой подход.');player.e=e;player.n=n;player.height=world.data.height(e,n);player.supportId='terrain';save();}finally{loading=false;}}
const ui=regionInterface(session,world,{interact,resolve(choice){if(session.resolve(choice)){ui.show(session.state.encounter.outcome!);save();}},water(value:WaterState){if(session.setWater(value)){world.setWater(value);save();}else ui.show('Уровень воды сейчас менять нельзя: выйдите на сухую землю.');},save(){save();ui.show('Прогулка сохранена.');},pause:setPaused});
function nearbyAction(){if(player.mode==='boat')return {id:'land',label:'Высадиться у берега'};const npc=session.actor();if(Math.hypot(npc.e-player.e,npc.n-player.n)<5)return {id:'npc',label:'Поговорить с путником'};if(Math.hypot(player.e-550,player.n+180)<10)return {id:'gate',label:session.state.gateOpen?'Закрыть ворота':'Открыть ворота'};const boat=session.state.boats.find(b=>Math.hypot(player.e-b.e,player.n-b.n)<5);if(boat)return {id:boat.id,label:'Сесть в лодку'};if(Math.hypot(player.e+220,player.n+105)<7)return {id:'testimony',label:'Расспросить у постоялого двора'};const tracks=alongRoute(session.state.encounter.route,30);if(Math.hypot(player.e-tracks.e,player.n-tracks.n)<7)return {id:'tracks',label:'Осмотреть следы'};return null;}
function interact(){if(paused||loading)return;const action=nearbyAction();if(!action)return;
 if(action.id==='land'){if(!session.disembark(query.ready,query.blocked))ui.show('Здесь не выйти: подведите лодку ближе к пологому берегу.');}
 else if(action.id==='gate'){if(!session.toggleGate())ui.show('Отойдите от створки ворот.');}
 else if(action.id==='npc'){if(session.state.encounter.outcome)ui.show(session.state.encounter.outcome);else ui.talk();}
 else if(action.id.endsWith('boat')){if(!session.board(action.id))ui.show('Подойдите ближе к лодке.');}
 else if(session.clue(action.id))ui.show(action.id==='testimony'?'«Путник ушёл по боковой тропе. Он был один. Свежие следы ещё видны неподалёку от двора».':'Один человек шёл спокойно по тропе. Следы продолжаются в сторону берега или рощи; признаков борьбы нет.');
 save();
}
document.querySelector('h1')!.textContent='Брендивинский мост';document.title='Дозор у Брендивинского моста';$('pause-title').textContent='У Брендивинского моста';$('pause-description').textContent='Четыре километра рек, полей и лесистых холмов. Мост ведёт к Бакленду и восточным тропам.';
document.querySelector('.badge')!.textContent='Брендивинский мост';$('forest-controls').hidden=true;document.querySelector('.muted')!.textContent='Область 4 × 4 км';
document.querySelector('nav')!.innerHTML='';for(const id of ['INN','NORTH_GATE','ROAD_LOOKOUT','RANGER_SHELTER','WATER_FOOTBRIDGE','UPPER_LANDING_W']){const p=world.data.geo.source.pois.find((p:any)=>p.id===id),button=document.createElement('button');button.textContent=p.name;button.onclick=()=>void travel(p.point[0],p.point[1]+(id==='WATER_FOOTBRIDGE'?-40:12)).catch(e=>errors.push(String(e)));document.querySelector('nav')!.append(button);}
$('reset').onclick=()=>void travel(-220,-105).catch(e=>ui.show(String(e)));$<HTMLSelectElement>('preset').innerHTML='<option>Свободный ракурс</option>';
document.querySelector('nav')!.hidden=new URLSearchParams(location.search).get('debug')!=='1';
canvas.setAttribute('aria-label','Брендивинский мост. WASD — движение, E — взаимодействие, M — карта, правая кнопка мыши — осмотр.');document.querySelector('.eyebrow')!.textContent='Древлепуща / Брендивинский мост';
window.addEventListener('keydown',e=>{if((e.target as HTMLElement)?.matches('input,select,textarea')||document.querySelector('dialog[open]'))return;if(e.code==='KeyM'){ui.toggle();return;}if(e.code==='KeyE'&&!e.repeat){interact();return;}if(e.code==='Escape'){setPaused(!paused);return;}if(e.code==='Space'){yaw=player.heading;e.preventDefault();}keys.add(e.code);});window.addEventListener('keyup',e=>keys.delete(e.code));bindInputFocus(canvas,()=>{keys.clear();dragging=false;});
canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('pointerdown',e=>{if(e.button===2){dragging=true;canvas.setPointerCapture(e.pointerId);}});canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointermove',e=>{if(dragging){yaw=normalizeAzimuth(yaw+e.movementX*.2);pitch=Math.max(-70,Math.min(cameraConfig.travel.pitchMaxDeg,pitch+e.movementY*.16));}});canvas.addEventListener('wheel',e=>{distance=Math.max(cameraConfig.travel.distanceMinM,Math.min(cameraConfig.travel.distanceMaxM,distance+e.deltaY*.004));e.preventDefault();},{passive:false});window.addEventListener('resize',()=>engine.resize());
const quality=$<HTMLSelectElement>('resolution-quality');function resize(){const size=renderResolution(canvas.clientWidth,canvas.clientHeight,devicePixelRatio,quality.value as ResolutionQuality);engine.setSize(size.width,size.height);}quality.onchange=resize;window.addEventListener('resize',resize);resize();
if(new URLSearchParams(location.search).get('debug')==='1')(window as any).__region={state,travel,pause:setPaused,world,player,scene,query,session,interact,save,ui,daylight,sight:(e:number,n:number)=>regionSight({...player,h:player.height+1.65},{e,n,h:world.data.geo.height(e,n)+1.65},world.data.geo.height)};
window.addEventListener('pagehide',save);scene.onDisposeObservable.add(()=>{audio.dispose();rain.dispose();ranger.dispose();ui.dispose();});
engine.runRenderLoop(()=>{
 if(document.hidden){previous=performance.now();return;}const now=performance.now(),elapsed=now-previous,dt=Math.min(.05,elapsed/1000);previous=now;if(!paused&&!loading){performanceSamples.push(elapsed);if(performanceSamples.length>600)performanceSamples.shift();}
 try{
  let speed=0;const running=keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.state.running;
  if(!paused&&!loading){let forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'))+touch.state.forward,right=Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+touch.state.right;const len=Math.max(1,Math.hypot(forward,right));forward/=len;right/=len;const a=yaw*Math.PI/180,v=running?15:1.85,de=(Math.sin(a)*forward+Math.cos(a)*right)*v*dt,dn=(Math.cos(a)*forward-Math.sin(a)*right)*v*dt;
   if(player.mode==='boat')session.row(de/v*(running?1.6:.8),dn/v*(running?1.6:.8),query.ready,structures.bridgePierAt);
   else{const next=moveOnTerrain(player,de,dn,query,world.data.manifest.bounds);speed=Math.hypot(next.e-player.e,next.n-player.n)/Math.max(dt,.001);if(speed>.01)player.heading=normalizeAzimuth(Math.atan2(next.e-player.e,next.n-player.n)*180/Math.PI);Object.assign(player,next);const support=surface(player.e,player.n);player.height=support.height;player.supportId=support.supportId;}
   session.tick(dt,(e,n)=>world.data.ready(e,n)&&query.blocked(e,n));
  }
  const h=loading?world.data.geo.height(player.e,player.n):player.height,offset=cameraOffset(yaw+180,Math.max(0,pitch),distance),eye={e:player.e+offset.x,n:player.n-offset.z,h:h+.95+offset.y};
  eye.h+=terrainCameraLift({x:eye.e,y:eye.h,z:-eye.n},{x:player.e,y:h+.95,z:-player.n},(e,n)=>world.data.height(e,n));
  const budget=world.update(player,eye,h,dt);hero.position.set(player.e-world.origin.e,h,world.origin.n-player.n);hero.rotation.y=-player.heading*Math.PI/180;
  camera.position.set(eye.e-world.origin.e,eye.h,world.origin.n-eye.n);camera.setTarget(new Vector3(hero.position.x,h+.95+Math.tan(Math.max(0,-pitch)*Math.PI/180)*distance,hero.position.z));
  const active=paused||loading?0:dt;ranger.update(active,speed,running);wind.update(active,{x:eye.e,y:eye.h,z:-eye.n});daylight.update(active);rain.update(active,camera.position,daylight.precipitation(),daylight.daylightAmount());audio.update(active,daylight.hour(),{x:eye.e,y:eye.h,z:-eye.n},{x:Math.sin(yaw*Math.PI/180),y:0,z:-Math.cos(yaw*Math.PI/180)},daylight.precipitation());
  structures.update(player,h,camera.position,dt,session.state.gateOpen,budget);actors.update(active,budget);undergrowth.update(player,budget);wildlife.update(active,{id:'ranger',...player,h,speedMps:speed,headingDeg:player.heading,running,observedAtMs:session.state.clock*1000},{totalGameHours:daylight.stats().totalGameHours,daylight01:daylight.daylightAmount(),precipitation01:daylight.precipitation()},budget);
  sun.position.copyFrom(hero.position.subtract(sun.direction.scale(60)));shadows.getShadowMap()!.renderList=[...hero.getChildMeshes(),...world.trees.shadows(player),...actors.shadowMeshes(),...wildlife.shadowMeshes({...player,h}),...structures.meshes.filter(m=>m.isEnabled()&&Vector3.Distance(m.position,hero.position)<45)];scene.render();frames++;
  if(now-audioTreesAt>1000){audioTreesAt=now;audio.setTreePositions(world.trees.resident.map(t=>({x:t.e,y:t.h,z:-t.n})));const shore=Math.min(...world.data.geo.nearbyWater(player.e,player.n).map((q:any)=>Math.max(0,q.distance-q.width/2)));audio.setEnvironment(Math.min(1,world.trees.resident.filter(t=>Math.hypot(t.e-player.e,t.n-player.n)<65).length/25),Math.max(0,1-shore/65));}
  if(now-lastUi>500){lastUi=now;if(!paused&&!loading)session.discover((e,n)=>regionSight({...player,h:player.height+1.65},{e,n,h:world.data.geo.surfaceHeight(e,n)+1},world.data.geo.surfaceHeight).visible);ui.update(nearbyAction()?.label??'');$('fps').textContent=Math.round(engine.getFps())+' FPS';$('metrics').textContent=`${world.terrain.patches.size} участков · ${world.trees.resident.length} деревьев рядом · кадр p95 ${state().frameMs.p95?.toFixed(1)??'—'} мс`;$('location').textContent=world.data.geo.zoneAt(player.e,player.n)?.name??'Пойма';}
  if(!loading&&now-saveAt>10000){saveAt=now;save();}
 }catch(e){if(!errors.includes(String(e))){errors.push(String(e));console.error(e);}setPaused(true);$('pause-description').textContent='Не удалось обновить сцену. '+String(e);}
});
await start.stage('Готовим место прогулки…',async()=>{await world.prepare(player);if(!restored)player.height=world.data.height(player.e,player.n);loading=false;});
await start.reveal(()=>frames>0&&world.terrain.ready(player),()=>setPaused(false));
if(restoreNotice)ui.show(restoreNotice);else if(restored)ui.show('Прогулка продолжена с сохранённого места.');
