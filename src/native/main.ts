import {terrainCameraLift,showcaseHeight,showcasePath} from '../domain/showcase.ts';
import {FOREST_BOUNDS} from '../domain/forest.ts';
import {groundHeight,moveWalker,walkerIsClear} from '../domain/harness.ts';
import {collisionGrid} from '../domain/collision-grid.ts';
import {cameraOffset,normalizeAzimuth,shortestAngleDelta} from '../domain/coordinates.ts';
import {createShowcaseMap} from '../runtime/showcase-map.ts';
import {createTouchControls} from '../runtime/touch-controls.ts';
import {SceneStartup,bindInputFocus} from '../runtime/startup.ts';
import {showcaseResolution} from '../runtime/showcase-quality.ts';
import {WindSystem} from '../runtime/wind.ts';
import {createWindControls} from '../runtime/wind-controls.ts';
import {ShowcaseAudio} from '../runtime/showcase-audio.ts';
import {createNativeRenderer} from './renderer.ts';
import {showcaseVisuals} from './showcase-visuals.ts';
import {createNativeMultiplayer} from './multiplayer.ts';
import {createNativeAtmosphere} from './atmosphere.ts';
import {SKY_DEFAULTS} from '../domain/sky.ts';
import config from '../../config/camera-presets.json';
import targets from '../../config/render-targets.json';
import '../runtime/daylight.css';
import '../showcase.css';
import '../style.css';

const canvas=document.querySelector<HTMLCanvasElement>('#world')!;
const pausePanel=document.querySelector<HTMLElement>('#pause')!,resume=document.querySelector<HTMLButtonElement>('#resume')!,metrics=document.querySelector<HTMLElement>('#metrics')!;
const startup=new SceneStartup(resume),keys=new Set<string>(),errors:string[]=[];
let paused=true,dragging=false,stopped=false;
let release:undefined|(()=>void);
function fail(error:unknown){
 if(stopped)return;stopped=true;const message=String(error);errors.push(message);keys.clear();paused=true;
 document.body.classList.remove('booting');pausePanel.hidden=false;
 document.querySelector('#pause-title')!.textContent='Не удалось открыть стенд';
 document.querySelector('#pause-description')!.textContent=message;
 resume.textContent='Перезагрузить';resume.disabled=false;resume.onclick=()=>location.reload();
 release?.();
}

