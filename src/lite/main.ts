import {createDaylight} from './daylight.ts';
import {terrainCameraLift,showcasePath} from '../domain/showcase.ts';
import {createShowcaseMap} from '../runtime/showcase-map.ts';
import '../showcase.css';
import {collisionGrid} from '../domain/collision-grid.ts';
import {createTouchControls} from '../runtime/touch-controls.ts';
import {
 addToScene,createEngine,createFreeCamera,createPcfDirectionalShadowGenerator,createSceneContext,
 decodeError,enableErrorDecoding,enableMaterialPlugins,onBeforeRender,registerSceneWithShadowSupport,
 resizeSurface,setGpuTimingEnabled,setSceneImageProcessing,setShadowTaskCasterMeshes,setSurfaceSize,startEngine,
} from '@babylonjs/lite';
import '../style.css';
import {renderResolution} from '../runtime/resolution.ts';
import type {ResolutionQuality} from '../runtime/resolution.ts';
import {FOREST_BOUNDS} from '../domain/forest.ts';
import {createForest} from './forest.ts';
import {createWorld,CHECKPOINTS} from './world.ts';
import {createForestFloor} from './floor.ts';
import {groundHeight,moveWalker,occludesTraveller,fadeOpacity,walkerIsClear} from '../domain/harness.ts';
import {cameraOffset,normalizeAzimuth,shortestAngleDelta} from '../domain/coordinates.ts';
import config from '../../config/camera-presets.json';
import targets from '../../config/render-targets.json';

enableErrorDecoding();
let canvas=document.querySelector<HTMLCanvasElement>('#world')!;
const pausePanel=document.querySelector<HTMLElement>('#pause')!;
const resume=document.querySelector<HTMLButtonElement>('#resume')!;
const metrics=document.querySelector<HTMLElement>('#metrics')!;
const keys=new Set<string>();
let paused=true,dragging=false;
const errors:string[]=[];
function fail(message:string){
 errors.push(message);paused=true;keys.clear();pausePanel.hidden=false;
 document.querySelector('#pause-title')!.textContent='Не удалось открыть стенд';
 document.querySelector('#pause-description')!.textContent=message;
 resume.textContent='Перезагрузить';resume.disabled=false;
 resume.onclick=()=>location.reload();
}

