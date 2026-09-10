import {
 addToScene,createMeshFromData,createStandardMaterial,eulerToQuat,loadTexture2D,mat4Compose,
 setThinInstanceColors,setThinInstances,setThinInstanceCount,
} from '@babylonjs/lite';
import type {EngineContext,Mesh,SceneContext,StandardMaterialProps} from '@babylonjs/lite';
import {treeFamilySlot} from '../domain/tree-family.ts';
import {groundHeight} from '../domain/harness.ts';
import type {Point3} from '../domain/harness.ts';
import {treeTone,TREE_TONE_VERSION} from '../domain/tree-tone.ts';
import {treeAsset} from '../runtime/tree-assets.ts';
import type {TreeAssetData} from '../runtime/tree-assets.ts';
import {forestPlacements,treeCollider,treeLevel,FOREST_VERSION} from '../domain/forest.ts';
import type {TreePlacement} from '../domain/forest.ts';
import {asF32,asU32,computeNormals} from './geometry.ts';
import {canopyShadePlugin,leafTransmissionPlugin,treeTonePlugin,unlit} from './materials.ts';
import forkURL from '../../assets/trees/fork-oak/variants.json?url';
import forkTexture from '../../assets/trees/fork-oak/material-0.jpg';
import youngURL from '../../assets/trees/young-tree/variants.json?url';
import youngTexture from '../../assets/trees/young-tree/material-0.jpg';
import type {TreePart} from '../domain/reference-tree.ts';

type Sun={direction:{x:number;y:number;z:number};diffuse:[number,number,number];intensity:number};
interface Geom{positions:Float32Array;normals:Float32Array;indices:Uint32Array;uvs?:Float32Array;colors?:Float32Array;material:StandardMaterialProps}
interface Family{
 id:string;data:TreeAssetData;parts:number;sink:number;
 geom:Geom[][];
}
function matrixOf(p:TreePlacement,into?:Float32Array,offset=0){
 const q=eulerToQuat(p.leanX,p.yaw,p.leanZ);
 const m=mat4Compose(p.e,p.y,-p.n,q[0],q[1],q[2],q[3],p.width,p.height,p.depth);
 if(into){into.set(m,offset);return into;}
 return m;
}
function toneColor(id:string,e:number,n:number):[number,number,number,number]{
 const t=treeTone(id,e,n);return [0.5+t[0],0.5+t[1],0.5+t[2],1];
}

