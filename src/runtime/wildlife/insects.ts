import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {InstantiatedEntries} from '@babylonjs/core/assetContainer.js';
import type {ENH,OriginEN,WildlifeEnvironment} from '../../domain/wildlife/types.ts';
import {choice} from '../../domain/wildlife/ids.ts';
import type {FrameWorkBudget} from '../startup.ts';
import type {createAnimalLibrary} from './assets.ts';
export interface InsectPatch extends ENH {id:string;}
/** Local decoration only. Patches, clock, origin and existing wind arrive from the adapter. */
export function createLocalInsects(scene:Scene,library:ReturnType<typeof createAnimalLibrary>,patches:readonly InsectPatch[],wind:(p:ENH)=>number){
 const instances=new Map<string,{root:TransformNode;entry:InstantiatedEntries;phase:number}>();
 let desired:InsectPatch[]=[],time=0,origin:OriginEN={e:0,n:0},limit=4,visibility=0,disposed=false;
 const sample=(p:InsectPatch,phase:number)=>{const t=time/1000+phase,g=Math.min(1,Math.max(0,wind(p)));return {e:p.e+.65*Math.sin(t*.7)+g*.12,n:p.n+.5*Math.sin(t*.93+.6),h:p.h+.8+.22*Math.sin(t*1.3)};};
 function apply(){for(const [id,v] of instances){const patch=desired.find(p=>p.id===id);if(!patch){v.entry.dispose();v.root.dispose();instances.delete(id);continue;}const p=sample(patch,v.phase);v.root.position.set(p.e-origin.e,p.h,origin.n-p.n);v.root.rotation.y=Math.atan2(.455*Math.cos(time/1000*.7+v.phase*.7),-.465*Math.cos(time/1000*.93+v.phase*.93+.6));for(const m of v.root.getChildMeshes())m.visibility=visibility;
  for(const group of v.entry.animationGroups){const fps=group.targetedAnimations[0]?.animation.framePerSecond??60,at=group.from+((time/1000+v.phase)*fps)%(group.to-group.from);for(const {animation,target} of group.targetedAnimations){const value=animation.evaluate(at);if(target[animation.targetProperty]?.copyFrom)target[animation.targetProperty].copyFrom(value);else target[animation.targetProperty]=value.clone?.()??value;}}
 }}
 return {
  update(ms:number,nextOrigin:OriginEN,eye:ENH,env:WildlifeEnvironment){if(disposed)return;const dt=Math.min(.1,Math.max(0,(ms-time)/1000));time=ms;origin=nextOrigin;const target=env.daylight01>.25&&env.precipitation01<.4?1:0;visibility+=Math.max(-dt/2,Math.min(dt/2,target-visibility));desired=visibility>.001?patches.filter(p=>Math.hypot(p.e-eye.e,p.n-eye.n)<22).flatMap(p=>[0,1,2,3].map(i=>({...p,id:`${p.id}/${i}`,e:p.e+(i%2)*.25,n:p.n+Math.floor(i/2)*.25}))).slice(0,limit):[];if(desired.length)library.request('woodland-butterfly',0);apply();},
  prepare(budget:FrameWorkBudget){if(disposed)return;const p=desired.find(p=>!instances.has(p.id)),template=library.get('woodland-butterfly',0);if(!p||!template)return;budget.run(()=>{const entry=template.instantiateModelsToScene(n=>`${p.id}:${n}`,false,{doNotInstantiate:true}),root=new TransformNode(`local-insect:${p.id}`,scene);for(const node of entry.rootNodes)node.parent=root;for(const m of root.getChildMeshes()){m.isPickable=false;m.receiveShadows=false;}for(const g of entry.animationGroups)g.stop();instances.set(p.id,{root,entry,phase:choice('local-insects',p.id,0,10000)/1000});apply();});},
  setQuality(details:number){limit=details<=4?4:details<=6?8:12;},
  stats:()=>({local:true,candidate:true,instances:instances.size,limit,pending:desired.length-instances.size,visibility,automaticAnimatables:[...instances.values()].reduce((n,v)=>n+v.entry.animationGroups.reduce((s,g)=>s+g.animatables.length,0),0)}),
  dispose(){if(disposed)return;disposed=true;for(const v of instances.values()){v.entry.dispose();v.root.dispose();}instances.clear();desired=[];}
 };
}
