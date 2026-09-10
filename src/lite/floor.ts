import {addToScene,createMeshFromData,createStandardMaterial,loadTexture2D,removeFromScene} from '@babylonjs/lite';
import type {EngineContext,Mesh,SceneContext,Texture2D} from '@babylonjs/lite';
import type {PackedFloor} from './floor.worker.ts';
import {COVER} from '../domain/cover-field.ts';
import type {Box,Point3} from '../domain/harness.ts';
import {coverFadePlugin,unlit} from './materials.ts';
import {createCoverField} from './cover.ts';
import foliageURL from '../../assets/floor/foliage.png';

export async function createForestFloor(engine:EngineContext,scene:SceneContext,boxes:Box[],feet:Point3){
 const grass=unlit(createStandardMaterial(),[1,1,1]);grass.name='grass';
 const leaves=unlit(createStandardMaterial(),[1,1,1]);leaves.name='floor-leaves';
 for(const m of [grass,leaves]){m.backFaceCulling=false;m.emissiveColor=[.045,.075,.025];}
 const foliage=await loadTexture2D(engine,foliageURL,{invertY:false,addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});
 leaves.diffuseTexture=foliage;leaves.alphaCutOff=.45;
 grass.emissiveColor=[.045,.075,.025];leaves.emissiveColor=[.12,.17,.065];
 const fadeGrass=coverFadePlugin(feet,COVER.nearStart,COVER.nearEnd);
 const fadeLeaves=coverFadePlugin(feet,COVER.nearStart,COVER.nearEnd);
 grass.plugins=[fadeGrass];leaves.plugins=[fadeLeaves];
 const field=createCoverField(engine,scene,boxes,foliage,feet);
 const radius=COVER.nearRadius,hideM=COVER.nearEnd;
 let lastBuildMs=0,maxBuildMs=0,preparationMaxBuildMs=0;
 const cells=new Map<string,{x:number;z:number;meshes:Mesh[]}>();
 let lastE=Infinity,lastN=Infinity,pending:{x:number;z:number;key:string}[]=[];
 function mesh(g:PackedFloor,name:string,material:typeof grass){
  if(!g.indices.length)return [];
  const m=createMeshFromData(engine,name,g.positions,g.normals,g.indices,g.uvs,undefined,undefined,g.colors);
  m.material=material;m.pickable=false;m.receiveShadows=true;addToScene(scene,m);return [m];
 }
 type Job={x:number;z:number;key:string};
 const worker=new Worker(new URL('./floor.worker.ts',import.meta.url),{type:'module'});
 let workerJob:Job|null=null,prepared:{job:Job;data:{grass:PackedFloor;leaves:PackedFloor}}|null=null,workerError='',workerMaxBuildMs=0;
 worker.postMessage({type:'init',boxes});
 worker.onmessage=({data})=>{workerJob=null;if(data.error)workerError=data.error;else{prepared=data;workerMaxBuildMs=Math.max(workerMaxBuildMs,data.buildMs);}};
 worker.onerror=e=>{workerError=e.message||'Не удалось подготовить растительность';};
 function activate(next:Job,data:{grass:PackedFloor;leaves:PackedFloor}){
  if(Math.abs(next.x-lastE)>radius||Math.abs(next.z-lastN)>radius)return;
  const started=performance.now();cells.set(next.key,{x:next.x,z:next.z,meshes:[...mesh(data.grass,'grass-'+next.key,grass),...mesh(data.leaves,'leaves-'+next.key,leaves)]});
  lastBuildMs=performance.now()-started;maxBuildMs=Math.max(maxBuildMs,lastBuildMs);
 }
 function request(job:Job){
  return new Promise<{grass:PackedFloor;leaves:PackedFloor;buildMs:number}>((resolve,reject)=>{
   const prev=worker.onmessage;
   worker.onmessage=({data})=>{
    worker.onmessage=prev;
    if(data.error)reject(new Error(data.error));
    else resolve({...data.data,buildMs:data.buildMs});
   };
   worker.postMessage(job);
  });
 }
 async function prepare(at:Point3,progress:(ready:string)=>void){
  feet.x=at.x;feet.y=at.y;feet.z=at.z;lastE=Math.floor(at.x/8);lastN=Math.floor(-at.z/8);
  const wanted:Job[]=[];
  for(let z=lastN-radius;z<=lastN+radius;z++)for(let x=lastE-radius;x<=lastE+radius;x++)wanted.push({x,z,key:`${x}:${z}`});
  wanted.sort((a,b)=>Math.hypot(a.x-lastE,a.z-lastN)-Math.hypot(b.x-lastE,b.z-lastN));
  for(const [i,job] of wanted.entries()){
   const data=await request(job);
   activate(job,{grass:data.grass,leaves:data.leaves});
   preparationMaxBuildMs=Math.max(preparationMaxBuildMs,data.buildMs);
   progress(`${i+1}/${wanted.length}`);
  }
  while(field.hasPending())field.update(at,true);
 }
 function update(at:Point3){
  if(workerError)throw new Error(workerError);
  feet.x=at.x;feet.y=at.y;feet.z=at.z;
  const cx=Math.floor(at.x/8),cz=Math.floor(-at.z/8);
  if(cx!==lastE||cz!==lastN){
   lastE=cx;lastN=cz;const wanted=new Set<string>();pending=[];
   for(let z=cz-radius;z<=cz+radius;z++)for(let x=cx-radius;x<=cx+radius;x++){
    const key=`${x}:${z}`;wanted.add(key);if(!cells.has(key)&&key!==workerJob?.key&&key!==prepared?.job.key)pending.push({x,z,key});
   }
   pending.sort((a,b)=>Math.hypot(a.x-cx,a.z-cz)-Math.hypot(b.x-cx,b.z-cz));
   for(const [key,cell] of cells)if(!wanted.has(key)){for(const m of cell.meshes)removeFromScene(scene,m);cells.delete(key);}
  }
  if(prepared){activate(prepared.job,prepared.data);prepared=null;}
  if(!workerJob&&pending.length){workerJob=pending.shift()!;worker.postMessage(workerJob);}
  field.update(at,true);
  for(const cell of cells.values()){
   const d=Math.hypot(Math.max(cell.x*8-1-at.x,0,at.x-((cell.x+1)*8+1)),Math.max(cell.z*8-1+at.z,0,-at.z-((cell.z+1)*8+1)));
   for(const m of cell.meshes)m.visible=d<hideM;
  }
 }
 return {update,prepare,stats:()=>({cells:cells.size,pending:pending.length,lastBuildMs,maxBuildMs,preparationMaxBuildMs,workerMaxBuildMs,cover:field.stats()}),foliage};
}
