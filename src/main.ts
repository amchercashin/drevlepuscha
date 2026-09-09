import {createTouchControls} from './runtime/touch-controls.ts';
import {createForestAir} from './runtime/forest-air.ts';
import {createForestFloor} from './runtime/forest-floor.ts';
import {ShadowGenerator} from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import './style.css';
import {renderResolution} from './runtime/resolution.ts';
import type {ResolutionQuality} from './runtime/resolution.ts';
import {FOREST_BOUNDS} from './domain/forest.ts';
import {createForest} from './runtime/forest.ts';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import { createRenderer } from './runtime/engine.ts';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation.js';
import { createWorld, CHECKPOINTS } from './runtime/world.ts';
import { groundHeight, moveWalker, occludesTraveller, terrainOccludesTraveller, fadeOpacity, walkerIsClear } from './domain/harness.ts';
import { cameraOffset, normalizeAzimuth, shortestAngleDelta } from './domain/coordinates.ts';
import config from '../config/camera-presets.json';
import targets from '../config/render-targets.json';

let canvas = document.querySelector<HTMLCanvasElement>('#world')!;
const pausePanel=document.querySelector<HTMLElement>('#pause')!;
const resume=document.querySelector<HTMLButtonElement>('#resume')!;
const metrics=document.querySelector<HTMLElement>('#metrics')!;
const keys=new Set<string>();
let paused=true, dragging=false;
let engine: AbstractEngine | undefined;
const errors: string[]=[];

function fail(message: string) {
  errors.push(message);paused=true;keys.clear();pausePanel.hidden=false;
  document.querySelector('#pause-title')!.textContent='Не удалось открыть стенд';
  document.querySelector('#pause-description')!.textContent=message;
  const gpuFailure=engine?.isWebGPU||new URLSearchParams(location.search).get('renderer')==='webgpu';
  resume.textContent=gpuFailure?'Открыть WebGL2':'Перезагрузить';resume.disabled=false;
  resume.onclick=()=>{if(gpuFailure){const url=new URL(location.href);url.searchParams.set('renderer','webgl2');location.assign(url);}else location.reload();};
}