try{
 const engine=await createEngine(canvas,{msaaSamples:4,maxDevicePixelRatio:2});
 canvas=engine.canvas as HTMLCanvasElement;
 const rendererSelect=document.querySelector<HTMLSelectElement>('#renderer')!;
 rendererSelect.value='webgpu';
 rendererSelect.onchange=()=>{const url=new URL(location.href);url.searchParams.set('renderer',rendererSelect.value);if(rendererSelect.value!=='webgpu')url.searchParams.delete('engine');location.assign(url);};
 const scene=createSceneContext(engine);
 const camera=createFreeCamera({x:0,y:2,z:5},{x:0,y:1,z:0});
 camera.nearPlane=config.travel.nearClipM;camera.farPlane=1000;
 camera.fov=config.travel.fovVerticalDeg*Math.PI/180;scene.camera=camera;
 const minimumPitch=-70;
 const shadowMatrix=new Float32Array(16);shadowMatrix[0]=shadowMatrix[5]=shadowMatrix[10]=shadowMatrix[15]=1;
 const world=await createWorld(engine,scene,shadowMatrix);
 const forest=await createForest(engine,scene,world.sun,shadowMatrix);
 world.boxes.push(...forest.boxes);
 document.title='Древлепуща — лесные ложбины';
 document.querySelector('.badge')!.textContent=forest.stats().assetLabel??'Lite';
 document.querySelector('.muted')!.textContent='Шоукейс · Babylon Lite · 512 × 640 м.';
 for(const [id,label] of [['entrance','01 Вход'],['trunks','02 Папоротники'],['arch','03 Просвет'],['slope','04 К поляне']] as const)
  document.querySelector(`[data-checkpoint="${id}"]`)!.textContent=label;
 document.querySelector('nav')!.insertAdjacentHTML('beforeend','<button data-checkpoint="outer" type="button">05 Дальний лес</button>');
 const nearbyColliders=collisionGrid(world.boxes);
 const feetRef={x:0,y:0,z:0};
 const floor=await createForestFloor(engine,scene,world.boxes,feetRef);
 const sunlight=createPcfDirectionalShadowGenerator(engine,world.sun,{mapSize:512,darkness:0.18,bias:0.001,normalBias:0.025,orthoMinZ:1,orthoMaxZ:110,forceRefreshEveryFrame:true});
 addToScene(scene,sunlight);
 await setSceneImageProcessing(scene,{exposure:1.08,contrast:1.16});
 const daylight=createDaylight(scene,world.sun,world.fill,{setRays:()=>{}},()=>({x:camera.position.x,y:camera.position.y,z:camera.position.z}));
 const lightDirection={x:0,y:-1,z:0},lightRight={x:1,y:0,z:0},lightUp={x:0,y:1,z:0};
 const forestControls=document.querySelector<HTMLElement>('#forest-controls')!;forestControls.hidden=false;
 const weatherSelect=document.querySelector<HTMLSelectElement>('#forest-weather')!;
 document.querySelector<HTMLLabelElement>('label[for="forest-weather"]')!.hidden=true;weatherSelect.hidden=true;
 const treeColor=document.querySelector<HTMLInputElement>('#tree-color')!;
 document.querySelector<HTMLElement>('#tree-color-label')!.hidden=!forest.stats().colorVersion;
 treeColor.onchange=()=>forest.setColorVariation(treeColor.checked);
 document.querySelector<HTMLInputElement>('#near-only')!.onchange=e=>forest.setNearOnly((e.target as HTMLInputElement).checked);
 const player={e:0,n:0,heading:0};
 let yaw=0,yawTarget=0,pitch=6,distance=config.travel.distanceM;
 let frameCount=0,previousTime=performance.now(),uiTime=0;
 const samples:number[]=[],maxSamples=60*60*5;
 let collect=false;const frameCosts:{cpuMs:number;gpuMs:number}[]=[];
 let demo=false,demoTime=0,cameraLift=0;
 const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
 function setPaused(value:boolean){
  paused=value;keys.clear();dragging=false;pausePanel.hidden=!value;
  if(value){document.querySelector('#pause-title')!.textContent='Прогулка на паузе';resume.textContent='Продолжить';}
  previousTime=performance.now();
 }
 function focusScene(){setPaused(false);canvas.focus({preventScroll:true});}
 function reset(checkpoint:keyof typeof CHECKPOINTS='entrance'){
  const c=CHECKPOINTS[checkpoint];player.e=c.e;player.n=c.n;player.heading=0;
  yaw=yawTarget=0;pitch=6;distance=config.travel.distanceM;keys.clear();demo=false;
 }
 const labels=['Тропа прямо','Осмотр слева','Осмотр справа','Взгляд в кроны','Рядом со стволом','Широкий проход'];
 const select=document.querySelector<HTMLSelectElement>('#preset')!;
 config.visualReviewPresets.forEach((p,i)=>select.add(new Option(labels[i],p.id)));
 function preset(id:string){
  const p=config.visualReviewPresets.find(x=>x.id===id);
  if(!p)throw new Error(`Unknown preset ${id}`);
  yaw=yawTarget=normalizeAzimuth(p.yawDeg);pitch=p.pitchDeg;distance=p.distanceM;select.value=id;
 }
 select.onchange=()=>{preset(select.value);focusScene();};
 document.querySelector('#reset')!.addEventListener('click',()=>{reset();focusScene();});
 for(const button of document.querySelectorAll<HTMLButtonElement>('[data-checkpoint]'))
  button.onclick=()=>{reset(button.dataset.checkpoint as keyof typeof CHECKPOINTS);focusScene();};
 resume.textContent='Растительность · …';
 await floor.prepare({x:player.e,y:groundHeight(player.e,player.n),z:-player.n},ready=>{resume.textContent=`Растительность · ${ready}`;});
 resume.disabled=false;resume.textContent='Начать прогулку';resume.onclick=focusScene;
 const atlas=createShowcaseMap(()=>({...player,yaw}),setPaused,(e,n)=>{player.e=e;player.n=n;keys.clear();demo=false;});
 document.body.classList.add('showcase');
 document.querySelector('h1')!.textContent='Лесные ложбины';
 document.querySelector('#pause-title')!.textContent='Там, где тропа уходит вниз';
 document.querySelector('#pause-description')!.textContent='Lite-стенд. Лесные берега и солнечные просветы. M — карта рельефа.';
 const touch=createTouchControls(canvas,{
  active:()=>!paused,engage:()=>{demo=false;},
  look:(x,y)=>{yawTarget=normalizeAzimuth(yawTarget+x*0.2);pitch=clamp(pitch+y*0.16,minimumPitch,config.travel.pitchMaxDeg);},
  zoom:delta=>{distance=clamp(distance+delta,config.travel.distanceMinM,config.travel.distanceMaxM);},
 });
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 canvas.addEventListener('pointerdown',e=>{if(paused)return;canvas.focus();if(e.button===2){dragging=true;canvas.setPointerCapture(e.pointerId);e.preventDefault();}});
 canvas.addEventListener('pointermove',e=>{if(paused||!dragging)return;yawTarget=normalizeAzimuth(yawTarget+e.movementX*0.2);pitch=clamp(pitch+e.movementY*0.16,minimumPitch,config.travel.pitchMaxDeg);});
 const stopDrag=()=>{dragging=false;};
 canvas.addEventListener('pointerup',stopDrag);canvas.addEventListener('pointercancel',stopDrag);canvas.addEventListener('lostpointercapture',stopDrag);
 canvas.addEventListener('wheel',e=>{if(paused)return;e.preventDefault();distance=clamp(distance+e.deltaY*0.004,config.travel.distanceMinM,config.travel.distanceMaxM);},{passive:false});
 window.addEventListener('keydown',e=>{
  if(e.code==='Escape'){e.preventDefault();if(paused)focusScene();else setPaused(true);return;}
  if(paused||document.activeElement!==canvas)return;
  if(['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight'].includes(e.code)){
   e.preventDefault();keys.add(e.code);demo=false;
   if(e.code==='Space'){yawTarget=player.heading;pitch=6;distance=config.travel.distanceM;}
  }
 });
 window.addEventListener('keyup',e=>keys.delete(e.code));
 window.addEventListener('blur',()=>setPaused(true));
 canvas.addEventListener('blur',()=>{keys.clear();dragging=false;});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)setPaused(true);});
 const qualitySelect=document.querySelector<HTMLSelectElement>('#resolution-quality')!;
 let quality:ResolutionQuality='high';
 try{const saved=localStorage.getItem('resolution-quality');if(['performance','balanced','high','native'].includes(saved??''))quality=saved as ResolutionQuality;}catch{/* */}
 qualitySelect.value=quality;
 function resize(){
  const size=renderResolution(canvas.clientWidth,canvas.clientHeight,window.devicePixelRatio,quality,8192);
  engine.maxDevicePixelRatio=size.scale;setSurfaceSize(engine,size.width,size.height);resizeSurface(engine);
 }
 qualitySelect.onchange=()=>{quality=qualitySelect.value as ResolutionQuality;try{localStorage.setItem('resolution-quality',quality);}catch{}resize();};
 window.addEventListener('resize',resize);resize();
 const occluderOpacity=new Map<string,number>();
 function state(){
  const pos={x:camera.position.x,y:camera.position.y,z:camera.position.z};
  const anchor={x:player.e,y:groundHeight(player.e,player.n)+config.travel.targetHeightM,z:-player.n};
  const offset=cameraOffset(yaw+180,Math.max(0,pitch),distance);
  const currentDistance=Math.hypot(pos.x-anchor.x,pos.y-anchor.y,pos.z-anchor.z);
  const followError=Math.hypot(pos.x-anchor.x-offset.x,pos.y-anchor.y-offset.y-cameraLift,pos.z-anchor.z-offset.z);
  return {
   ready:frameCount>2,frameCount,paused,player:{...player,h:groundHeight(player.e,player.n)},
   camera:{...pos,yaw,pitch,distance,currentDistance,followError,terrainLift:cameraLift,clearance:pos.y-groundHeight(pos.x,-pos.z)},mapOpen:atlas.isOpen(),
   playerClear:walkerIsClear(player,world.boxes),
   faded:[...occluderOpacity.entries()].filter(([,o])=>o<1).map(([id,opacity])=>({id,opacity})),
   render:{width:canvas.width,height:canvas.height,backend:'webgpu',webGLVersion:null,
    triangles:0,shadowTriangles:0,mainTriangles:0,drawCalls:engine.drawCallCount,meshes:scene.meshes.length,
    gpu:{vendor:'webgpu',renderer:'lite',version:'1.28.0'},fallbackReason:null,devicePixelRatio:window.devicePixelRatio,internalDpr:canvas.height/Math.max(1,canvas.clientHeight),resolutionQuality:quality},
   errors:[...errors],seed:targets.fixedSeed,sceneVersion:'ravine-showcase-lite-v1',demo,forest:forest.stats(),floor:floor.stats(),
   lighting:{daylight:daylight.stats(),air:{raysEnabled:false,analyticBeams:0,method:'scene-fog',density:scene.fog?.density??0,steps:0,heightOriginM:null,maxDistanceM:0,scale:1,extraGeometryPasses:0},filter:'pcf',mapSize:512,probe:null},
  };
 }
 if(new URLSearchParams(location.search).get('debug')==='1'){
  setGpuTimingEnabled(engine,true);
  Object.assign(window,{m0:{
   state,reset,preset,setPaused,
   setTime:(hour:number)=>daylight.setTime(hour),setAutomatic:(enabled:boolean)=>daylight.setAutomatic(enabled),setRays:(enabled:boolean)=>daylight.setRays(enabled),setFog:(density:number)=>daylight.setFog(density),
   inspect:()=>({scene,engine,world,forest}),
   obstacles:()=>world.boxes.map(box=>({...box,min:{...box.min},max:{...box.max}})),
   teleport:(e:number,n:number,heading=0)=>{
    if(![e,n,heading].every(Number.isFinite)||e<FOREST_BOUNDS.minE+1||e>FOREST_BOUNDS.maxE-1||n<FOREST_BOUNDS.minN+1||n>FOREST_BOUNDS.maxN-1)throw new Error('Outside harness');
    if(!walkerIsClear({e,n},world.boxes))throw new Error('Position intersects obstacle');
    player.e=e;player.n=n;player.heading=heading;keys.clear();
   },
   setCamera:(y:number,p:number,d:number)=>{
    if(![y,p,d].every(Number.isFinite))throw new Error('Finite camera values required');
    yawTarget=normalizeAzimuth(y);pitch=clamp(p,minimumPitch,config.travel.pitchMaxDeg);
    distance=clamp(d,config.travel.distanceMinM,config.travel.distanceMaxM);
   },
   beginMeasurement:()=>{samples.length=0;frameCosts.length=0;collect=true;},
   endMeasurement:()=>{collect=false;return [...samples];},
   frameCosts:()=>[...frameCosts],
   startTraversal:(e=0,n=0,running=false)=>{reset();if(![e,n].every(Number.isFinite)||e<-255||e>255||n<-255||n>383||!walkerIsClear({e,n},world.boxes))throw new Error('Invalid traversal start');player.e=e;player.n=n;demo=true;demoTime=0;setPaused(false);canvas.focus();if(running)keys.add('ShiftLeft');},
   stopTraversal:()=>{demo=false;},
  }});
 }
 enableMaterialPlugins(scene);
 await registerSceneWithShadowSupport(scene);
 onBeforeRender(scene,deltaMs=>{
  try{
   if(atlas.isOpen())return;
   const now=performance.now(),rawDt=deltaMs,dt=Math.min(rawDt/1000,0.05);
   previousTime=now;
   if(!paused){
    if(collect&&frameCount>2)samples.push(rawDt);
    if(samples.length>maxSamples)collect=false;
    yaw=normalizeAzimuth(yaw+shortestAngleDelta(yaw,yawTarget)*(1-Math.exp(-dt/0.085)));
    let forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'))+touch.state.forward;
    let right=Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+touch.state.right;
    let de=0,dn=0;
    if(demo){
     demoTime+=dt;const phase=demoTime%60;
     dn=phase<27?1:phase<30?0:phase<57?-1:0;
     const delta=showcasePath(player.n+dn)-player.e;de=delta;const l=Math.hypot(de,dn)||1;de/=l;dn/=l;yawTarget=normalizeAzimuth(Math.atan2(de,dn)*180/Math.PI);pitch=6;
    }else if(forward||right){
     const scale=1/Math.max(1,Math.hypot(forward,right)),a=yaw*Math.PI/180;
     forward*=scale;right*=scale;
     de=forward*Math.sin(a)+right*Math.cos(a);dn=forward*Math.cos(a)-right*Math.sin(a);
    }
    const speedMps=keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.state.running?15:1.85;
    const before={...player},next=de||dn?moveWalker(player,de*speedMps*dt,dn*speedMps*dt,nearbyColliders(player,de*speedMps*dt,dn*speedMps*dt),FOREST_BOUNDS):player;
    player.e=next.e;player.n=next.n;
    const movedE=player.e-before.e,movedN=player.n-before.n;
    if(Math.hypot(movedE,movedN)>0.0001){
     const heading=normalizeAzimuth(Math.atan2(movedE,movedN)*180/Math.PI);
     player.heading=normalizeAzimuth(player.heading+shortestAngleDelta(player.heading,heading)*(1-Math.exp(-dt/0.1)));
    }
   }
   daylight.update(paused?0:dt);
   const h=groundHeight(player.e,player.n);
   world.player.position.set(player.e,h,-player.n);
   world.player.rotation.y=-player.heading*Math.PI/180;
   world.shadow.position.set(player.e,h+0.015,-player.n);
   const anchor={x:player.e,y:h+config.travel.targetHeightM,z:-player.n};
   const offset=cameraOffset(yaw+180,Math.max(0,pitch),distance);
   const desired={x:anchor.x+offset.x,y:anchor.y+offset.y,z:anchor.z+offset.z};
   const safe=terrainCameraLift(desired,anchor);cameraLift=Math.max(safe,cameraLift*Math.exp(-dt/0.18));desired.y+=cameraLift;
   camera.position.set(desired.x,desired.y,desired.z);
   const lookUp=Math.tan(Math.max(0,-pitch)*Math.PI/180)*distance;
   camera.target.set(anchor.x,anchor.y+lookUp,anchor.z);
   camera.position.set(desired.x,desired.y,desired.z);
   const feet={x:player.e,y:h,z:-player.n};
   for(const mesh of world.occluders){
    const id=mesh.name,current=occluderOpacity.get(id)??1;
    const box=world.boxes.find(b=>b.id===id);
    const blocked=box?occludesTraveller(desired,feet,box,current<0.99):false;
    const next=fadeOpacity(current,blocked?config.travel.occluderOpacity:1,dt,blocked?config.travel.fadeOutSeconds:config.travel.fadeInSeconds);
    occluderOpacity.set(id,next);mesh.visible=next>0.02;
   }
   forest.update(desired,feet,dt);
   floor.update(feet);
   const d=world.sun.direction,len=Math.hypot(d.x,d.y,d.z)||1;
   lightDirection.x=d.x/len;lightDirection.y=d.y/len;lightDirection.z=d.z/len;
   const az=Math.atan2(lightDirection.x,lightDirection.z),el=Math.asin(Math.max(-1,Math.min(1,lightDirection.y)));
   const q=0.35*Math.PI/180,qAz=Math.round(az/q)*q,qEl=Math.round(el/q)*q,ce=Math.cos(qEl);
   lightDirection.x=Math.sin(qAz)*ce;lightDirection.y=Math.sin(qEl);lightDirection.z=Math.cos(qAz)*ce;
   lightRight.x=lightDirection.z;lightRight.y=0;lightRight.z=-lightDirection.x;
   const rl=Math.hypot(lightRight.x,lightRight.z)||1;lightRight.x/=rl;lightRight.z/=rl;
   lightUp.x=lightDirection.y*lightRight.z-lightDirection.z*lightRight.y;
   lightUp.y=lightDirection.z*lightRight.x-lightDirection.x*lightRight.z;
   lightUp.z=lightDirection.x*lightRight.y-lightDirection.y*lightRight.x;
   const origin={x:feet.x-lightDirection.x*60,y:feet.y-lightDirection.y*60,z:feet.z-lightDirection.z*60},texel=64/512;
   for(const axis of [lightRight,lightUp]){const p=origin.x*axis.x+origin.y*axis.y+origin.z*axis.z;const s=Math.round(p/texel)*texel-p;origin.x+=axis.x*s;origin.y+=axis.y*s;origin.z+=axis.z*s;}
   world.sun.position.set(origin.x,origin.y,origin.z);
   const casters=forest.shadowCasters(feet);
   setShadowTaskCasterMeshes(sunlight,[...casters,...world.occluders,...world.playerMeshes]);
   const sg=sunlight as unknown as {_lightMatrix?:Float32Array};
   if(sg._lightMatrix)shadowMatrix.set(sg._lightMatrix);
   frameCount++;
   if(collect&&!paused&&frameCosts.length<maxSamples)frameCosts.push({cpuMs:performance.now()-now,gpuMs:engine.gpuFrameTimeMs||0});
   if(now-uiTime>400){
    uiTime=now;const s=state();
    document.querySelector('#fps')!.textContent=`${Math.round(1000/Math.max(rawDt,1))} FPS`;
    metrics.textContent=`${s.render.width} × ${s.render.height} · Lite WebGPU\n${s.render.drawCalls} вызовов отрисовки\nКамера ${s.camera.currentDistance.toFixed(2)} м · наклон ${pitch.toFixed(0)}°\nДеревья: ${forest.stats().trees} · LOD ${forest.stats().lodCounts.join(' / ')}`;
    document.querySelector('#location')!.textContent=Math.abs(player.e)>24||player.n<-12||player.n>64?'Большой лес':player.n<10?'Западный вход':player.n<19?'Между стволами':player.n<30?'Лесная тропа':player.n<47?'Подъём к свету':'Верхняя поляна';
   }
  }catch(error){if(new URLSearchParams(location.search).get('debug')==='1')console.error(error);fail(decodeError(error));}
 });
 await startEngine(engine);
}catch(error){if(new URLSearchParams(location.search).get('debug')==='1')console.error(error);fail(decodeError(error));}
