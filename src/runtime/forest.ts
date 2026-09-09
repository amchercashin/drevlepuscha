import {treeFamilySlot} from '../domain/tree-family.ts';
import {groundHeight} from '../domain/harness.ts';
import forkURL from '../../assets/trees/fork-oak/variants.json?url';
import forkTexture from '../../assets/trees/fork-oak/material-0.jpg';
import youngURL from '../../assets/trees/young-tree/variants.json?url';
import youngTexture from '../../assets/trees/young-tree/material-0.jpg';
import {LeafTransmission} from './leaf-transmission.ts';
import type {DirectionalLight} from '@babylonjs/core/Lights/directionalLight.js';
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
import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
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

export async function createForest(scene:Scene,sun:DirectionalLight){
 const selected=treeAsset(new URLSearchParams(location.search).get('tree')??'meshy-a');
 const response=await fetch(selected?.dataURL??dataURL);if(!response.ok)throw new Error('Game tree could not load');
 const data=await response.json() as TreeAssetData;
 const textureURLs:Record<string,string>=selected?selected.textures:{bark:barkURL,canopy:canopyURL};
 const variety=selected?.id==='meshy-a'&&new URLSearchParams(location.search).get('variety')!=='0';
 const tonePlugins:TreeTone[]=[];
 const materialSets=new Map<string,{materials:StandardMaterial[];baked:StandardMaterial[]}>();
 function family(id:string,d:TreeAssetData,urls:Record<string,string>,sink=.85){
  const materialKey=JSON.stringify([urls,d.bakedColorFromLevel,d.doubleSided]),cached=materialSets.get(materialKey);
  const materials=cached?.materials??d.levels[0].map(({name})=>{const m=new StandardMaterial(`forest-${id}-${name}`,scene);m.diffuseColor=Color3.White();m.specularColor=Color3.Black();m.diffuseTexture=new Texture(urls[name],scene,false,false);m.backFaceCulling=!(d.doubleSided?.[name]??false);new LodDither(m);return m;});
  const baked=cached?.baked??(d.bakedColorFromLevel===undefined?materials:materials.map(m=>{const copy=new StandardMaterial(m.name+'-baked',scene);copy.diffuseColor=Color3.White();copy.specularColor=Color3.Black();copy.backFaceCulling=m.backFaceCulling;new LodDither(copy);return copy;}));
  if(!cached)for(const m of new Set([...materials,...baked])){new LeafTransmission(m,sun);if(selected?.id==='meshy-a')tonePlugins.push(new TreeTone(m));}
  materialSets.set(materialKey,{materials,baked});
  const templates=d.levels.map((parts,level)=>parts.map((p,i)=>{const m=new Mesh(`source-${id}-${level}-${p.name}`,scene);m.sideOrientation=1;const v=new VertexData();Object.assign(v,p);v.applyToMesh(m);m.material=level>=(d.bakedColorFromLevel??Infinity)?baked[i]:materials[i];if(selected?.id==='meshy-a'){m.registerInstancedBuffer('treeTone',3);m.instancedBuffers.treeTone=Vector3.Zero();}m.setEnabled(false);return m;}));
  return {id,data:d,materials,templates,sink};
 }
 const families=[family(selected?.id??'game',data,textureURLs)],variantCounts:[number,number]=[0,0];
 const additional=[[forkURL,forkTexture,.35],[youngURL,youngTexture,.16]] as const;
 if(variety)for(const [familyIndex,[url,texture,sink]] of additional.entries()){
  const r=await fetch(url);if(!r.ok)throw new Error('Forest variant data could not load');
  const asset=await r.json() as {version:string;doubleSided:Record<string,boolean>;variants:(TreeAssetData&{id:string})[]};
  if(asset.variants.length<1||asset.variants.length>4)throw new Error('Expected 1–4 variants per tree family');
  variantCounts[familyIndex]=asset.variants.length;
  for(const variant of asset.variants)families.push(family(variant.id,{...variant,version:asset.version,doubleSided:asset.doubleSided},{'material-0':texture},sink));
 }
 const placements=forestPlacements(data.rootRadius,data.placement);
 const slots=new Map(placements.map(p=>[p.id,variety?treeFamilySlot(p,variantCounts):0]));
 const familyFor=(p:TreePlacement)=>families[slots.get(p.id)!];
 const familyCounts=families.map(()=>0);for(const slot of slots.values())familyCounts[slot]++;
 for(const p of placements)if(slots.get(p.id)!>0){
  const f=familyFor(p),radius=(f.data.rootRadius??3.8)*Math.max(p.width,p.depth);let y=groundHeight(p.e,p.n);
  for(let i=0;i<24;i++){const a=i*Math.PI/12;y=Math.min(y,groundHeight(p.e+Math.cos(a)*radius,p.n+Math.sin(a)*radius));}
  p.y=y-.08-f.sink*p.height-radius*Math.hypot(p.leanX,p.leanZ);
 }
 const tones=tonePlugins.length?new Map(placements.map(p=>[p.id,Vector3.FromArray(treeTone(p.id,p.e,p.n))])):undefined;
 const horizon=forestHorizon(placements,p=>familyFor(p).templates[2],tones);
 interface ActiveTree {placement:TreePlacement;level:number;instances:InstancedMesh[];fades:Map<number,Mesh[]>;previous:number;transition:number;opacity:number[];}
 const active=new Map<string,ActiveTree>();
 function transform(m:Mesh|InstancedMesh,t:TreePlacement){m.position.set(t.e,t.y,-t.n);m.scaling.set(t.width,t.height,t.depth);m.rotation.set(t.leanX,t.yaw,t.leanZ);m.freezeWorldMatrix();m.isPickable=false;m.receiveShadows=true;const tone=tones?.get(t.id);if(tone){m.metadata={treeTone:tone};if(m.instancedBuffers)m.instancedBuffers.treeTone=tone;}}
 function instances(t:TreePlacement,level:number){return familyFor(t).templates[level].map((p,i)=>{const m=p.createInstance(`${t.id}-lod${level}-${i}`);transform(m,t);return m;});}
 function fades(t:ActiveTree,level:number){let pair=t.fades.get(level);if(!pair){pair=familyFor(t.placement).templates[level].map((p,i)=>{const m=new Mesh(`${t.placement.id}-lod${level}-${i}-fade`,scene);p.geometry!.applyToMesh(m);m.material=p.material;m.sideOrientation=1;transform(m,t.placement);m.setEnabled(false);return m;});t.fades.set(level,pair);}return pair;}
 // Persistent shared geometry and bounded matrix buffers; no per-cell mesh merge.
 const shadowMaterial=new StandardMaterial('forest-shadow-only',scene);
 const shadowGroups=families.map((family,i)=>({entries:[] as {p:TreePlacement;matrix:Matrix}[],buffer:new Float32Array(familyCounts[i]*16),meshes:family.templates[1].map((source,j)=>{
  const mesh=new Mesh(`forest-shadow-${i}-${j}`,scene);source.geometry!.copy(`shadow-geometry-${i}-${j}`).applyToMesh(mesh);
  mesh.material=shadowMaterial;mesh.sideOrientation=1;mesh.layerMask=0;mesh.isPickable=false;mesh.freezeWorldMatrix();return mesh;
 })}));
 for(const p of placements)shadowGroups[slots.get(p.id)!].entries.push({p,matrix:Matrix.Compose(new Vector3(p.width,p.height,p.depth),Quaternion.FromEulerAngles(p.leanX,p.yaw,p.leanZ),new Vector3(p.e,p.y,-p.n))});
 for(const g of shadowGroups)for(const mesh of g.meshes){mesh.thinInstanceSetBuffer('matrix',g.buffer,16,false);mesh.setEnabled(false);}
 let shadowCell='',shadowMeshes:Mesh[]=[];
 function shadowCasters(feet:Point3){
  const e=Math.floor(feet.x/8)*8+4,n=Math.floor(-feet.z/8)*8+4,key=`${e}:${n}`;
  if(key!==shadowCell){
   shadowCell=key;shadowMeshes=[];
   for(const g of shadowGroups){let count=0;
    for(const {p,matrix} of g.entries)if((p.e-e)**2+(p.n-n)**2<56*56)matrix.copyToArray(g.buffer,count++*16);
    for(const mesh of g.meshes){mesh.thinInstanceCount=count;mesh.setEnabled(count>0);if(count){mesh.thinInstanceBufferUpdated('matrix');mesh.thinInstanceRefreshBoundingInfo();shadowMeshes.push(mesh);}}
   }
  }
  return shadowMeshes;
 }
 let lockNear=false,forceSwitch=false;
 function update(camera:Point3,feet:Point3,dt:number){
  horizon.update(camera,feet);
  for(const [id,t] of active)if(!horizon.detailed(id)){t.instances.forEach(m=>m.dispose());for(const pair of t.fades.values())pair.forEach(m=>m.dispose());active.delete(id);}
  for(const p of horizon.activePlacements()){
   const centreDistance=Math.min(Math.hypot(camera.x-p.e,camera.z+p.n),Math.hypot(feet.x-p.e,feet.z+p.n));
   let t=active.get(p.id);
   // Whole cells hand off to identical far-LOD batches, without alpha overlap or gaps.
   if(!horizon.detailed(p.id)){if(t){t.instances.forEach(m=>m.dispose());for(const pair of t.fades.values())pair.forEach(m=>m.dispose());active.delete(p.id);}continue;}
   if(!t){const level=lockNear?0:centreDistance<32?0:centreDistance<58?1:2;t={placement:p,level,instances:instances(p,level),fades:new Map(),previous:-1,transition:1,opacity:familyFor(p).materials.map(()=>1)};active.set(p.id,t);}
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
 return {shadowCasters,boxes:placements.map(p=>treeCollider(p,familyFor(p).data.trunkRadius)),update,stats:()=>({version:FOREST_VERSION,asset:selected?.id??'game',assetLabel:variety?'Три семейства · процедурные варианты':selected?.label,variety,families:families.map((f,i)=>({id:f.id,trees:familyCounts[i],triangles:f.data.triangles})),colorVariation:tonePlugins.length>0&&tonePlugins[0].strength>0,colorVersion:tonePlugins.length?TREE_TONE_VERSION:null,trees:placements.length,activeTrees:active.size,trianglesPerLevel:data.triangles,materialsPerTree:data.levels[0].length,lodCounts:[0,1,2].map(l=>[...active.values()].filter(t=>t.level===l).length),lockNear,transitions:[...active.values()].filter(t=>t.previous>=0).length,geometryBuffers:families.reduce((n,f)=>n+f.templates.reduce((a,b)=>a+b.length,0),0)+horizon.stats().geometryBuffers,horizon:horizon.stats()}),setColorVariation:(v:boolean)=>tonePlugins.forEach(p=>p.strength=v?1:0),setNearOnly:(v:boolean)=>{lockNear=v;forceSwitch=true;},get meshes(){return [...active.values()].flatMap(t=>[...t.fades.values()].flat());}};
}