try {
  const renderer=await createRenderer(canvas);engine=renderer.engine;canvas=renderer.canvas;
  const rendererSelect=document.querySelector<HTMLSelectElement>('#renderer')!;
  rendererSelect.value=new URLSearchParams(location.search).get('renderer')||'auto';
  rendererSelect.onchange=()=>{const url=new URL(location.href);url.searchParams.set('renderer',rendererSelect.value);location.assign(url);};
  const scene=new Scene(engine);scene.useRightHandedSystem=true;
  const camera=new FreeCamera('travel',new Vector3(0,2,5),scene);
  camera.inputs.clear();camera.minZ=config.travel.nearClipM;camera.maxZ=100;
  camera.fov=config.travel.fovVerticalDeg*Math.PI/180;scene.activeCamera=camera;
  const forestMode=new URLSearchParams(location.search).get('scene')==='m1';
  const world=createWorld(scene,forestMode), instrumentation=new SceneInstrumentation(scene);
  const forest=forestMode?await createForest(scene,world.sun):null;
  if(forest){camera.maxZ=1000;world.boxes.push(...forest.boxes);document.title='Древлепуща — лес M1';document.querySelector('.badge')!.textContent=forest.stats().assetLabel??'M1 · проба леса';document.querySelector('.muted')!.textContent=`${forest.stats().trees} деревьев · участок 512 × 640 м · автоматические LOD.`;}
  if(forest){for(const [id,label] of [['entrance','01 Вход'],['trunks','02 Папоротники'],['arch','03 Просвет'],['slope','04 К поляне']])document.querySelector(`[data-checkpoint="${id}"]`)!.textContent=label;document.querySelector('nav')!.insertAdjacentHTML('beforeend','<button data-checkpoint="outer" type="button">05 Дальний лес</button>');document.querySelector('#pause-description')!.textContent='Исследуйте лес 512 × 640 м. Кнопка «Дальний лес» переносит за границы старого стенда; к видимым деревьям можно подойти.';}
  const floor=forest?createForestFloor(scene,world.boxes):null;
  const sunlight=forest?new ShadowGenerator(512,world.sun):null;
  if(sunlight){
   sunlight.setDarkness(0.18);sunlight.usePercentageCloserFiltering=true;sunlight.filteringQuality=ShadowGenerator.QUALITY_HIGH;
   sunlight.frustumEdgeFalloff=0.12;sunlight.bias=0.001;sunlight.normalBias=0.025;
   world.sun.shadowOrthoScale=0;world.sun.autoUpdateExtends=false;world.sun.autoCalcShadowZBounds=false;
   world.sun.shadowMinZ=1;world.sun.shadowMaxZ=110;world.sun.orthoLeft=-32;world.sun.orthoRight=32;world.sun.orthoTop=32;world.sun.orthoBottom=-32;
  }
  let shadowPassTriangles=0,shadowPassStart=0;
  if(sunlight){sunlight.getShadowMap()!.onBeforeRenderObservable.add(()=>{shadowPassStart=scene.getActiveIndices();});sunlight.getShadowMap()!.onAfterRenderObservable.add(()=>{shadowPassTriangles=(scene.getActiveIndices()-shadowPassStart)/3;});}
  const air=sunlight&&new URLSearchParams(location.search).get('air')!=='0'?createForestAir(scene,camera,sunlight,world.sun):null;
  const lightDirection=world.sun.direction.normalizeToNew(),lightRight=Vector3.Cross(Vector3.Up(),lightDirection).normalize(),lightUp=Vector3.Cross(lightDirection,lightRight).normalize();
  const forestControls=document.querySelector<HTMLElement>('#forest-controls')!;forestControls.hidden=!forest;
  const weatherSelect=document.querySelector<HTMLSelectElement>('#forest-weather')!;
  weatherSelect.onchange=()=>{if(forest)scene.fogDensity=weatherSelect.value==='mist'?0.023:0.004;};
  const treeColor=document.querySelector<HTMLInputElement>('#tree-color')!;document.querySelector<HTMLElement>('#tree-color-label')!.hidden=!forest?.stats().colorVersion;treeColor.onchange=()=>forest?.setColorVariation(treeColor.checked);
  document.querySelector<HTMLInputElement>('#near-only')!.onchange=e=>forest?.setNearOnly((e.target as HTMLInputElement).checked);
  const player={e:0,n:0,heading:0};
  let yaw=0,yawTarget=0,pitch=config.travel.pitchDefaultDeg,distance=config.travel.distanceM;
  let frameCount=0,previousTime=performance.now(),uiTime=0;
  const samples: number[]=[],maxSamples=60*60*5;
  let collect=false;
  let demo=false,demoTime=0;

  const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
  function setPaused(value:boolean) {
    paused=value;keys.clear();dragging=false;
    pausePanel.hidden=!value;
    if(value) {document.querySelector('#pause-title')!.textContent='Прогулка на паузе';resume.textContent='Продолжить';}
    previousTime=performance.now();
  }
  function focusScene() {setPaused(false);canvas.focus({preventScroll:true});}
  function reset(checkpoint:keyof typeof CHECKPOINTS='entrance') {
    if(checkpoint==='outer'&&!forest)return;
    const c=CHECKPOINTS[checkpoint];player.e=c.e;player.n=c.n;player.heading=0;
    yaw=yawTarget=0;pitch=config.travel.pitchDefaultDeg;distance=config.travel.distanceM;
    keys.clear();demo=false;
  }
  const labels=['Тропа прямо','Осмотр слева','Осмотр справа','Взгляд в кроны','Рядом со стволом','Широкий проход'];
  const select=document.querySelector<HTMLSelectElement>('#preset')!;
  config.visualReviewPresets.forEach((p,i)=>select.add(new Option(labels[i],p.id)));
  function preset(id:string) {
    const p=config.visualReviewPresets.find(x=>x.id===id);
    if(!p)throw new Error(`Unknown preset ${id}`);
    yaw=yawTarget=normalizeAzimuth(p.yawDeg);pitch=p.pitchDeg;distance=p.distanceM;
    select.value=id;
  }
  select.onchange=()=>{preset(select.value);focusScene();};
  document.querySelector('#reset')!.addEventListener('click',()=>{reset();focusScene();});
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-checkpoint]')) {
    button.onclick=()=>{reset(button.dataset.checkpoint as keyof typeof CHECKPOINTS);focusScene();};
  }
  resume.disabled=false;resume.textContent='Начать прогулку';resume.onclick=focusScene;
  const touch=createTouchControls(canvas,{
    active:()=>!paused,engage:()=>{demo=false;},
    look:(x,y)=>{yawTarget=normalizeAzimuth(yawTarget+x*0.2);pitch=clamp(pitch+y*0.16,config.travel.pitchMinDeg,config.travel.pitchMaxDeg);},
    zoom:delta=>{distance=clamp(distance+delta,config.travel.distanceMinM,config.travel.distanceMaxM);},
  });
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{
    if(paused)return;canvas.focus();
    if(e.button===2){dragging=true;canvas.setPointerCapture(e.pointerId);e.preventDefault();}
  });
  canvas.addEventListener('pointermove',e=>{
    if(paused||!dragging)return;
    yawTarget=normalizeAzimuth(yawTarget+e.movementX*0.2);
    pitch=clamp(pitch+e.movementY*0.16,config.travel.pitchMinDeg,config.travel.pitchMaxDeg);
  });
  const stopDrag=()=>{dragging=false;};
  canvas.addEventListener('pointerup',stopDrag);canvas.addEventListener('pointercancel',stopDrag);
  canvas.addEventListener('lostpointercapture',stopDrag);
  canvas.addEventListener('wheel',e=>{
    if(paused)return;e.preventDefault();
    distance=clamp(distance+e.deltaY*0.004,config.travel.distanceMinM,config.travel.distanceMaxM);
  },{passive:false});
  window.addEventListener('keydown',e=>{
    if(e.code==='Escape'){e.preventDefault();if(paused)focusScene();else setPaused(true);return;}
    if(paused||document.activeElement!==canvas)return;
    if(['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight'].includes(e.code)){
      e.preventDefault();keys.add(e.code);demo=false;
      if(e.code==='Space'){yawTarget=player.heading;pitch=config.travel.pitchDefaultDeg;distance=config.travel.distanceM;}
    }
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>setPaused(true));
  canvas.addEventListener('blur',()=>{keys.clear();dragging=false;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)setPaused(true);});
  engine.onContextLostObservable.add(()=>fail('Графический контекст потерян. Закройте лишние графические приложения и перезагрузите стенд.'));
  const qualitySelect=document.querySelector<HTMLSelectElement>('#resolution-quality')!;
  let quality:ResolutionQuality='high';
  try{const saved=localStorage.getItem('resolution-quality');if(['performance','balanced','high','native'].includes(saved??''))quality=saved as ResolutionQuality;}catch{/* Storage can be unavailable. */}
  qualitySelect.value=quality;
  let internalDpr=1;
  function resize() {
    const size=renderResolution(canvas.clientWidth,canvas.clientHeight,window.devicePixelRatio,quality,Math.min(8192,engine!.getCaps().maxTextureSize));
    internalDpr=size.scale;engine!.setSize(size.width,size.height);
  }
  qualitySelect.onchange=()=>{quality=qualitySelect.value as ResolutionQuality;try{localStorage.setItem('resolution-quality',quality);}catch{}resize();};
  window.addEventListener('resize',resize);resize();
  // Retina density can change when moving a window between monitors without changing its CSS size.
  let densityQuery:MediaQueryList;
  function watchDensity(){densityQuery?.removeEventListener('change',densityChanged);densityQuery=matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);densityQuery.addEventListener('change',densityChanged);}
  function densityChanged(){resize();watchDensity();}watchDensity();

  function state() {
    const pos={x:camera.position.x,y:camera.position.y,z:camera.position.z};
    const anchor={x:player.e,y:groundHeight(player.e,player.n)+config.travel.targetHeightM,z:-player.n};
    const offset=cameraOffset(yaw+180,Math.max(0,pitch),distance);
    const currentDistance=Math.hypot(pos.x-anchor.x,pos.y-anchor.y,pos.z-anchor.z);
    const followError=Math.hypot(pos.x-anchor.x-offset.x,pos.y-anchor.y-offset.y,pos.z-anchor.z-offset.z);
    return {
      ready:frameCount>2,frameCount,paused,player:{...player,h:groundHeight(player.e,player.n)},
      camera:{...pos,yaw,pitch,distance,currentDistance,followError},
      playerClear:walkerIsClear(player,world.boxes),
      faded:[...world.occluders,...(forest?.meshes??[]),world.ground].filter(m=>m.isEnabled()&&m.visibility<1).map(m=>({id:m.id,opacity:m.visibility})),
      render:{width:engine!.getRenderWidth(),height:engine!.getRenderHeight(),backend:renderer.kind,webGLVersion:renderer.kind==='webgl2'?2:null,
        triangles:scene.getActiveIndices()/3,shadowTriangles:shadowPassTriangles,mainTriangles:scene.getActiveIndices()/3-shadowPassTriangles,drawCalls:instrumentation.drawCallsCounter.current,meshes:scene.meshes.length,
        gpu:renderer.info,fallbackReason:renderer.fallbackReason,devicePixelRatio:window.devicePixelRatio,internalDpr,resolutionQuality:quality},
      errors:[...errors],seed:targets.fixedSeed,sceneVersion:forest?'m1-2':'m0-4',demo,forest:forest?.stats()??null,floor:floor?.stats()??null,
      lighting:sunlight?{air:air?.stats(),filter:sunlight.filter,mapSize:sunlight.getShadowMapForRendering()?.getSize().width??0,probe:Vector3.TransformCoordinates(new Vector3(0,0,-10),sunlight.getTransformMatrix()).asArray()}:null,
    };
  }
  // Local QA seam; absent on ordinary visits. No synthetic FPS or replacement rendering.
  if(new URLSearchParams(location.search).get('debug')==='1') {
    Object.assign(window,{m0:{
      state,reset,preset,setPaused,
      obstacles:()=>world.boxes.map(box=>({...box,min:{...box.min},max:{...box.max}})),
      teleport:(e:number,n:number,heading=0)=>{
        if(![e,n,heading].every(Number.isFinite)||e<(forest?FOREST_BOUNDS.minE+1:-23)||e>(forest?FOREST_BOUNDS.maxE-1:23)||n<(forest?FOREST_BOUNDS.minN+1:-11)||n>(forest?FOREST_BOUNDS.maxN-1:63))throw new Error('Outside harness');
        if(!walkerIsClear({e,n},world.boxes))throw new Error('Position intersects obstacle');
        player.e=e;player.n=n;player.heading=heading;keys.clear();
      },
      setCamera:(y:number,p:number,d:number)=>{
        if(![y,p,d].every(Number.isFinite))throw new Error('Finite camera values required');
        yawTarget=normalizeAzimuth(y);pitch=clamp(p,config.travel.pitchMinDeg,config.travel.pitchMaxDeg);
        distance=clamp(d,config.travel.distanceMinM,config.travel.distanceMaxM);
      },
      beginMeasurement:()=>{samples.length=0;collect=true;},
      endMeasurement:()=>{collect=false;return [...samples];},
      startTraversal:(e=0,n=0)=>{reset();if(![e,n].every(Number.isFinite)||e<(forest?-255:-23)||e>(forest?255:23)||n<(forest?-255:-11)||n>(forest?383:63)||!walkerIsClear({e,n},world.boxes))throw new Error('Invalid traversal start');player.e=e;player.n=n;demo=true;demoTime=0;setPaused(false);canvas.focus();},
      stopTraversal:()=>{demo=false;},
    }});
  }

  engine.runRenderLoop(()=>{
    try {
      const now=performance.now(),rawDt=now-previousTime;previousTime=now;
      const dt=Math.min(rawDt/1000,0.05);
      if(!paused){
        if(collect&&frameCount>2)samples.push(rawDt);
        if(samples.length>maxSamples){collect=false;}
        yaw=normalizeAzimuth(yaw+shortestAngleDelta(yaw,yawTarget)*(1-Math.exp(-dt/0.085)));
        let forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS'))+touch.state.forward;
        let right=Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+touch.state.right;
        let de=0,dn=0;
        if(demo){
          // Same closed 60-second north/south route, actual movement/collision code.
          demoTime+=dt;const phase=demoTime%60;
          dn=phase<27?1:phase<30?0:phase<57?-1:0;
          yawTarget=0;pitch=phase>=27&&phase<30?-20:12;
        }else if(forward||right){
          const scale=1/Math.max(1,Math.hypot(forward,right)),a=yaw*Math.PI/180;
          forward*=scale;right*=scale;
          de=forward*Math.sin(a)+right*Math.cos(a);dn=forward*Math.cos(a)-right*Math.sin(a);
        }
        const speedMps=keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.state.running?15:1.85;
        const before={...player},next=moveWalker(player,de*speedMps*dt,dn*speedMps*dt,world.boxes,forest?FOREST_BOUNDS:undefined);
        player.e=next.e;player.n=next.n;
        const movedE=player.e-before.e,movedN=player.n-before.n;
        if(Math.hypot(movedE,movedN)>0.0001){
          const heading=normalizeAzimuth(Math.atan2(movedE,movedN)*180/Math.PI);
          player.heading=normalizeAzimuth(player.heading+shortestAngleDelta(player.heading,heading)*(1-Math.exp(-dt/0.1)));
        }
      }
      const h=groundHeight(player.e,player.n);
      world.player.position.set(player.e,h,-player.n);world.player.rotation.y=-player.heading*Math.PI/180;
      world.shadow.position.set(player.e,h+0.015,-player.n);
      const anchor={x:player.e,y:h+config.travel.targetHeightM,z:-player.n};
      const offset=cameraOffset(yaw+180,Math.max(0,pitch),distance);
      const desired={x:anchor.x+offset.x,y:anchor.y+offset.y,z:anchor.z+offset.z};
      // Follow translation only. Geometry never changes the user's orbit or zoom.
      camera.position.set(desired.x,desired.y,desired.z);
      // Looking up tilts the view from traveller height instead of orbiting below the floor.
      const lookUp=Math.tan(Math.max(0,-pitch)*Math.PI/180)*distance;
      camera.setTarget(new Vector3(anchor.x,anchor.y+lookUp,anchor.z));
      // Babylon setTarget nudges equal-Z positions by Epsilon at cardinal angles. Keep the chosen orbit exact.
      camera.position.set(desired.x,desired.y,desired.z);
      const feet={x:player.e,y:h,z:-player.n};
      for(const mesh of [...world.occluders,world.ground]) {
        const bounds=mesh.getBoundingInfo().boundingBox;
        const blocked=mesh===world.ground?terrainOccludesTraveller(desired,feet):
          occludesTraveller(desired,feet,{id:mesh.id,min:bounds.minimumWorld,max:bounds.maximumWorld},mesh.visibility<0.99);
        const target=blocked?config.travel.occluderOpacity:1;
        // Per-mesh visibility preserves shared bark/stone materials on other objects.
        mesh.visibility=fadeOpacity(mesh.visibility,target,dt,blocked?config.travel.fadeOutSeconds:config.travel.fadeInSeconds);
      }
      forest?.update(desired,feet,dt);
      floor?.update(feet);
      if(sunlight&&forest){
       const origin=new Vector3(feet.x,feet.y,feet.z).subtract(lightDirection.scale(60)),texel=64/512;
       // Quantize in the light's own plane so the shadow texels stay anchored in the world.
       for(const axis of [lightRight,lightUp]){const p=Vector3.Dot(origin,axis);origin.addInPlace(axis.scale(Math.round(p/texel)*texel-p));}
       world.sun.position.copyFrom(origin);
       const casters=forest.shadowCasters(feet);
       sunlight.getShadowMap()!.renderList=[...casters,...world.occluders,...world.player.getChildMeshes()];

      }

      scene.render();frameCount++;
      if(now-uiTime>400){
        uiTime=now;const s=state();
        document.querySelector('#fps')!.textContent=`${Math.round(engine!.getFps())} FPS`;
        metrics.textContent=`${s.render.width} × ${s.render.height} · ${renderer.kind==='webgpu'?'WebGPU':'WebGL2'}\n${Math.round(s.render.mainTriangles).toLocaleString('ru-RU')} треуг. в основном кадре\n${Math.round(s.render.shadowTriangles).toLocaleString('ru-RU')} в тенях · сумма ${Math.round(s.render.triangles).toLocaleString('ru-RU')}\n${s.render.drawCalls} вызовов отрисовки\nКамера ${Vector3.Distance(camera.position,new Vector3(anchor.x,anchor.y,anchor.z)).toFixed(2)} м · наклон ${pitch.toFixed(0)}°${renderer.fallbackReason?'\nWebGPU недоступен — включён WebGL2.':''}`;
        if(forest)metrics.textContent+=`\nДеревья: ${forest.stats().trees} · LOD ${forest.stats().lodCounts.join(' / ')}`;
        document.querySelector('#location')!.textContent=forest&&(Math.abs(player.e)>24||player.n<-12||player.n>64)?'Большой лес':player.n<10?'Западный вход':player.n<19?'Между стволами':player.n<30?(forest?'Лесная тропа':'Низкая арка'):player.n<47?'Подъём к свету':'Верхняя поляна';
      }
    }catch(error){engine!.stopRenderLoop();fail(String(error));}
  });
  window.addEventListener('pagehide',()=>{scene.dispose();engine!.dispose();},{once:true});
} catch(error) {engine?.dispose();fail(String(error));}