export async function createForest(engine:EngineContext,scene:SceneContext,sun:Sun,shadowMatrix:Float32Array){
 const selected=treeAsset('meshy-a');
 const response=await fetch(selected!.dataURL);if(!response.ok)throw new Error('Game tree could not load');
 const data=await response.json() as TreeAssetData;
 async function loadFamily(id:string,asset:TreeAssetData,textureUrl:string,sink:number):Promise<Family>{
  const tex=await loadTexture2D(engine,textureUrl,{invertY:false});
  const makeMat=(name:string,textured:boolean)=>{
   const m=unlit(createStandardMaterial(),[1,1,1]);m.name=name;m.backFaceCulling=!(asset.doubleSided?.['material-0']??false);
   if(textured)m.diffuseTexture=tex;
   m.plugins=[treeTonePlugin(),leafTransmissionPlugin(sun),canopyShadePlugin(shadowMatrix)];
   return m;
  };
  const textured=makeMat(`forest-${id}`,true);
  const baked=asset.bakedColorFromLevel===undefined?textured:makeMat(`forest-${id}-baked`,false);
  const geom:Geom[][]=[];
  for(let level=0;level<asset.levels.length;level++){
   const useBaked=level>=(asset.bakedColorFromLevel??Infinity);
   geom[level]=asset.levels[level].map(part=>partGeom(part,useBaked?baked:textured,useBaked));
  }
  return {id,data:asset,parts:asset.levels[0].length,sink,geom};
 }
 const families=[await loadFamily(selected!.id,data,selected!.textures['material-0'],0.85)];
 const additional=[[forkURL,forkTexture,0.35],[youngURL,youngTexture,0.16]] as const;
 const variantCounts:[number,number]=[0,0];
 for(const [familyIndex,[url,texture,sink]] of additional.entries()){
  const r=await fetch(url);if(!r.ok)throw new Error('Forest variant data could not load');
  const asset=await r.json() as {version:string;doubleSided:Record<string,boolean>;variants:(TreeAssetData&{id:string})[]};
  variantCounts[familyIndex]=asset.variants.length;
  for(const variant of asset.variants)families.push(await loadFamily(variant.id,{...variant,version:asset.version,doubleSided:asset.doubleSided},texture,sink));
 }
 const placements=forestPlacements(data.rootRadius,data.placement);
 const slots=new Map(placements.map(p=>[p.id,treeFamilySlot(p,variantCounts)]));
 const familyCounts=families.map(()=>0);for(const slot of slots.values())familyCounts[slot]++;
 const familyFor=(p:TreePlacement)=>families[slots.get(p.id)!];
 for(const p of placements)if(slots.get(p.id)!>0){
  const f=familyFor(p),radius=(f.data.rootRadius??3.8)*Math.max(p.width,p.depth);let y=groundHeight(p.e,p.n);
  for(let i=0;i<24;i++){const a=i*Math.PI/12;y=Math.min(y,groundHeight(p.e+Math.cos(a)*radius,p.n+Math.sin(a)*radius));}
  p.y=y-.08-f.sink*p.height-radius*Math.hypot(p.leanX,p.leanZ);
 }
 const cells=new Map<string,{e:number;n:number;trees:TreePlacement[];far:Mesh[];detailed:boolean}>();
 const membership=new Map<string,string>();
 for(const p of placements){
  const e=Math.floor(p.e/64)*64,n=Math.floor(p.n/64)*64,key=`${e}:${n}`;
  let cell=cells.get(key);if(!cell){cell={e,n,trees:[],far:[],detailed:false};cells.set(key,cell);}
  cell.trees.push(p);membership.set(p.id,key);
 }
 for(const [key,cell] of cells){
  const groups=new Map<number,{trees:TreePlacement[];family:Family}>();
  for(const p of cell.trees){const f=familyFor(p),g=groups.get(slots.get(p.id)!);if(g)g.trees.push(p);else groups.set(slots.get(p.id)!,{trees:[p],family:f});}
  for(const [fid,group] of groups){
   const matrices=new Float32Array(group.trees.length*16),colors=new Float32Array(group.trees.length*4);
   group.trees.forEach((p,i)=>{matrices.set(matrixOf(p),i*16);colors.set(toneColor(p.id,p.e,p.n),i*4);});
   for(let part=0;part<group.family.parts;part++){
    const g=group.family.geom[2][part]??group.family.geom[group.family.geom.length-1][0];
    const mesh=createMeshFromData(engine,`horizon-${key}-${fid}-${part}`,g.positions,g.normals,g.indices,g.uvs,undefined,undefined,g.colors);
    mesh.material=g.material;mesh.receiveShadows=true;mesh.pickable=false;
    setThinInstances(mesh,matrices,group.trees.length);setThinInstanceColors(mesh,colors);
    addToScene(scene,mesh);cell.far.push(mesh);
   }
  }
 }
 type Pool={mesh:Mesh;matrices:Float32Array;colors:Float32Array;ids:string[];cap:number};
 const pools=new Map<string,Pool>();
 function poolKey(slot:number,level:number,part:number){return `${slot}:${level}:${part}`;}
 function ensurePool(slot:number,level:number,part:number,cap:number){
  const key=poolKey(slot,level,part);let pool=pools.get(key);if(pool)return pool;
  const family=families[slot];
  const g=family.geom[Math.min(level,family.geom.length-1)][part];
  const mesh=createMeshFromData(engine,`near-${key}`,g.positions,g.normals,g.indices,g.uvs,undefined,undefined,g.colors);
  mesh.material=g.material;mesh.receiveShadows=true;mesh.pickable=false;mesh.hasVertexAlpha=true;
  const matrices=new Float32Array(Math.max(1,cap)*16),colors=new Float32Array(Math.max(1,cap)*4);
  setThinInstances(mesh,matrices,Math.max(1,cap));setThinInstanceColors(mesh,colors);setThinInstanceCount(mesh,0);
  addToScene(scene,mesh);
  pool={mesh,matrices,colors,ids:[],cap};pools.set(key,pool);return pool;
 }
 const shadowMat=unlit(createStandardMaterial(),[1,1,1]);shadowMat.name='forest-shadow-only';shadowMat.disableLighting=true;
 const shadowPools=families.map((family,slot)=>({
  entries:[] as {p:TreePlacement;matrix:ReturnType<typeof matrixOf>;color:number[]}[],
  meshes:family.geom[Math.min(1,family.geom.length-1)].map((g,part)=>{
   const mesh=createMeshFromData(engine,`shadow-${slot}-${part}`,g.positions,g.normals,g.indices,g.uvs);
   mesh.material=shadowMat;mesh.receiveShadows=false;mesh.pickable=false;mesh.visible=false;
   const buf=new Float32Array(Math.max(1,familyCounts[slot])*16);
   setThinInstances(mesh,buf,Math.max(1,familyCounts[slot]));setThinInstanceCount(mesh,0);addToScene(scene,mesh);return mesh;
  }),
 }));
 for(const p of placements)shadowPools[slots.get(p.id)!].entries.push({p,matrix:matrixOf(p),color:toneColor(p.id,p.e,p.n)});
 let shadowCell='',shadowMeshes:Mesh[]=[];
 function shadowCasters(feet:Point3){
  const e=Math.floor(feet.x/8)*8+4,n=Math.floor(-feet.z/8)*8+4,key=`${e}:${n}`;
  if(key===shadowCell)return shadowMeshes;
  shadowCell=key;shadowMeshes=[];
  for(const g of shadowPools){
   let count=0;const buf=g.meshes[0].thinInstances!.matrices as Float32Array;
   for(const {p,matrix} of g.entries)if((p.e-e)**2+(p.n-n)**2<56*56){buf.set(matrix,count*16);count++;}
   for(const mesh of g.meshes){setThinInstanceCount(mesh,count);mesh.visible=count>0;if(count)shadowMeshes.push(mesh);}
  }
  return shadowMeshes;
 }
 const activeLevel=new Map<string,number>();
 function cellDistance(p:Point3,c:{e:number;n:number}){return Math.hypot(Math.max(c.e-p.x,0,p.x-c.e-64),Math.max(c.n+p.z,0,-p.z-c.n-64));}
 function refillNear(){
  for(const pool of pools.values())pool.ids.length=0;
  for(const cell of cells.values()){
   if(!cell.detailed)continue;
   for(const p of cell.trees){
    const level=activeLevel.get(p.id)??1,slot=slots.get(p.id)!,family=families[slot];
    for(let part=0;part<family.parts;part++){
     const pool=ensurePool(slot,level,part,familyCounts[slot]);
     const i=pool.ids.length;if(i>=pool.cap)continue;
     pool.ids.push(p.id);pool.matrices.set(matrixOf(p),i*16);pool.colors.set(toneColor(p.id,p.e,p.n),i*4);
    }
   }
  }
  for(const pool of pools.values()){
   setThinInstanceCount(pool.mesh,pool.ids.length);
   if(pool.ids.length)setThinInstanceColors(pool.mesh,pool.colors);
  }
 }
 let lockNear=false;
 function update(camera:Point3,feet:Point3,_dt:number){
  let changed=false;
  for(const cell of cells.values()){
   const d=Math.min(cellDistance(camera,cell),cellDistance(feet,cell)),detailed=d<(cell.detailed?125:110);
   if(detailed!==cell.detailed){changed=true;cell.detailed=detailed;for(const m of cell.far)m.visible=!detailed;}
  }
  const wanted=new Map<string,number>();
  for(const cell of cells.values())if(cell.detailed)for(const p of cell.trees){
   const dist=Math.max(0,Math.min(Math.hypot(camera.x-p.e,camera.z+p.n),Math.hypot(feet.x-p.e,feet.z+p.n))-6*Math.max(p.width,p.depth));
   const prev=activeLevel.get(p.id)??(dist<32?0:1);
   wanted.set(p.id,lockNear?0:treeLevel(dist,prev));
  }
  if(changed||[...wanted].some(([id,l])=>activeLevel.get(id)!==l)||wanted.size!==activeLevel.size){
   activeLevel.clear();for(const [id,l] of wanted)activeLevel.set(id,l);refillNear();
  }
 }
 const lodCounts=()=>[0,1,2].map(l=>{
  if(l===2)return [...cells.values()].filter(c=>!c.detailed).reduce((n,c)=>n+c.trees.length,0);
  return [...activeLevel.values()].filter(v=>v===l).length;
 });
 return {
  shadowCasters,boxes:placements.map(p=>treeCollider(p,familyFor(p).data.trunkRadius)),update,
  stats:()=>({version:FOREST_VERSION,asset:'meshy-a',assetLabel:'Три семейства · процедурные варианты',variety:true,
   families:families.map((f,i)=>({id:f.id,trees:familyCounts[i],triangles:f.data.triangles})),
   colorVariation:true,colorVersion:TREE_TONE_VERSION,trees:placements.length,activeTrees:activeLevel.size,
   trianglesPerLevel:data.triangles,materialsPerTree:data.levels[0].length,lodCounts:lodCounts(),lockNear,transitions:0,
   geometryBuffers:families.reduce((n,f)=>n+f.geom.reduce((a,b)=>a+b.length,0),0)+[...cells.values()].reduce((n,c)=>n+c.far.length,0)}),
  setColorVariation:(_v:boolean)=>{/* instance colours stay; plugin always on */},
  setNearOnly:(v:boolean)=>{lockNear=v;activeLevel.clear();},
  get meshes(){return [...pools.values()].map(p=>p.mesh);},
 };
}

function partGeom(part:TreePart,material:StandardMaterialProps,useVertexColor:boolean):Geom{
 const positions=asF32(part.positions),indices=asU32(part.indices);
 const normals=part.normals?.length?asF32(part.normals):computeNormals(part.positions,part.indices);
 const uvs=part.uvs?.length?asF32(part.uvs):undefined;
 const colors=useVertexColor&&part.colors?.length?asF32(part.colors):undefined;
 return {positions,normals,indices,uvs,colors,material};
}
