import {treeTone,TREE_TONE_VERSION} from '../domain/tree-tone.ts';
import {TreeTone} from './tree-tone.ts';
import {treeAsset} from './tree-assets.ts';
import type {TreeAssetData} from './tree-assets.ts';
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
 const selected=treeAsset(new URLSearchParams(location.search).get('tree')??'meshy-a');
 const response=await fetch(selected?.dataURL??dataURL);if(!response.ok)throw new Error('Game tree could not load');
 const data=await response.json() as TreeAssetData;
 const textureURLs:Record<string,string>=selected?selected.textures:{bark:barkURL,canopy:canopyURL};
 const materials=data.levels[0].map(({name})=>{const m=new StandardMaterial(`forest-${name}`,scene);m.diffuseColor=Color3.White();m.specularColor=Color3.Black();m.diffuseTexture=new Texture(textureURLs[name],scene,false,false);m.backFaceCulling=!(data.doubleSided?.[name]??false);new LodDither(m);return m;});
 const bakedMaterials=data.bakedColorFromLevel===undefined?materials:materials.map(m=>{const copy=new StandardMaterial(m.name+'-baked',scene);copy.diffuseColor=Color3.White();copy.specularColor=Color3.Black();copy.backFaceCulling=m.backFaceCulling;new LodDither(copy);return copy;});
 const tonePlugins=selected?.id==='meshy-a'?[...new Set([...materials,...bakedMaterials])].map(m=>new TreeTone(m)):[];
 const templates=data.levels.map((parts,level)=>parts.map((p,i)=>{const m=new Mesh(`source-${level}-${p.name}`,scene);m.sideOrientation=1;const v=new VertexData();Object.assign(v,p);v.applyToMesh(m);m.material=level>=(data.bakedColorFromLevel??Infinity)?bakedMaterials[i]:materials[i];if(tonePlugins.length){m.registerInstancedBuffer('treeTone',3);m.instancedBuffers.treeTone=Vector3.Zero();}m.setEnabled(false);return m;}));
 const placements=forestPlacements(data.rootRadius,data.placement);
 const tones=tonePlugins.length?new Map(placements.map(p=>[p.id,Vector3.FromArray(treeTone(p.id,p.e,p.n))])):undefined;
 const horizon=forestHorizon(placements,templates[2],tones);
 interface ActiveTree {placement:TreePlacement;level:number;instances:InstancedMesh[];fades:Map<number,Mesh[]>;previous:number;transition:number;opacity:number[];}
 const active=new Map<string,ActiveTree>();
 function transform(m:Mesh|InstancedMesh,t:TreePlacement){m.position.set(t.e,t.y,-t.n);m.scaling.set(t.width,t.height,t.depth);m.rotation.set(t.leanX,t.yaw,t.leanZ);m.freezeWorldMatrix();m.isPickable=false;const tone=tones?.get(t.id);if(tone){m.metadata={treeTone:tone};if(m.instancedBuffers)m.instancedBuffers.treeTone=tone;}}
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
   if(!t){const level=lockNear?0:centreDistance<32?0:centreDistance<58?1:2;t={placement:p,level,instances:instances(p,level),fades:new Map(),previous:-1,transition:1,opacity:materials.map(()=>1)};active.set(p.id,t);}
   const distance=Math.max(0,centreDistance-6*Math.max(p.width,p.depth)),next=lockNear?0:treeLevel(distance,t.level);
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
    if(separate){const mesh=fades(t,t.level)[i];mesh.setEnabled(true);mesh.visibility=t.opacity[i];mesh.metadata={...mesh.metadata,lodCoverage:[0,t.transition]};}
    else t.fades.get(t.level)?.[i].setEnabled(false);
    if(t.previous>=0){const mesh=fades(t,t.previous)[i];mesh.setEnabled(true);mesh.visibility=t.opacity[i];mesh.metadata={...mesh.metadata,lodCoverage:[t.transition,1]};}
   }
  }
  forceSwitch=false;
 }
 return {boxes:placements.map(p=>treeCollider(p,data.trunkRadius)),update,stats:()=>({version:FOREST_VERSION,asset:selected?.id??'game',assetLabel:selected?.label,colorVariation:tonePlugins.length>0&&tonePlugins[0].strength>0,colorVersion:tonePlugins.length?TREE_TONE_VERSION:null,trees:placements.length,activeTrees:active.size,trianglesPerLevel:data.triangles,materialsPerTree:materials.length,lodCounts:[0,1,2].map(l=>[...active.values()].filter(t=>t.level===l).length),lockNear,transitions:[...active.values()].filter(t=>t.previous>=0).length,geometryBuffers:templates.length*materials.length+horizon.stats().cells*materials.length,horizon:horizon.stats()}),setColorVariation:(v:boolean)=>tonePlugins.forEach(p=>p.strength=v?1:0),setNearOnly:(v:boolean)=>{lockNear=v;forceSwitch=true;},get meshes(){return [...active.values()].flatMap(t=>[...t.fades.values()].flat());}};
}