try{
 const renderer=await startup.stage('Запускаем WebGPU и готовим лес…',()=>createNativeRenderer(canvas,message=>fail(message),showcaseVisuals,label=>startup.progress(label)));
 release=renderer.dispose;
 const nearbyColliders=collisionGrid(renderer.boxes);
 const wind=new WindSystem(),ambient=new ShowcaseAudio(wind,renderer.boxes);
 const disposeWindControls=createWindControls(wind);
 const daylight=createNativeAtmosphere();
 document.body.classList.add('showcase');document.title='Древлепуща — лесные ложбины';
 document.querySelector('.badge')!.textContent='Древлепуща · WebGPU';
 document.querySelector('.muted')!.textContent='Шоукейс · 512 × 640 м · прямой WebGPU.';
 document.querySelector('#pause-description')!.textContent='Лесные берега, боковые промоины и солнечные просветы. Идите по тропе или поднимитесь на склон. M — карта рельефа.';
 document.querySelector<HTMLElement>('#forest-controls')!.hidden=true;
 const checkpoints={entrance:{e:0,n:0},trunks:{e:0,n:10},arch:{e:0,n:21},slope:{e:0,n:34},outer:{e:showcasePath(160),n:160}};
 for(const [id,label] of [['entrance','01 Вход'],['trunks','02 Папоротники'],['arch','03 Просвет'],['slope','04 К поляне']] as const)document.querySelector(`[data-checkpoint="${id}"]`)!.textContent=label;
 document.querySelector('footer nav')!.insertAdjacentHTML('beforeend','<button data-checkpoint="outer" type="button">05 Дальний лес</button>');
 const player={e:0,n:0,heading:0},camera={x:0,y:2,z:5};
 const multiplayer=createNativeMultiplayer(player,(e,n)=>walkerIsClear({e,n},renderer.boxes));
 let yaw=0,yawTarget=0,pitch=6,distance=config.travel.distanceM,cameraLift=0,speed=0,seconds=0;
 let frameCount=0,previous=performance.now(),uiAt=0,demo=false,demoTime=0;
 let collect=false;const samples:number[]=[],frameCosts:{cpuMs:number;gpuMs:null}[]=[];
 const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
 function setPaused(value:boolean){paused=value;keys.clear();dragging=false;pausePanel.hidden=!value;ambient.setPaused(value);if(value){multiplayer.stopMotion();document.querySelector('#pause-title')!.textContent='Прогулка на паузе';resume.textContent='Продолжить';}previous=performance.now();}
 function focusScene(){setPaused(false);void ambient.start();canvas.focus({preventScroll:true});}
 function reset(id:keyof typeof checkpoints='entrance'){
  const point=checkpoints[id];player.e=point.e;player.n=point.n;player.heading=0;
  yaw=yawTarget=0;pitch=6;distance=config.travel.distanceM;keys.clear();demo=false;
 }
 const select=document.querySelector<HTMLSelectElement>('#preset')!,labels=['Тропа прямо','Осмотр слева','Осмотр справа','Взгляд в кроны','Рядом со стволом','Широкий проход'];
 config.visualReviewPresets.forEach((p,i)=>select.add(new Option(labels[i],p.id)));
 function preset(id:string){const p=config.visualReviewPresets.find(v=>v.id===id);if(!p)throw new Error(`Неизвестный ракурс: ${id}`);yaw=yawTarget=normalizeAzimuth(p.yawDeg);pitch=p.pitchDeg;distance=p.distanceM;select.value=id;}
 select.onchange=()=>{preset(select.value);focusScene();};
 document.querySelector('#reset')!.addEventListener('click',()=>{reset();focusScene();});
 for(const button of document.querySelectorAll<HTMLButtonElement>('[data-checkpoint]'))button.onclick=()=>{reset(button.dataset.checkpoint as keyof typeof checkpoints);focusScene();};
 const atlas=createShowcaseMap(()=>({...player,yaw}),setPaused,(e,n)=>{player.e=e;player.n=n;keys.clear();demo=false;});
 const touch=createTouchControls(canvas,{active:()=>!paused,engage:()=>{demo=false;},look:(x,y)=>{yawTarget=normalizeAzimuth(yawTarget+x*.2);pitch=clamp(pitch+y*.16,-70,config.travel.pitchMaxDeg);},zoom:delta=>{distance=clamp(distance+delta,config.travel.distanceMinM,config.travel.distanceMaxM);}});
 canvas.addEventListener('contextmenu',event=>event.preventDefault());
 canvas.addEventListener('pointerdown',event=>{if(paused)return;canvas.focus();void ambient.start();if(event.button===2){dragging=true;canvas.setPointerCapture(event.pointerId);event.preventDefault();}});
 canvas.addEventListener('pointermove',event=>{if(paused||!dragging)return;yawTarget=normalizeAzimuth(yawTarget+event.movementX*.2);pitch=clamp(pitch+event.movementY*.16,-70,config.travel.pitchMaxDeg);});
 for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{dragging=false;});
 canvas.addEventListener('wheel',event=>{if(paused)return;event.preventDefault();distance=clamp(distance+event.deltaY*.004,config.travel.distanceMinM,config.travel.distanceMaxM);},{passive:false});
 window.addEventListener('keydown',event=>{
  if(event.code==='Escape'&&startup.readyAt!==null){event.preventDefault();paused?focusScene():setPaused(true);return;}
  if(paused||document.activeElement!==canvas)return;
  if(['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight'].includes(event.code)){
   event.preventDefault();keys.add(event.code);demo=false;
   if(event.code==='Space'){yawTarget=player.heading;pitch=6;distance=config.travel.distanceM;}
  }
 });
 window.addEventListener('keyup',event=>keys.delete(event.code));
 bindInputFocus(canvas,()=>{keys.clear();dragging=false;touch.reset();multiplayer.stopMotion();previous=performance.now();});
 const qualitySelect=document.querySelector<HTMLSelectElement>('#resolution-quality')!;
 document.querySelector<HTMLLabelElement>('label[for="resolution-quality"]')!.textContent='Качество графики';
 qualitySelect.innerHTML='<option value="performance">Экономно</option><option value="balanced">Среднее</option><option value="high">Высокое</option><option value="native">По экрану</option>';
 type Quality='performance'|'balanced'|'high'|'native';let quality:Quality='high';
 try{const saved=localStorage.getItem('native-showcase-quality');if(saved&&['performance','balanced','high','native'].includes(saved))quality=saved as Quality;}catch{}
 qualitySelect.value=quality;
 const skyQuality=()=>quality==='performance'?0:quality==='balanced'?1:2;
 daylight.setQuality(skyQuality());
 function resize(){
  const size=showcaseResolution(canvas.clientWidth,canvas.clientHeight,devicePixelRatio,quality,8192);
  // Dense display pixels already smooth silhouettes; 4× MSAA serves lower-density high-quality views.
  const msaaDisabled=new URLSearchParams(location.search).get('debug')==='1'&&new URLSearchParams(location.search).get('msaa')==='0';
  const samples:1|4=!msaaDisabled&&(quality==='high'||quality==='native')&&size.scale<1.5?4:1;
  renderer.resize(size.width,size.height,samples);
 }
 qualitySelect.onchange=()=>{quality=qualitySelect.value as Quality;daylight.setQuality(skyQuality());try{localStorage.setItem('native-showcase-quality',quality);}catch{}resize();};
 window.addEventListener('resize',resize);resize();
 function state(){
  const h=groundHeight(player.e,player.n),anchor={x:player.e,y:h+config.travel.targetHeightM,z:-player.n},offset=cameraOffset(yaw+180,Math.max(0,pitch),distance),rs=renderer.stats();
  return {ready:startup.readyAt!==null,loading:startup.stats(),frameCount,paused,player:{...player,h},
   camera:{...camera,yaw,pitch,distance,currentDistance:Math.hypot(camera.x-anchor.x,camera.y-anchor.y,camera.z-anchor.z),followError:Math.hypot(camera.x-anchor.x-offset.x,camera.y-anchor.y-offset.y-cameraLift,camera.z-anchor.z-offset.z),terrainLift:cameraLift,clearance:camera.y-groundHeight(camera.x,-camera.z)},
   mapOpen:atlas.isOpen(),playerClear:walkerIsClear(player,renderer.boxes),
   render:{width:canvas.width,height:canvas.height,backend:'webgpu',pipeline:'direct',triangles:rs.triangles,shadowTriangles:rs.shadowTriangles,mainTriangles:rs.triangles-rs.shadowTriangles,drawCalls:rs.drawCalls,meshes:rs.visibleTrees+3,gpu:rs.device,gpuTiming:false,msaaSamples:rs.sampleCount,devicePixelRatio,internalDpr:canvas.height/Math.max(1,canvas.clientHeight),resolutionQuality:quality},
   errors:[...errors],seed:targets.fixedSeed,sceneVersion:'ravine-native-webgpu-v1',demo,forest:{trees:rs.trees,activeTrees:rs.visibleTrees,assetLabel:'Нативный лес WebGPU'},floor:{grass:true},wind:wind.stats(),ambient:ambient.stats(),multiplayer:multiplayer.state(),lighting:{daylight:daylight.stats(),mapSize:1024},rain:{enabled:daylight.precipitation()>.0001,instances:rs.rainInstances,precipitation:daylight.precipitation()},
  };
 }
 if(new URLSearchParams(location.search).get('debug')==='1')Object.assign(window,{m0:{state,reset,preset,setPaused,
  setTime:daylight.setTime,setGameDay:daylight.setGameDay,setAutomatic:daylight.setAutomatic,setFog:daylight.setFog,setRays:daylight.setRays,
  setMoon:daylight.setMoon,setWeather:daylight.setWeather,setWeatherTime:daylight.setWeatherTime,setSky:daylight.setSky,setSkyAnimationTime:daylight.setSkyAnimationTime,resetSky:()=>daylight.setSky(SKY_DEFAULTS),
  beginMeasurement:()=>{samples.length=0;frameCosts.length=0;collect=true;},endMeasurement:()=>{collect=false;return [...samples];},frameCosts:()=>[...frameCosts],
  teleport:(e:number,n:number,heading=0)=>{if(![e,n,heading].every(Number.isFinite)||e<FOREST_BOUNDS.minE+1||e>FOREST_BOUNDS.maxE-1||n<FOREST_BOUNDS.minN+1||n>FOREST_BOUNDS.maxN-1||!walkerIsClear({e,n},renderer.boxes))throw new Error('Недоступная точка');player.e=e;player.n=n;player.heading=heading;keys.clear();},
  setCamera:(a:number,b:number,c:number)=>{yawTarget=normalizeAzimuth(a);pitch=clamp(b,-70,config.travel.pitchMaxDeg);distance=clamp(c,config.travel.distanceMinM,config.travel.distanceMaxM);},
  startTraversal:(e=0,n=0,running=false)=>{reset();player.e=e;player.n=n;demo=true;demoTime=0;setPaused(false);canvas.focus();if(running)keys.add('ShiftLeft');},stopTraversal:()=>{demo=false;},
 }});
 function tick(now:number){
  if(stopped)return;
  requestAnimationFrame(tick);
  if(document.hidden||atlas.isOpen()){previous=now;return;}
  try{
   const rawDt=now-previous,dt=Math.min(Math.max(rawDt/1000,0),.05);previous=now;
   let running=false;
   if(!paused){
    if(collect&&frameCount>2&&samples.length<18000)samples.push(rawDt);
    yaw=normalizeAzimuth(yaw+shortestAngleDelta(yaw,yawTarget)*(1-Math.exp(-dt/.085)));
    let forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'))+touch.state.forward;
    let right=Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+touch.state.right;
    let de=0,dn=0;
    if(demo){demoTime+=dt;const phase=demoTime%60;dn=phase<27?1:phase<30?0:phase<57?-1:0;const delta=showcasePath(player.n+dn)-player.e;de=delta;const length=Math.hypot(de,dn)||1;de/=length;dn/=length;yawTarget=normalizeAzimuth(Math.atan2(de,dn)*180/Math.PI);pitch=6;}
    else if(forward||right){const scale=1/Math.max(1,Math.hypot(forward,right)),a=yaw*Math.PI/180;forward*=scale;right*=scale;de=forward*Math.sin(a)+right*Math.cos(a);dn=forward*Math.cos(a)-right*Math.sin(a);}
    running=keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.state.running;
    const before={...player},next=de||dn?moveWalker(player,de*(running?15:1.85)*dt,dn*(running?15:1.85)*dt,nearbyColliders(player,de*15*dt,dn*15*dt),FOREST_BOUNDS):player;
    player.e=next.e;player.n=next.n;speed=dt>0?Math.hypot(player.e-before.e,player.n-before.n)/dt:0;
    if(speed>.0001){const heading=normalizeAzimuth(Math.atan2(player.e-before.e,player.n-before.n)*180/Math.PI);player.heading=normalizeAzimuth(player.heading+shortestAngleDelta(player.heading,heading)*(1-Math.exp(-dt/.1)));}
    seconds+=dt;
   }else speed=0;
   wind.setShared(multiplayer.inRoom());daylight.setClock(multiplayer.clock());daylight.update(paused?0:dt);
   const h=groundHeight(player.e,player.n),anchor={x:player.e,y:h+config.travel.targetHeightM,z:-player.n};
   const offset=cameraOffset(yaw+180,Math.max(0,pitch),distance),desired={x:anchor.x+offset.x,y:anchor.y+offset.y,z:anchor.z+offset.z};
   const safe=terrainCameraLift(desired,anchor);cameraLift=Math.max(safe,cameraLift*Math.exp(-dt/.18));desired.y+=cameraLift;
   Object.assign(camera,desired);const lookUp=Math.tan(Math.max(0,-pitch)*Math.PI/180)*distance;
   const target={x:anchor.x,y:anchor.y+lookUp,z:anchor.z};
   multiplayer.update(dt,paused?0:speed,!paused&&running,camera,target,canvas.width,canvas.height);
   wind.update(paused?0:dt,camera);
   ambient.update(paused?0:dt,daylight.hour(),camera,{x:target.x-camera.x,y:target.y-camera.y,z:target.z-camera.z},daylight.precipitation());
   const sky=daylight.sky();
   renderer.render({eye:[camera.x,camera.y,camera.z],target:[target.x,target.y,target.z],player,daylight:daylight.light(),dt:paused?0:dt,speed,seconds,fogDensity:daylight.fog(),weather:daylight.weather(),sky:sky.settings,skySeconds:sky.seconds,skyQuality:sky.quality,rays:daylight.rays(),wind,cloakColor:multiplayer.cloakColor(),remotes:multiplayer.remotes()});
   frameCount++;
   if(collect&&!paused&&frameCosts.length<18000)frameCosts.push({cpuMs:performance.now()-now,gpuMs:null});
   if(now-uiAt>400){uiAt=now;document.querySelector('#fps')!.textContent=`${Math.round(1000/Math.max(1,rawDt))} FPS`;
    if(document.querySelector<HTMLDetailsElement>('#diagnostics')!.open){const rs=renderer.stats();metrics.textContent=`${canvas.width} × ${canvas.height} · прямой WebGPU\n${Math.round(rs.triangles-rs.shadowTriangles).toLocaleString('ru-RU')} треуг. в кадре · ${Math.round(rs.shadowTriangles).toLocaleString('ru-RU')} в тенях\n${rs.drawCalls} вызовов отрисовки · ${rs.visibleTrees} видимых деревьев\nКамера ${distance.toFixed(1)} м · наклон ${pitch.toFixed(0)}°`;}
    document.querySelector('#location')!.textContent=Math.abs(player.e)>24||player.n<-12||player.n>64?'Большой лес':player.n<10?'Западный вход':player.n<19?'Между стволами':player.n<30?'Лесная тропа':player.n<47?'Подъём к свету':'Верхняя поляна';
   }
  }catch(error){fail(error);}
 }
 requestAnimationFrame(tick);
 await startup.reveal(()=>frameCount>2,focusScene);
 window.addEventListener('pagehide',()=>{multiplayer.dispose();ambient.dispose();daylight.dispose();disposeWindControls();wind.dispose();release?.();release=undefined;stopped=true;},{once:true});
}catch(error){fail(error);}
