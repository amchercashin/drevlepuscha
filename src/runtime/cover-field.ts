import {FrameWorkBudget} from './startup.ts';
import {Material} from '@babylonjs/core/Materials/material.js';
import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture.js';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {Box,Point3} from '../domain/harness.ts';
import {FOREST_BOUNDS} from '../domain/forest.ts';
import {COVER} from '../domain/cover-field.ts';
import {CoverFade} from './cover-fade.ts';
export function createCoverField(scene:Scene,boxes:Box[],foliage:BaseTexture){
 const far=new StandardMaterial('cover-far',scene),mid=new StandardMaterial('cover-mid',scene);
 for(const m of [far,mid]){m.diffuseColor=Color3.White();m.specularColor=Color3.Black();m.emissiveColor=new Color3(.045,.075,.025);m.backFaceCulling=false;m.twoSidedLighting=true;m.diffuseTexture=foliage;m.useAlphaFromDiffuseTexture=true;m.transparencyMode=Material.MATERIAL_ALPHATEST;m.alphaCutOff=.45;}
 const fade=new CoverFade(mid,COVER.midStart,COVER.midEnd),field:Mesh[]=[],cells=new Map<string,Mesh>();
 type Job={x:number;z:number;key:string};
 type CoverJob=Job&{layer:'far'|'mid'};
 type Geometry={positions:Float32Array;indices:Uint32Array;colors:Float32Array;normals:Float32Array;uvs:Float32Array};
 const worker=new Worker(new URL('./floor.worker.ts',import.meta.url),{type:'module'});
 worker.postMessage({type:'init',boxes});
 let inflight:CoverJob|null=null,completed:{job:CoverJob;geometry:Geometry}|null=null,workerError='',workerMaxBuildMs=0;
 worker.onmessage=({data})=>{if(data.error)workerError=data.error;else{completed=data;workerMaxBuildMs=Math.max(workerMaxBuildMs,data.buildMs);}};
 worker.onerror=e=>{workerError=e.message||'Не удалось подготовить лесной покров';};
 scene.onDisposeObservable.add(()=>worker.terminate());
 const farQueue:Job[]=[];let pending:Job[]=[],last='',lastBuildMs=0,maxBuildMs=0;
 for(let z=FOREST_BOUNDS.minN/64;z<FOREST_BOUNDS.maxN/64;z++)for(let x=FOREST_BOUNDS.minE/64;x<FOREST_BOUNDS.maxE/64;x++)farQueue.push({x,z,key:`${x}:${z}`});
 function build(job:CoverJob,g:Geometry){
  const {layer}=job,start=performance.now(),m=new Mesh(`cover-${layer}-${job.key}`,scene),d=new VertexData();
  Object.assign(d,g);d.applyToMesh(m);m.material=layer==='far'?far:mid;m.isPickable=false;m.receiveShadows=true;m.freezeWorldMatrix();
  m.metadata={x:job.x,z:job.z,layer};lastBuildMs=performance.now()-start;maxBuildMs=Math.max(maxBuildMs,lastBuildMs);return m;
 }
 const distance=(job:Job,feet:Point3,size:number)=>Math.hypot(Math.max(job.x*size-feet.x,0,feet.x-(job.x+1)*size),Math.max(job.z*size+feet.z,0,-feet.z-(job.z+1)*size));
 const localReady=(feet:Point3)=>last!==''&&!pending.some(j=>distance(j,feet,32)<64)&&!farQueue.some(j=>distance(j,feet,64)<128)&&(!inflight||distance(inflight,feet,inflight.layer==='far'?64:32)>=(inflight.layer==='far'?128:64));
 function update(feet:Point3,budget=new FrameWorkBudget()){
  if(workerError)throw Error(workerError);
  fade.feet=feet;const cx=Math.floor(feet.x/32),cz=Math.floor(-feet.z/32),id=`${cx}:${cz}`;lastBuildMs=0;
  if(id!==last){
   last=id;pending=[];const wanted=new Set<string>();
   for(let z=cz-COVER.midRadius;z<=cz+COVER.midRadius;z++)for(let x=cx-COVER.midRadius;x<=cx+COVER.midRadius;x++){
    if(x*32<FOREST_BOUNDS.minE||x*32>=FOREST_BOUNDS.maxE||z*32<FOREST_BOUNDS.minN||z*32>=FOREST_BOUNDS.maxN)continue;
    const key=`${x}:${z}`;wanted.add(key);if(!cells.has(key)&&!(inflight?.layer==='mid'&&inflight.key===key))pending.push({x,z,key});
   }
   pending.sort((a,b)=>distance(a,feet,32)-distance(b,feet,32));
   farQueue.sort((a,b)=>distance(a,feet,64)-distance(b,feet,64));
   for(const [key,m] of cells)if(!wanted.has(key)){m.dispose();cells.delete(key);}
  }
  if(completed)budget.run(()=>{
   const {job,geometry}=completed!;completed=null;inflight=null;
   if(job.layer==='far')field.push(build(job,geometry));
   else if(Math.abs(job.x-cx)<=COVER.midRadius&&Math.abs(job.z-cz)<=COVER.midRadius)cells.set(job.key,build(job,geometry));
  });
  if(!inflight&&(pending.length||farQueue.length)){
   // Fill the visible rings before invisible middle cells elsewhere in the cache.
   const farFirst=farQueue.length&&distance(farQueue[0],feet,64)<128&&(!pending.length||distance(pending[0],feet,32)>=64);
   inflight=farFirst||!pending.length?{...farQueue.shift()!,layer:'far'}:{...pending.shift()!,layer:'mid'};
   worker.postMessage(inflight);
  }
  for(const m of cells.values()){
   const {x,z}=m.metadata;
   const d=Math.hypot(Math.max(x*32-1-feet.x,0,feet.x-(x*32+33)),Math.max(z*32-1+feet.z,0,-feet.z-(z*32+33)));
   m.setEnabled(d<COVER.midEnd);
  }
 }
 return {update,localReady,hasPending:()=>pending.length+farQueue.length+Number(!!inflight)>0,stats:()=>({farTiles:field.length,farPending:farQueue.length+Number(inflight?.layer==='far'),midTiles:cells.size,midPending:pending.length+Number(inflight?.layer==='mid'),lastBuildMs,maxBuildMs,workerMaxBuildMs,triangles:[...field,...cells.values()].reduce((n,m)=>n+m.getTotalIndices()/3,0),fullField:true})};
}
