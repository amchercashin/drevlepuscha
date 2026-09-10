import {addToScene,createMeshFromData,createStandardMaterial,removeFromScene} from '@babylonjs/lite';
import type {EngineContext,Mesh,SceneContext,Texture2D} from '@babylonjs/lite';
import type {Box,Point3} from '../domain/harness.ts';
import {FOREST_BOUNDS} from '../domain/forest.ts';
import {makeCoverTile,COVER} from '../domain/cover-field.ts';
import {asF32,asU32,computeNormals} from './geometry.ts';
import {coverFadePlugin,unlit} from './materials.ts';

export function createCoverField(engine:EngineContext,scene:SceneContext,boxes:Box[],foliage:Texture2D,feet:Point3){
 const far=unlit(createStandardMaterial(),[1,1,1]);far.name='cover-far';
 const mid=unlit(createStandardMaterial(),[1,1,1]);mid.name='cover-mid';
 for(const m of [far,mid]){
  m.emissiveColor=[.045,.075,.025];m.backFaceCulling=false;m.diffuseTexture=foliage;m.alphaCutOff=.45;
 }
 far.plugins=[coverFadePlugin(feet,COVER.midEnd,COVER.midEnd+40)];
 mid.plugins=[coverFadePlugin(feet,COVER.midStart,COVER.midEnd)];
 const field:Mesh[]=[],cells=new Map<string,Mesh>();
 type Job={x:number;z:number;key:string};const farQueue:Job[]=[];let pending:Job[]=[],last='',lastBuildMs=0,maxBuildMs=0;
 for(let z=FOREST_BOUNDS.minN/64;z<FOREST_BOUNDS.maxN/64;z++)for(let x=FOREST_BOUNDS.minE/64;x<FOREST_BOUNDS.maxE/64;x++)farQueue.push({x,z,key:`${x}:${z}`});
 function build(job:Job,layer:'far'|'mid'){
  const start=performance.now(),g=makeCoverTile(job.x,job.z,layer,boxes);
  const mesh=createMeshFromData(engine,`cover-${layer}-${job.key}`,asF32(g.positions),g.normals.length?asF32(g.normals):computeNormals(g.positions,g.indices),asU32(g.indices),asF32(g.uvs),undefined,undefined,asF32(g.colors));
  mesh.material=layer==='far'?far:mid;mesh.pickable=false;mesh.receiveShadows=true;
  mesh.metadata={x:job.x,z:job.z,layer};addToScene(scene,mesh);
  lastBuildMs=performance.now()-start;maxBuildMs=Math.max(maxBuildMs,lastBuildMs);return mesh;
 }
 function update(at:Point3,canBuild=true){
  feet.x=at.x;feet.y=at.y;feet.z=at.z;
  const cx=Math.floor(at.x/32),cz=Math.floor(-at.z/32),id=`${cx}:${cz}`;lastBuildMs=0;
  if(id!==last){
   last=id;pending=[];const wanted=new Set<string>();
   for(let z=cz-COVER.midRadius;z<=cz+COVER.midRadius;z++)for(let x=cx-COVER.midRadius;x<=cx+COVER.midRadius;x++){
    if(x*32<FOREST_BOUNDS.minE||x*32>=FOREST_BOUNDS.maxE||z*32<FOREST_BOUNDS.minN||z*32>=FOREST_BOUNDS.maxN)continue;
    const key=`${x}:${z}`;wanted.add(key);if(!cells.has(key))pending.push({x,z,key});
   }
   pending.sort((a,b)=>Math.hypot(a.x-cx,a.z-cz)-Math.hypot(b.x-cx,b.z-cz));
   for(const [key,m] of cells)if(!wanted.has(key)){removeFromScene(scene,m);cells.delete(key);}
  }
  if(canBuild){
   const next=pending.shift();if(next)cells.set(next.key,build(next,'mid'));
   else{const nextFar=farQueue.shift();if(nextFar)field.push(build(nextFar,'far'));}
  }
  for(const m of cells.values()){
   const meta=m.metadata as {x:number;z:number};
   const d=Math.hypot(Math.max(meta.x*32-1-at.x,0,at.x-(meta.x*32+33)),Math.max(meta.z*32-1+at.z,0,-at.z-(meta.z*32+33)));
   m.visible=d<COVER.midEnd;
  }
 }
 return {update,hasPending:()=>pending.length+farQueue.length>0,stats:()=>({farTiles:field.length,farPending:farQueue.length,midTiles:cells.size,midPending:pending.length,lastBuildMs,maxBuildMs,fullField:true})};
}
