import type {Scene} from '@babylonjs/core/scene.js';
import type {ShadowGenerator} from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import type {ReadonlyTreeCatalog,WildlifeObserver,WildlifeEnvironment,WildlifeFrame,WildlifePackage} from '../domain/wildlife/types.ts';
import type {WalkSession} from '../network/session.ts';
import type {WildlifeSessionView} from '../network/wildlife-session.ts';
import {WildlifeSession,WildlifeEvents} from '../network/wildlife-session.ts';
import {WildlifeWorld} from '../domain/wildlife/world.ts';
import {createWildlifeRenderer} from './wildlife/render.ts';
import {CanopyShade} from './canopy-shade.ts';
import {createLocalInsects} from './wildlife/insects.ts';
import insectPatches from '../../config/wildlife/insect-sites.json';
import type {FrameWorkBudget} from './startup.ts';
import type {AnimalArt,RenderArt} from './wildlife/assets.ts';
import type {WildlifeEvent} from '../domain/wildlife/types.ts';
import {frameBytes} from '../network/wildlife-protocol.ts';
import {Matrix,Vector3} from '@babylonjs/core/Maths/math.vector.js';
export function createShowcaseWildlife(scene:Scene,data:WildlifePackage,catalog:ReadonlyTreeCatalog,shadows:ShadowGenerator|null,observer:()=>WildlifeObserver,environment:()=>WildlifeEnvironment,joining:boolean,art:AnimalArt[]|null=null,onEvent?:(event:WildlifeEvent,ageMs:number)=>void,localArt:RenderArt|null=null,wind:(p:import('../domain/wildlife/types.ts').ENH)=>number=()=>0){
 for(const a of data.treeBindings??[]){const t=catalog.get(a.id);if(!t||t.familyId!==a.familyId||t.assetVersion!==a.assetVersion)throw Error(`Несовместимая опора фауны: ${a.id}`);}
 const render=createWildlifeRenderer(scene,data,m=>{if(shadows)new CanopyShade(m,shadows);},art,localArt?[localArt]:[]),insects=localArt&&render.library?createLocalInsects(scene,render.library,insectPatches,wind):null,events=new WildlifeEvents();
 let solo:WildlifeSession|null=null,session:WildlifeSessionView|null=null,unsubscribe:(()=>void)|null=null,frame:WildlifeFrame|null=null,soloMs=0,disposed=false;
 const delivered:number[]=[];let nextStatus=0,lastCpuMs=0,lastPrepareMs=0;
 const label=document.createElement('div');label.textContent=art?'Фауна · КАНДИДАТЫ':'Фауна · ТЕСТОВАЯ МОДЕЛЬ';label.style.cssText='position:fixed;left:12px;bottom:12px;color:#ffcf86;pointer-events:none;font:12px sans-serif;z-index:10';document.body.append(label);
 const marker=document.createElement('div');marker.textContent='↓ Птица';marker.style.cssText='position:fixed;pointer-events:none;color:#ffe0ac;font:12px sans-serif;text-shadow:0 1px 3px #000;transform:translate(-50%,-100%);z-index:9';document.body.append(marker);
 function bind(view:WildlifeSessionView){unsubscribe?.();session=view;unsubscribe=view.subscribe((next,initial)=>{frame=next;events.accept(next,initial);});view.setSceneReady(true);}
 function startSolo(restore:WildlifeFrame|null){
  const world=new WildlifeWorld({content:data.identity,authorityEpoch:crypto.randomUUID(),seed:data.identity.contentHash,cells:new Map(data.cells.map(c=>[c.id,c])),limits:data.limits,bird:data.bird});
  if(restore)world.restoreVisible(restore);soloMs=0;
  solo=new WildlifeSession({data,world},'authority','unused',0);bind(solo.view);
 }
 if(!joining)startSolo(null);
 const api={
  guestOptions:()=>({data}),
  hostOptions(){const world=solo?.detachWorld();unsubscribe?.();unsubscribe=null;solo?.dispose();solo=null;return {data,world,gameHours:environment().totalGameHours};},
  attachSession(room:WalkSession|null){
   if(disposed)return;
   if(room){if(!room.wildlife)throw Error('Комната не поддерживает wildlife-v1');unsubscribe?.();solo?.dispose();solo=null;events.clear();bind(room.wildlife);}
   else if(!solo){const previous=frame;unsubscribe?.();events.clear();startSolo(previous);}
  },
  update(dt:number,paused:boolean){
   if(disposed)return;const started=performance.now();
   if(solo&&!paused){soloMs+=dt*1000;solo.advance(soloMs,[observer()],environment());}
   const time=solo?frame?.simMs??0:session?.presentationMs(performance.now())??0;
   render.update(frame,time,{e:0,n:0},observer());insects?.update(time,{e:0,n:0},observer(),environment());for(const event of events.due(time)){delivered.push(event.seq);if(delivered.length>32)delivered.shift();if(!paused)onEvent?.(event,time-event.atMs);}
   const viewer=observer(),bird=frame?.entities.filter(e=>e.state!=='hidden').sort((a,b)=>Math.hypot(a.point.e-viewer.e,a.point.n-viewer.n)-Math.hypot(b.point.e-viewer.e,b.point.n-viewer.n))[0],camera=scene.activeCamera,engine=scene.getEngine(),rect=engine.getRenderingCanvas()?.getBoundingClientRect();
   marker.hidden=true;if(bird)marker.textContent='↓ '+({'woodland-bird':'Птица','red-squirrel':'Белка','roe-deer':'Косуля'})[bird.species];
   if(bird&&camera&&rect){const p=Vector3.Project(new Vector3(bird.point.e,bird.point.h+.3,-bird.point.n),Matrix.IdentityReadOnly,scene.getTransformMatrix(),camera.viewport.toGlobal(rect.width,rect.height));if(p.z>0&&p.z<1&&p.x>=0&&p.x<rect.width&&p.y>=0&&p.y<rect.height){marker.hidden=false;marker.style.left=`${rect.left+p.x}px`;marker.style.top=`${rect.top+p.y}px`;}}
   if(performance.now()>=nextStatus){nextStatus=performance.now()+250;const s=render.stats(),states:Record<string,string>={perched:'сидит',alert:'насторожилась',takeoff:'взлетает',flying:'летит',hidden:'в укрытии',forage:'ищет корм','ground-bound':'бежит к дереву',mount:'цепляется',climb:'поднимается','trunk-idle':'на стволе',graze:'кормится','walk-away':'отходит',flee:'убегает',recover:'успокаивается'};
    label.textContent=`${art?'Фауна · КАНДИДАТЫ':'ТЕСТОВАЯ МОДЕЛЬ'} · ${frame?.entities.map(e=>states[e.state]??e.state).join(', ')||'ожидает появления'} · ${s.instances.map(i=>i.lod<0?'примитив':`LOD ${i.lod} / ${i.clip}`).join(', ')}${s.assetErrors?.length?' · ошибка модели':''}`;
   }
   lastCpuMs=performance.now()-started;
  },
  prepare(budget:FrameWorkBudget){const t=performance.now();render.prepare(budget);insects?.prepare(budget);lastPrepareMs=performance.now()-t;},setQuality(profile:Parameters<typeof render.setQuality>[0]){render.setQuality(profile);insects?.setQuality(profile.wildlifeDetails??4);},shadowMeshes:render.shadowMeshes,setProbe:render.setProbe,
  timing:()=>disposed?0:lastCpuMs+lastPrepareMs,
  stats:()=>({...render.stats(),cpuMs:lastCpuMs,prepareMs:lastPrepareMs,snapshotBytes:frame?frameBytes(frame):0,authority:solo?.stats()??null,insects:insects?.stats()??null,role:session?.role??'preparing',frame:frame?{seq:frame.seq,simMs:frame.simMs,authorityEpoch:frame.authorityEpoch,entities:frame.entities,eventWatermark:frame.eventWatermark}:null,deliveredEvents:[...delivered]}),
  inspectRoutes:()=>data.cells.map(c=>({id:c.id,sites:c.sites,routes:c.routes})),
  dispose(){if(disposed)return;disposed=true;unsubscribe?.();unsubscribe=null;solo?.dispose();solo=null;session=null;frame=null;lastCpuMs=lastPrepareMs=0;events.clear();insects?.dispose();render.dispose();label.remove();marker.remove();},
 };
 scene.onDisposeObservable.add(()=>api.dispose());return api;
}
