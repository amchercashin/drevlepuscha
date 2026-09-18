import {treeFamilySlot} from './tree-family.ts';
import type {TreePlacement} from './forest-layout.ts';
import type {ReadonlyTreeCatalog,WildlifeTreeDescriptor} from './wildlife/types.ts';

export interface ForestFamily {id:string;version:string;rootRadius?:number;sink:number;}
/** Shared final seating; callers retain the input order and RNG sequence. */
export function finalizeForestPlacements(placements:readonly TreePlacement[],families:readonly ForestFamily[],variantCounts:readonly [number,number],heightAt:(e:number,n:number)=>number,variety:boolean,showcase:boolean){
 return placements.map(input=>{
  const p={...input},slot=variety?treeFamilySlot(p,[...variantCounts],showcase):0,f=families[slot];
  if(!f)throw Error(`Unknown tree family slot ${slot}`);
  if(slot>0){
   const radius=(f.rootRadius??3.8)*Math.max(p.width,p.depth);let y=heightAt(p.e,p.n);
   for(let i=0;i<24;i++){const a=i*Math.PI/12;y=Math.min(y,heightAt(p.e+Math.cos(a)*radius,p.n+Math.sin(a)*radius));}
   p.y=y-.08-f.sink*p.height-radius*Math.hypot(p.leanX,p.leanZ);
  }
  return {placement:p,slot};
 });
}

/** No meshes in this catalog. Bounds and matrices are absolute and survive tree LOD. */
export function readonlyTreeCatalog(records:readonly WildlifeTreeDescriptor[]):ReadonlyTreeCatalog{
 const entries=records.map(r=>Object.freeze({...r,modelToAbsoluteXYZ:Object.freeze([...r.modelToAbsoluteXYZ]),bounds:Object.freeze({min:Object.freeze({...r.bounds.min}),max:Object.freeze({...r.bounds.max})})}));
 const byId=new Map(entries.map(r=>[r.id,r]));
 if(byId.size!==entries.length)throw Error('Duplicate tree ID');
 return Object.freeze({get:(id:string)=>byId.get(id),all:()=>entries.values(),nearby:(e:number,n:number,radiusM:number)=>entries.filter(t=>Math.hypot(t.modelToAbsoluteXYZ[12]-e,-t.modelToAbsoluteXYZ[14]-n)<=radiusM)});
}
