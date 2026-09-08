import {forestHorizon} from './forest-horizon.ts';
import {LodDither} from './lod-dither.ts';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import '@babylonjs/core/Meshes/instancedMesh.js';
import type {InstancedMesh} from '@babylonjs/core/Meshes/instancedMesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {Ray} from '@babylonjs/core/Culling/ray.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {Point3} from '../domain/harness.ts';
import type {TreePart} from '../domain/reference-tree.ts';
import {forestPlacements,treeCollider,treeLevel,FOREST_VERSION} from '../domain/forest.ts';
import type {TreePlacement} from '../domain/forest.ts';
import {occludesTraveller,fadeOpacity} from '../domain/harness.ts';
import config from '../../config/camera-presets.json';
import dataURL from '../../assets/trees/game/tree.json?url';
import barkURL from '../../assets/trees/bark.png';
import canopyURL from '../../assets/trees/canopy.png';

export async function createForest(scene:Scene){
 const response=await fetch(dataURL);if(!response.ok)throw new Error('Game tree could not load');
 const data=await response.json() as {levels:TreePart[][];triangles:number[]};
 const materials=['bark','canopy'].map((name,i)=>{const m=new StandardMaterial(`forest-${name}`,scene);m.diffuseColor=Color3.White();m.specularColor=Color3.Black();m.diffuseTexture=new Texture(i?canopyURL:barkURL,scene,false,false);new LodDither(m);return m;});
 const templates=data.levels.map((parts,level)=>parts.map((p,i)=>{const m=new Mesh(`source-${level}-${p.name}`,scene);m.sideOrientation=1;const v=new VertexData();Object.assign(v,p);v.applyToMesh(m);m.material=materials[i];m.setEnabled(false);return m;}));
 const placements=forestPlacements();
 const horizon=forestHorizon(placements,templates[2]);
 interface ActiveTree {placement:TreePlacement;level:number;instances:InstancedMesh[];fades:Map<number,Mesh[]>;previous:number;transition:number;opacity:number[];}
 const active=new Map<string,ActiveTree>();
 function transform(m:Mesh|InstancedMesh,t:TreePlacement){m.position.set(t.e,t.y,-t.n);m.scaling.set(t.width,t.height,t.width);m.rotation.y=t.yaw;m.freezeWorldMatrix();m.isPickable=false;}
 function instances(t:TreePlacement,level:number){return templates[level].map((p,i)=>{const m=p.createInstance(`${t.id}-lod${level}-${i}`);transform(m,t);return m;});}
 function fades(t:ActiveTree,level:number){let pair=t.fades.get(level);if(!pair){pair=templates[level].map((p,i)=>{const m=new Mesh(`${t.placement.id}-lod${level}-${i}-fade`,scene);p.geometry!.applyToMesh(m);m.material=p.material;m.sideOrientation=1;transform(m,t.placement);m.setEnabled(false);return m;});t.fades.set(level,pair);}return pair;}
 let lockNear=false,forceSwitch=false;
 function update(camera:Point3,feet:Point3,dt:number){
  horizon.update(camera,feet);
  for(const p of placements){
   const centreDistance=Math.min(Math.hypot(camera.x-p.e,camera.z+p.n),Math.hypot(feet.x-p.e,feet.z+p.n));
   let t=active.get(p.id);
   // Whole cells hand off to identical far-LOD batches, without alpha overlap or gaps.
   if(!horizon.detailed(p.id)){if(t){t.instances.forEach(m=>m.dispose());for(const pair of t.fades.values())pair.forEach(m=>m.dispose());active.delete(p.id);}continue;}
   if(!t){const level=lockNear?0:centreDistance<32?0:centreDistance<58?1:2;t={placement:p,level,instances:instances(p,level),fades:new Map(),previous:-1,transition:1,opacity:[1,1]};active.set(p.id,t);}
   const distance=Math.max(0,centreDistance-6*p.width),next=lockNear?0:treeLevel(distance,t.level);
   if(next!==t.level&&(t.previous<0||forceSwitch)){if(forceSwitch){for(const pair of t.fades.values())pair.forEach(m=>m.setEnabled(false));t.previous=-1;t.transition=1;}else{t.previous=t.level;t.transition=0;}t.instances.forEach(m=>m.dispose());t.instances=instances(p,next);t.level=next;}
   if(t.previous>=0){t.transition=Math.min(1,t.transition+dt/0.25);if(t.transition===1){fades(t,t.previous).forEach(m=>m.setEnabled(false));t.previous=-1;}}
   for(const [i,m] of t.instances.entries()){
    let blocked=false;
    if(centreDistance<16){const box=m.getBoundingInfo().boundingBox;
     blocked=occludesTraveller(camera,feet,{id:m.id,min:box.minimumWorld,max:box.maximumWorld},t.opacity[i]<0.99,(from,to)=>{
      const origin=new Vector3(from.x,from.y,from.z),direction=new Vector3(to.x-from.x,to.y-from.y,to.z-from.z),length=direction.length();direction.normalize();
      const hit=new Ray(origin,direction,length).intersectsMesh(m,false);return hit.hit&&hit.distance<length-0.001;
     });
    }
    t.opacity[i]=fadeOpacity(t.opacity[i],blocked?config.travel.occluderOpacity:1,dt,blocked?config.travel.fadeOutSeconds:config.travel.fadeInSeconds);
    const separate=t.opacity[i]<1||t.previous>=0;m.setEnabled(!separate);
    if(separate){const mesh=fades(t,t.level)[i];mesh.setEnabled(true);mesh.visibility=t.opacity[i];mesh.metadata={lodCoverage:[0,t.transition]};}
    else t.fades.get(t.level)?.[i].setEnabled(false);
    if(t.previous>=0){const mesh=fades(t,t.previous)[i];mesh.setEnabled(true);mesh.visibility=t.opacity[i];mesh.metadata={lodCoverage:[t.transition,1]};}
   }
  }
  forceSwitch=false;
 }
 return {boxes:placements.map(treeCollider),update,stats:()=>({version:FOREST_VERSION,trees:placements.length,activeTrees:active.size,trianglesPerLevel:data.triangles,materialsPerTree:2,lodCounts:[0,1,2].map(l=>[...active.values()].filter(t=>t.level===l).length),lockNear,transitions:[...active.values()].filter(t=>t.previous>=0).length,geometryBuffers:6+horizon.stats().cells*2,horizon:horizon.stats()}),setNearOnly:(v:boolean)=>{lockNear=v;forceSwitch=true;},get meshes(){return [...active.values()].flatMap(t=>[...t.fades.values()].flat());}};
}
