import type {Scene} from '@babylonjs/core/scene.js';
import type {ShadowGenerator} from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import {WildlifeWorld} from '../domain/wildlife/world.ts';
import {validatePackage} from '../domain/wildlife/habitat.ts';
import type {WildlifePackage,WildlifeEnvironment,WildlifeObserver} from '../domain/wildlife/types.ts';
import {createWildlifeRenderer} from '../runtime/wildlife/render.ts';
import {fetchWildlifeArt,fetchButterflyArt} from '../runtime/wildlife/assets.ts';
import {createLocalInsects} from '../runtime/wildlife/insects.ts';
import type {Material} from '@babylonjs/core/Materials/material.js';
import type {WindSystem} from '../runtime/wind.ts';
import type {ShowcaseAudio} from '../runtime/showcase-audio.ts';
import type {FrameWorkBudget} from '../runtime/startup.ts';
import type {RegionWorld} from './world.ts';
import limits from '../../config/wildlife/budgets.json';
import species from '../../config/wildlife/species.json';
export async function createRegionWildlife(scene:Scene,world:RegionWorld,_shadows:ShadowGenerator,wind:WindSystem,audio:ShowcaseAudio,shade:(m:Material)=>void){
 const [cells,art,butterfly]=await Promise.all([world.data.json('habitat.json.pack'),fetchWildlifeArt(),fetchButterflyArt()]);
 const data:WildlifePackage={identity:{realmId:'brandywine-bridge',contentHash:cells[0].contentHash,behaviorVersion:1},cells,limits,bird:species['woodland-bird']};validatePackage(data);
 const simulation=new WildlifeWorld({content:data.identity,authorityEpoch:'regional-solo',seed:String(world.data.geo.source.worldSeed),cells:new Map(data.cells.map(c=>[c.id,c])),limits,bird:data.bird});
 const render=createWildlifeRenderer(scene,data,shade,art,butterfly?[butterfly]:[]),patches=data.cells.flatMap(c=>c.sites.filter(s=>s.species==='woodland-bird').map(s=>({id:s.id,...s.home}))),insects=butterfly&&render.library?createLocalInsects(scene,render.library,patches,p=>wind.sampleAt(p.e,p.h,-p.n).gust01):null;
 let clock=0,watermark=0;audio.setWildlifeEventsEnabled(true);
 scene.onDisposeObservable.add(()=>{simulation.dispose();render.dispose();insects?.dispose();});
 return {
  update(dt:number,observer:WildlifeObserver,env:WildlifeEnvironment,budget:FrameWorkBudget){clock+=dt*1000;simulation.advance({simMs:clock,observers:[observer],environment:env});const frame=simulation.snapshot();render.update(frame,clock,world.origin,observer);insects?.update(clock,world.origin,observer,env);render.prepare(budget);insects?.prepare(budget);for(const event of frame.recentEvents)if(event.seq>watermark){audio.playWildlifeEvent({x:event.position.e,y:event.position.h,z:-event.position.n},clock-event.atMs,event.kind);watermark=event.seq;}},
  shadowMeshes:render.shadowMeshes,stats:()=>({simulation:simulation.stats(),render:render.stats(),insects:insects?.stats()}),
 };
}
