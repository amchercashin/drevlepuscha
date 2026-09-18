import type {Scene} from '@babylonjs/core/scene.js';
import type {ShadowGenerator} from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import type {ReadonlyTreeCatalog,WildlifeObserver,WildlifeEnvironment,WildlifeFrame,WildlifePackage} from '../domain/wildlife/types.ts';
import type {WalkSession} from '../network/session.ts';
import type {WildlifeSessionView} from '../network/wildlife-session.ts';
import {WildlifeSession,WildlifeEvents} from '../network/wildlife-session.ts';
import {WildlifeWorld} from '../domain/wildlife/world.ts';
import {createWildlifeRenderer} from './wildlife/render.ts';
import {CanopyShade} from './canopy-shade.ts';
import sites from '../../config/wildlife/showcase-sites.json';
export function createShowcaseWildlife(scene:Scene,data:WildlifePackage,catalog:ReadonlyTreeCatalog,shadows:ShadowGenerator|null,observer:()=>WildlifeObserver,environment:()=>WildlifeEnvironment,joining:boolean){
 const anchors=[sites.perch,...sites.routes.map(r=>r.refuge)];
 for(const a of anchors){const t=catalog.get(a.treeId);if(!t||t.familyId!==a.familyId||t.assetVersion!==a.assetVersion)throw Error(`Несовместимая опора фауны: ${a.treeId}`);}
 const render=createWildlifeRenderer(scene,data,m=>{if(shadows)new CanopyShade(m,shadows);}),events=new WildlifeEvents();
 let solo:WildlifeSession|null=null,session:WildlifeSessionView|null=null,unsubscribe:(()=>void)|null=null,frame:WildlifeFrame|null=null,soloMs=0,disposed=false;
 const delivered:number[]=[];
 const label=document.createElement('div');label.textContent='Фауна W2 · ТЕСТОВАЯ МОДЕЛЬ';label.style.cssText='position:fixed;left:12px;bottom:12px;color:#ff62d4;pointer-events:none;font:12px sans-serif;z-index:10';document.body.append(label);
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
   if(disposed)return;
   if(solo&&!paused){soloMs+=dt*1000;solo.advance(soloMs,[observer()],environment());}
   const time=solo?frame?.simMs??0:session?.presentationMs(performance.now())??0;
   render.update(frame,time,{e:0,n:0});for(const event of events.due(time)){delivered.push(event.seq);if(delivered.length>32)delivered.shift();}
  },
  prepare:render.prepare,setQuality:render.setQuality,shadowMeshes:render.shadowMeshes,setProbe:render.setProbe,
  stats:()=>({...render.stats(),role:session?.role??'preparing',frame:frame?{seq:frame.seq,simMs:frame.simMs,authorityEpoch:frame.authorityEpoch,entities:frame.entities,eventWatermark:frame.eventWatermark}:null,deliveredEvents:[...delivered]}),
  inspectRoutes:()=>data.cells.map(c=>({id:c.id,sites:c.sites,routes:c.routes})),
  dispose(){if(disposed)return;disposed=true;unsubscribe?.();unsubscribe=null;solo?.dispose();solo=null;session=null;events.clear();render.dispose();label.remove();},
 };
 scene.onDisposeObservable.add(()=>api.dispose());return api;
}
