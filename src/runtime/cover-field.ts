import {Material} from '@babylonjs/core/Materials/material.js';
import type {BaseTexture} from '@babylonjs/core/Materials/Textures/baseTexture.js';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {Box,Point3} from '../domain/harness.ts';
import {FOREST_BOUNDS} from '../domain/forest.ts';
import {makeCoverTile,COVER} from '../domain/cover-field.ts';
import {CoverFade} from './cover-fade.ts';
export function createCoverField(scene:Scene,boxes:Box[],foliage:BaseTexture){
 const far=new StandardMaterial('cover-far',scene),mid=new StandardMaterial('cover-mid',scene);
 for(const m of [far,mid]){m.diffuseColor=Color3.White();m.specularColor=Color3.Black();m.emissiveColor=new Color3(.045,.075,.025);m.backFaceCulling=false;m.twoSidedLighting=true;m.diffuseTexture=foliage;m.useAlphaFromDiffuseTexture=true;m.transparencyMode=Material.MATERIAL_ALPHATEST;m.alphaCutOff=.45;}
 const fade=new CoverFade(mid,COVER.midStart,COVER.midEnd),field:Mesh[]=[],cells=new Map<string,Mesh>();
 type Job={x:number;z:number;key:string};const farQueue:Job[]=[];let pending:Job[]=[],last='',lastBuildMs=0,maxBuildMs=0;
 for(let z=FOREST_BOUNDS.minN/64;z<FOREST_BOUNDS.maxN/64;z++)for(let x=FOREST_BOUNDS.minE/64;x<FOREST_BOUNDS.maxE/64;x++)farQueue.push({x,z,key:`${x}:${z}`});
 function build(job:Job,layer:'far'|'mid'){
  const start=performance.now(),g=makeCoverTile(job.x,job.z,layer,boxes),m=new Mesh(`cover-${layer}-${job.key}`,scene),d=new VertexData();
  Object.assign(d,g);d.applyToMesh(m);m.material=layer==='far'?far:mid;m.isPickable=false;m.receiveShadows=true;m.freezeWorldMatrix();
  m.metadata={x:job.x,z:job.z,layer};lastBuildMs=performance.now()-start;maxBuildMs=Math.max(maxBuildMs,lastBuildMs);return m;
 }
 function update(feet:Point3,canBuild=true){
  fade.feet=feet;const cx=Math.floor(feet.x/32),cz=Math.floor(-feet.z/32),id=`${cx}:${cz}`;lastBuildMs=0;
  if(id!==last){
   last=id;pending=[];const wanted=new Set<string>();
   for(let z=cz-COVER.midRadius;z<=cz+COVER.midRadius;z++)for(let x=cx-COVER.midRadius;x<=cx+COVER.midRadius;x++){
    if(x*32<FOREST_BOUNDS.minE||x*32>=FOREST_BOUNDS.maxE||z*32<FOREST_BOUNDS.minN||z*32>=FOREST_BOUNDS.maxN)continue;
    const key=`${x}:${z}`;wanted.add(key);if(!cells.has(key))pending.push({x,z,key});
   }
   pending.sort((a,b)=>Math.hypot(a.x-cx,a.z-cz)-Math.hypot(b.x-cx,b.z-cz));
   for(const [key,m] of cells)if(!wanted.has(key)){m.dispose();cells.delete(key);}
  }
  if(canBuild){
   const next=pending.shift();if(next)cells.set(next.key,build(next,'mid'));
   else{const nextFar=farQueue.shift();if(nextFar)field.push(build(nextFar,'far'));}
  }
  for(const m of cells.values()){
   const {x,z}=m.metadata;
   const d=Math.hypot(Math.max(x*32-1-feet.x,0,feet.x-(x*32+33)),Math.max(z*32-1+feet.z,0,-feet.z-(z*32+33)));
   m.setEnabled(d<COVER.midEnd);
  }
 }
 return {update,hasPending:()=>pending.length+farQueue.length>0,stats:()=>({farTiles:field.length,farPending:farQueue.length,midTiles:cells.size,midPending:pending.length,lastBuildMs,maxBuildMs,triangles:[...field,...cells.values()].reduce((n,m)=>n+m.getTotalIndices()/3,0),fullField:true})};
}
