import type {MeshData} from '../geometry.ts';
import {treeGeometry} from '../geometry.ts';
import {cameraBasis,lookAt,modelMatrix,multiply,orthographic,perspective} from '../math.ts';
import {coarseMesh,patchMesh,waterMesh,canopyMesh,boxMesh,wolfMesh,ravenMesh} from './geometry.ts';
import {REGION_WGSL} from './shaders.ts';
import type {NativeRegionFrame,NativeRegionSource} from './types.ts';
import {tileKey} from '../../world/math.ts';
import type {TreeRecord} from '../../world/schema.ts';
import {rangerGeometry} from '../geometry.ts';
import rangerUrl from '../../../assets/characters/ranger/runtime.glb?url';
import floorFoliageUrl from '../../../assets/floor/foliage.png';
import {hash01} from '../../domain/geography.mjs';
import {trailIndex} from '../../world/math.ts';
import {createCloudPixels,SKY_TEXTURE_SIZE} from '../../domain/sky-textures.ts';

interface Mesh {vertex:GPUBuffer;index:GPUBuffer;count:number}
interface Material {group:GPUBindGroup;uniform:GPUBuffer;texture?:GPUTexture}
interface Batch {mesh:Mesh;material:Material;instances:GPUBuffer;count:number;capacity:number}
interface TreeFamily {variants:{levels:{mesh:Mesh;material:Material}[][]}[]}
type Patch={positions:Float32Array;normals:Float32Array;uvs:Float32Array;indices:Uint16Array;pixels:Uint8Array};

function buffer(device:GPUDevice,data:Float32Array|Uint32Array,usage:GPUBufferUsageFlags){
 const result=device.createBuffer({size:Math.max(4,(data.byteLength+3)&~3),usage,mappedAtCreation:true});
 if(data instanceof Float32Array)new Float32Array(result.getMappedRange()).set(data);
 else new Uint32Array(result.getMappedRange()).set(data);
 result.unmap();return result;
}
function createMesh(device:GPUDevice,data:MeshData):Mesh {
 return {vertex:buffer(device,data.vertices,GPUBufferUsage.VERTEX),index:buffer(device,data.indices,GPUBufferUsage.INDEX),count:data.indices.length};
}
function instance(e:number,h:number,n:number,yaw=0,sx=1,sy=1,sz=1,tint:[number,number,number]=[1,1,1]){
 const result=new Float32Array(20);result.set(modelMatrix(e,h,-n,yaw,0,0,sx,sy,sz));result.set([...tint,1],16);return result;
}

/** Direct WebGPU drawing for any region with the common world/asset contracts. */
export async function createNativeRegionRenderer(canvas:HTMLCanvasElement,source:NativeRegionSource,onLost:(message:string)=>void){
 if(!navigator.gpu)throw Error('Для этого региона нужен WebGPU и включённое аппаратное ускорение.');
 const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('Не найден адаптер WebGPU.');
 const gpuTimingAvailable=adapter.features.has('timestamp-query');
 const device=await adapter.requestDevice(gpuTimingAvailable?{requiredFeatures:['timestamp-query']}:undefined);
 const context=canvas.getContext('webgpu');if(!context)throw Error('Не удалось открыть холст WebGPU.');
 const gpuContext=context,format=navigator.gpu.getPreferredCanvasFormat();gpuContext.configure({device,format,alphaMode:'opaque',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_DST});
 void device.lost.then(info=>onLost('Устройство WebGPU потеряно: '+(info.message||info.reason)));
 const module=device.createShaderModule({code:REGION_WGSL,label:'region-shared-wgsl'});
 const problems=(await module.getCompilationInfo()).messages.filter(m=>m.type==='error');
 if(problems.length)throw Error('WGSL: '+problems.map(m=>`${m.lineNum}:${m.linePos} ${m.message}`).join('; '));
 const frameBuffer=device.createBuffer({size:416,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 const frameLayout=device.createBindGroupLayout({entries:[
  {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
  {binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
  {binding:2,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}},
  {binding:3,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'depth'}},
  {binding:4,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'comparison'}},
  {binding:5,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
  {binding:6,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}},
  {binding:7,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
  {binding:8,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}},
 ]});
 const shadowFrameLayout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:'uniform'}}]});
 const materialLayout=device.createBindGroupLayout({entries:[
  {binding:0,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
  {binding:1,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}},
  {binding:2,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
 ]});
 const skinLayout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:'read-only-storage'}}]});
 const sampler=device.createSampler({magFilter:'linear',minFilter:'linear',mipmapFilter:'linear',addressModeU:'repeat',addressModeV:'repeat',maxAnisotropy:4});
 const sceneSampler=device.createSampler({magFilter:'linear',minFilter:'linear',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});
 const shadowTexture=device.createTexture({size:[1536,1536],format:'depth32float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
 const shadowView=shadowTexture.createView(),shadowSampler=device.createSampler({compare:'less-equal',magFilter:'linear',minFilter:'linear'});
 const timing=gpuTimingAvailable?{
  queries:device.createQuerySet({type:'timestamp',count:4}),
  resolved:device.createBuffer({size:32,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}),
  readback:device.createBuffer({size:32,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),
 }:undefined;
 const gpuSamples:{total:number;shadow:number;opaque:number;river:number}[]=[];
 let timingPending=false,timingError='',frameNumber=0,samplesSeen=0;
 // Cap the native pixel count before adapting. This protects high-DPI and touch screens.
 const maxPixels=matchMedia('(pointer: coarse)').matches?900_000:1_500_000;
 let pixelScale=1,floorTier=0,lastDrawAt=0;const frameIntervals:number[]=[];
 function setDetailTier(tier:number){if(tier===floorTier)return;floorTier=tier;treeDirty=true;meadowDirty=true;}
 function tuneQuality(){
  const recent=gpuSamples.slice(-30).map(s=>s.total).sort((a,b)=>a-b);
  if(recent.length<30)return;
  const p95=recent[28];
  if(p95>13.5){
   if(pixelScale>.82)pixelScale=Math.max(.82,pixelScale*Math.max(.86,Math.sqrt(12.5/p95)));
   else if(floorTier<2)setDetailTier(floorTier+1);
   else pixelScale=Math.max(.62,pixelScale*Math.max(.86,Math.sqrt(12.5/p95)));
  }else if(p95<10.5){
   if(pixelScale<1)pixelScale=Math.min(1,pixelScale*1.04);
   else if(floorTier>0)setDetailTier(floorTier-1);
  }
 }
 const shadowFrameGroup=device.createBindGroup({layout:shadowFrameLayout,entries:[{binding:0,resource:{buffer:frameBuffer}}]});
 const white=device.createTexture({size:[1,1],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
 device.queue.writeTexture({texture:white},new Uint8Array([255,255,255,255]),{bytesPerRow:4},[1,1]);
 const cloudTexture=device.createTexture({size:[SKY_TEXTURE_SIZE,SKY_TEXTURE_SIZE],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
 device.queue.writeTexture({texture:cloudTexture},createCloudPixels(),{bytesPerRow:SKY_TEXTURE_SIZE*4},[SKY_TEXTURE_SIZE,SKY_TEXTURE_SIZE]);
 const textures=new Map<string,Promise<GPUTexture>>(),ownedTextures=new Set<GPUTexture>([white,cloudTexture]);
 async function imageTexture(blob:Blob){
   const image=await createImageBitmap(blob);
   const result=device.createTexture({size:[image.width,image.height],format:'rgba8unorm-srgb',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
   device.queue.copyExternalImageToTexture({source:image},{texture:result},[image.width,image.height]);image.close();ownedTextures.add(result);return result;
 }
 async function texture(url:string){
  let pending=textures.get(url);if(pending)return pending;
  pending=(async()=>{const response=await fetch(url);if(!response.ok)throw Error(`Текстура ${url}: ${response.status}`);
   return imageTexture(await response.blob());
  })();textures.set(url,pending);return pending;
 }
 const visuals=source.visuals,groundDetail=await texture(visuals.groundTextureUrl);
 const frameEntries=(scene:GPUTexture):GPUBindGroupEntry[]=>[{binding:0,resource:{buffer:frameBuffer}},{binding:1,resource:groundDetail.createView()},{binding:2,resource:sampler},{binding:3,resource:shadowView},{binding:4,resource:shadowSampler},{binding:5,resource:cloudTexture.createView()},{binding:6,resource:sampler},{binding:7,resource:scene.createView()},{binding:8,resource:sceneSampler}];
 const frameGroup=device.createBindGroup({layout:frameLayout,entries:frameEntries(white)});
 const materials:Material[]=[],meshes:Mesh[]=[],batches:Batch[]=[];
 function makeMaterial(tex:GPUTexture,kind:number,alpha=0):Material{
  const uniform=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  device.queue.writeBuffer(uniform,0,new Float32Array([kind,1,alpha,0]));
  const group=device.createBindGroup({layout:materialLayout,entries:[{binding:0,resource:tex.createView()},{binding:1,resource:sampler},{binding:2,resource:{buffer:uniform}}]});
  const material={group,uniform,texture:tex};materials.push(material);return material;
 }
 function mesh(data:MeshData){const made=createMesh(device,data);meshes.push(made);return made;}
 function createBatch(shape:Mesh,material:Material,capacity=1):Batch{
  const batch={mesh:shape,material,instances:device.createBuffer({size:Math.max(80,capacity*80),usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),count:0,capacity};batches.push(batch);return batch;
 }
 function setInstances(batch:Batch,matrices:Float32Array){
  const count=matrices.length/20;if(count>batch.capacity){batch.instances.destroy();batch.capacity=Math.max(count,Math.ceil(batch.capacity*1.5));batch.instances=device.createBuffer({size:batch.capacity*80,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});}
  if(matrices.length)device.queue.writeBuffer(batch.instances,0,matrices);batch.count=count;
 }
 function removePatch(batch:Batch){
  batch.instances.destroy();batch.mesh.vertex.destroy();batch.mesh.index.destroy();batch.material.uniform.destroy();
  const tex=batch.material.texture;if(tex&&tex!==white){tex.destroy();ownedTextures.delete(tex);}
  batches.splice(batches.indexOf(batch),1);meshes.splice(meshes.indexOf(batch.mesh),1);materials.splice(materials.indexOf(batch.material),1);
 }
 const vertexBuffers:GPUVertexBufferLayout[]=[
   {arrayStride:48,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x3'},{shaderLocation:2,offset:24,format:'float32x2'},{shaderLocation:3,offset:32,format:'float32x4'}]},
   {arrayStride:80,stepMode:'instance',attributes:[{shaderLocation:4,offset:0,format:'float32x4'},{shaderLocation:5,offset:16,format:'float32x4'},{shaderLocation:6,offset:32,format:'float32x4'},{shaderLocation:7,offset:48,format:'float32x4'},{shaderLocation:8,offset:64,format:'float32x4'}]},
 ];
 const skinnedVertexBuffers:GPUVertexBufferLayout[]=[
  {arrayStride:64,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x3'},{shaderLocation:2,offset:24,format:'float32x2'},{shaderLocation:9,offset:32,format:'float32x4'},{shaderLocation:10,offset:48,format:'float32x4'}]},
  vertexBuffers[1],
 ];
 const scenePipeline=await device.createRenderPipelineAsync({
  layout:device.createPipelineLayout({bindGroupLayouts:[frameLayout,materialLayout]}),
  vertex:{module,entryPoint:'meshVertex',buffers:vertexBuffers},fragment:{module,entryPoint:'meshFragment',targets:[{format}]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less-equal'},
 });
 const shadowPipeline=await device.createRenderPipelineAsync({layout:device.createPipelineLayout({bindGroupLayouts:[shadowFrameLayout,materialLayout]}),vertex:{module,entryPoint:'shadowVertex',buffers:vertexBuffers},fragment:{module,entryPoint:'shadowFragment',targets:[]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less',depthBias:2,depthBiasSlopeScale:1.5}});
 const skinnedScenePipeline=await device.createRenderPipelineAsync({layout:device.createPipelineLayout({bindGroupLayouts:[frameLayout,materialLayout,skinLayout]}),vertex:{module,entryPoint:'skinnedVertex',buffers:skinnedVertexBuffers},fragment:{module,entryPoint:'meshFragment',targets:[{format}]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less-equal'}});
 const skinnedShadowPipeline=await device.createRenderPipelineAsync({layout:device.createPipelineLayout({bindGroupLayouts:[shadowFrameLayout,materialLayout,skinLayout]}),vertex:{module,entryPoint:'skinnedShadowVertex',buffers:skinnedVertexBuffers},fragment:{module,entryPoint:'shadowFragment',targets:[]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less',depthBias:2,depthBiasSlopeScale:1.5}});
 const skyPipeline=await device.createRenderPipelineAsync({layout:device.createPipelineLayout({bindGroupLayouts:[frameLayout]}),vertex:{module,entryPoint:'skyVertex'},fragment:{module,entryPoint:'skyFragment',targets:[{format}]},primitive:{topology:'triangle-list'},depthStencil:{format:'depth32float',depthWriteEnabled:false,depthCompare:'always'}});
 let depth:GPUTexture|undefined,opaqueScene:GPUTexture|undefined,waterFrameGroup:GPUBindGroup|undefined,width=0,height=0,origin={e:0,n:0};
 function resize(){
  const cssW=Math.max(1,canvas.clientWidth),cssH=Math.max(1,canvas.clientHeight);
  const dpr=Math.min(devicePixelRatio,Math.sqrt(maxPixels/(cssW*cssH)))*pixelScale;
  const w=Math.max(1,Math.min(2560,Math.floor(cssW*dpr))),h=Math.max(1,Math.min(1600,Math.floor(cssH*dpr)));
  if(w===width&&h===height)return;width=w;height=h;canvas.width=w;canvas.height=h;depth?.destroy();opaqueScene?.destroy();
  depth=device.createTexture({size:[w,h],format:'depth32float',usage:GPUTextureUsage.RENDER_ATTACHMENT});
  opaqueScene=device.createTexture({size:[w,h],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC});
  waterFrameGroup=device.createBindGroup({layout:frameLayout,entries:frameEntries(opaqueScene)});
 }
 const coarseMaterial=makeMaterial(white,.2),waterMaterial=makeMaterial(white,3);
 const floorGrassMaterial=makeMaterial(white,5),floorLeavesMaterial=makeMaterial(await texture(floorFoliageUrl),6,.45);
 const far=mesh(coarseMesh(source.data.coarse,source.data.geography.zones)),farBatch=createBatch(far,coarseMaterial);
 setInstances(farBatch,instance(source.data.coarse.origin[0],0,source.data.coarse.origin[1]));
 let canopyReady=false;
 void source.data.call('region-canopy',{}).then((geometry:{positions:Float32Array;colors:Float32Array;indices:Uint32Array})=>{
  const batch=createBatch(mesh(canopyMesh(geometry)),makeMaterial(white,4));setInstances(batch,instance(0,0,0));canopyReady=true;
 }).catch(error=>console.warn('Regional distant canopy',error));
 const cube=mesh(boxMesh());
 const clueBatch=createBatch(cube,makeMaterial(white,2.2),4),weaponBatch=createBatch(cube,makeMaterial(white,2.2),12);
 const wolfBatch=createBatch(mesh(wolfMesh()),makeMaterial(white,2.2),4),ravenBatch=createBatch(mesh(ravenMesh()),makeMaterial(white,7.2),4);
 const ranger=await rangerGeometry(rangerUrl),actorMesh=mesh(ranger.mesh),actorMaterial=makeMaterial(await imageTexture(ranger.image),2.2);
 const actorModes=['idle','walk','run'] as const;
 const skinnedActors=actorModes.map(mode=>{
  const skin=device.createBuffer({size:ranger.jointCount*64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  const group=device.createBindGroup({layout:skinLayout,entries:[{binding:0,resource:{buffer:skin}}]});
  const batch:Batch={mesh:actorMesh,material:actorMaterial,instances:device.createBuffer({size:8*80,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),count:0,capacity:8};
  return {mode,skin,group,batch};
 });
 const boxColors:{[key:string]:[number,number,number]}={stone:[.48,.44,.36],hedge:[.24,.37,.18],wood:[.37,.25,.17],wall:[.72,.64,.46]};
 const boxBatches=Object.fromEntries(Object.keys(boxColors).map(kind=>[kind,createBatch(cube,makeMaterial(white,2),128)])) as Record<string,Batch>;
 const patchBatches=new Map<string,Batch>(),patchPending=new Set<string>();let patchFailures=0;
 const floorChunks=new Map<string,Batch[]>();let floorQueue:{e:number;n:number;id:string}[]=[],floorPending=false,floorKey='',floorFailures=0,floorWater=NaN,floorVersion=0;
 const activeFloorRange=()=>visuals.fineFloorM*(floorTier===0?1:floorTier===1?.78:.58);
 const activeNearTreeRange=()=>visuals.nearTreesM*(floorTier===0?1:floorTier===1?.82:.68);
 const activeMidTreeRange=()=>visuals.midTreesM*(floorTier===0?1:floorTier===1?.85:.7);
 function removeFloorChunk(chunks:Batch[]){for(const batch of chunks){batch.instances.destroy();batch.mesh.vertex.destroy();batch.mesh.index.destroy();batches.splice(batches.indexOf(batch),1);meshes.splice(meshes.indexOf(batch.mesh),1);}}
 function updateFineFloor(frame:NativeRegionFrame){
  const p=frame.player,e=Math.floor(p.e/32)*32,n=Math.floor(p.n/32)*32;
  const floorRange=activeFloorRange();
  const key=`${e},${n},${frame.waterOffsetM},${floorTier}`;
  if(floorWater!==frame.waterOffsetM){floorWater=frame.waterOffsetM;floorVersion++;floorKey='';for(const chunks of floorChunks.values())removeFloorChunk(chunks);floorChunks.clear();}
  if(key!==floorKey){
   floorKey=key;const wanted=new Set<string>();floorQueue=[];
   const radius=Math.ceil(floorRange/32);
   for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++){
    const E=e+x*32,N=n+y*32,id=`${E},${N}`;
    if(Math.hypot(E+16-p.e,N+16-p.n)>floorRange+23)continue;
    wanted.add(id);if(!floorChunks.has(id))floorQueue.push({e:E,n:N,id});
   }
   floorQueue.sort((a,b)=>Math.hypot(a.e+16-p.e,a.n+16-p.n)-Math.hypot(b.e+16-p.e,b.n+16-p.n));
   for(const [id,chunks]of floorChunks)if(!wanted.has(id)){removeFloorChunk(chunks);floorChunks.delete(id);}
  }
  while(floorQueue.length&&floorChunks.has(floorQueue[0].id))floorQueue.shift();
  if(floorPending||!floorQueue.length)return;
  const next=floorQueue.shift()!,version=floorVersion,requestedTier=floorTier;floorPending=true;
  void source.data.call('region-floor',{e:next.e,n:next.n,water:frame.waterOffsetM>0?'high':frame.waterOffsetM<0?'low':'normal'},[],1)
   .then((parts:{grass:MeshData;leaves:MeshData})=>{
    const margin=requestedTier===floorTier?55:23;
    if(version!==floorVersion||Math.hypot(next.e+16-frame.player.e,next.n+16-frame.player.n)>activeFloorRange()+margin)return;
    const chunks:Batch[]=[];
    for(const [kind,data]of Object.entries(parts) as [keyof typeof parts,MeshData][]){if(!data.indices.length)continue;
     const batch=createBatch(mesh(data),kind==='grass'?floorGrassMaterial:floorLeavesMaterial);
     setInstances(batch,instance(next.e,0,next.n));chunks.push(batch);
    }
    floorChunks.set(next.id,chunks);
   }).catch(error=>{floorFailures++;console.warn('Regional fine floor',next.id,error);}).finally(()=>{floorPending=false;});
 }
 async function requestPatch(e:number,n:number){
  const pe=Math.floor(e/128)*128,pn=Math.floor(n/128)*128,id=tileKey(e,n,128);
  if(patchBatches.has(id)||patchPending.has(id)||!source.data.manifest.tiles[tileKey(e,n)])return;
  patchPending.add(id);
  try{
   const tile=await source.data.load(tileKey(e,n));treeDirty=true;const patch=await source.data.call('patch',{e:pe,n:pn,grid:tile.grid}) as Patch;
   const tex=device.createTexture({size:[128,128],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
   device.queue.writeTexture({texture:tex},patch.pixels,{bytesPerRow:512},[128,128]);ownedTextures.add(tex);
   const batch=createBatch(mesh(patchMesh(patch)),makeMaterial(tex,0));setInstances(batch,instance(pe,.035,pn));patchBatches.set(id,batch);
  }catch(error){patchFailures++;console.warn('Regional patch',id,error);}finally{patchPending.delete(id);}
 }
 const waterBatches:{e:number;n:number;batch:Batch}[]=[];
 void source.data.json('water.json.pack').then((records:any[])=>{
  for(const record of records){const batch=createBatch(mesh(waterMesh(record)),waterMaterial);setInstances(batch,instance(record.e,0,record.n));waterBatches.push({e:record.e,n:record.n,batch});}
 }).catch(error=>console.warn('Regional water',error));
 let library:Record<string,{data:string;texture:string}>={};
 const families=new Map<number,TreeFamily>();const treeBatches=new Map<string,Batch>();let treeFailures=0;
 const familyIds=['oak','fork','young','conifer','willow'];
 void fetch(source.treeLibraryUrl).then(r=>{if(!r.ok)throw Error(String(r.status));return r.json();}).then(async index=>{
  library=index;
  for(let family=0;family<familyIds.length;family++){
   const spec=library[familyIds[family]];if(!spec)continue;
   try{
    const [data,albedo]=await Promise.all([source.data.json(spec.data,'world/'),texture(new URL(spec.texture,source.treeLibraryUrl).href)]);
    const variants=(data.variants??[data]).map((item:any)=>({levels:item.levels.map((parts:any[],level:number)=>{
     const material=makeMaterial(level>=(item.bakedColorFromLevel??Infinity)?white:albedo,1);
     return parts.map(part=>({mesh:mesh(treeGeometry(part)),material}));
    })}));
    families.set(family,{variants});treeDirty=true;farTreeDirty=true;
   }catch(error){treeFailures++;console.warn('Regional tree',familyIds[family],error);}
  }
 }).catch(error=>console.warn('Tree library',error));
 let trees:TreeRecord[]=[],treeDirty=true,lastTreeE=Infinity,lastTreeN=Infinity,lastFacingE=0,lastFacingN=0,visibleTrees=0,treeLods=[0,0,0];
 function updateTrees(frame:NativeRegionFrame){
  const player=frame.player,forwardE=frame.target[0]-frame.eye[0],forwardN=frame.eye[2]-frame.target[2];
  const forwardLength=Math.hypot(forwardE,forwardN)||1,dirE=forwardE/forwardLength,dirN=forwardN/forwardLength;
  if(!treeDirty&&Math.hypot(player.e-lastTreeE,player.n-lastTreeN)<8&&dirE*lastFacingE+dirN*lastFacingN>.985)return;
  treeDirty=false;lastTreeE=player.e;lastTreeN=player.n;lastFacingE=dirE;lastFacingN=dirN;
  trees=[...source.data.tiles.values()].flatMap(tile=>tile.trees);
  const groups=new Map<string,number[]>(),cosLimit=Math.cos(Math.min(Math.PI/2,Math.atan(Math.tan(Math.PI/6)*width/height)+.35));
  visibleTrees=0;treeLods=[0,0,0];
  for(const tree of trees){const distance=Math.hypot(tree.e-player.e,tree.n-player.n);if(distance>visuals.farTreesM)continue;
   if(distance>activeNearTreeRange()){const e=tree.e-frame.eye[0],n=tree.n+frame.eye[2],len=Math.hypot(e,n)||1;if((e*dirE+n*dirN)/len<cosLimit)continue;}
   const family=families.get(tree.family);if(!family)continue;
   visibleTrees++;
   const variant=tree.variant%family.variants.length,level=distance<activeNearTreeRange()?0:distance<activeMidTreeRange()?1:2,key=`${tree.family}:${variant}:${level}`;
   treeLods[level]++;
   const values=groups.get(key)??[];values.push(...instance(tree.e,tree.h,tree.n,tree.yaw,tree.scale*tree.width,tree.scale,tree.scale*tree.width));groups.set(key,values);
  }
  for(const batch of treeBatches.values())batch.count=0;
  for(const [key,values]of groups){const [familyId,variantId,levelId]=key.split(':').map(Number),parts=families.get(familyId)!.variants[variantId].levels[Math.min(levelId,families.get(familyId)!.variants[variantId].levels.length-1)];
   parts.forEach(({mesh:shape,material},part)=>{const partKey=key+':'+part;let batch=treeBatches.get(partKey);if(!batch){batch=createBatch(shape,material,values.length/20);treeBatches.set(partKey,batch);}setInstances(batch,new Float32Array(values));});
  }
 }
 const farTreeBatches=new Map<string,Batch>();let farTreeDirty=true,lastGroveKey='',groveGeneration=0,farTreeCount=0;
 function updateGroves(player:{e:number;n:number}){
  const key=tileKey(player.e,player.n,128);if(key===lastGroveKey&&!farTreeDirty)return;
  lastGroveKey=key;farTreeDirty=false;const generation=++groveGeneration;
  void source.data.call('region-groves',{p:player,origin:{e:0,n:0}}).then((groups:Record<string,Float32Array>)=>{
   if(generation!==groveGeneration)return;for(const batch of farTreeBatches.values())batch.count=0;farTreeCount=0;
   for(const [id,matrixData]of Object.entries(groups)){
    const [familyId,variantId]=id.split('/').map(Number),family=families.get(familyId);if(!family)continue;
    const variant=family.variants[variantId%family.variants.length],level=variant.levels[Math.min(2,variant.levels.length-1)];
    const values=new Float32Array(matrixData.length/16*20);for(let i=0;i<matrixData.length/16;i++){values.set(matrixData.subarray(i*16,i*16+16),i*20);values.set([1,1,1,1],i*20+16);}
    farTreeCount+=matrixData.length/16;
    level.forEach(({mesh:shape,material},part)=>{const partKey=id+':'+part;let batch=farTreeBatches.get(partKey);
     if(!batch){batch=createBatch(shape,material,values.length/20);farTreeBatches.set(partKey,batch);}setInstances(batch,values);
    });
   }
  }).catch(error=>console.warn('Regional far groves',error));
 }
 const assetBatches=new Map<string,Batch>(),assetFamilies=new Map<string,{levels:{mesh:Mesh;material:Material}[][]}>(),assetPending=new Set<string>();
 let assetIndex:Record<string,{data:string}>={},assetFailures=0;
 void fetch(import.meta.env.BASE_URL+source.regionalAssetBase+'index.json').then(r=>{if(!r.ok)throw Error(String(r.status));return r.json();}).then(index=>{assetIndex=index;for(const id of ['grass-short','grass-tall','flowers-cream','flowers-blue','fern','hazel','dogrose','rowboat'])void loadAsset(id);}).catch(error=>console.warn('Regional asset index',error));
 async function loadAsset(id:string){
  if(assetFamilies.has(id)||assetPending.has(id)||!assetIndex[id])return;assetPending.add(id);
  try{const data=await source.data.json(assetIndex[id].data,source.regionalAssetBase);
   const mats=await Promise.all(data.materials.map(async(m:any)=>makeMaterial(m.texture?await texture(new URL(m.texture,location.origin+import.meta.env.BASE_URL+source.regionalAssetBase).href):white,id==='rowboat'?2.2:2,m.alpha?.4:0)));
   assetFamilies.set(id,{levels:data.levels.map((parts:any[])=>parts.map(part=>({mesh:mesh(treeGeometry(part)),material:mats[part.material]})))});
   structureDirty=true;meadowDirty=true;
  }catch(error){assetFailures++;console.warn('Regional model',id,error);}finally{assetPending.delete(id);}
 }
 let structureDirty=true,lastStructureE=Infinity,lastStructureN=Infinity,lastGate=false;
 function updateStructures(frame:NativeRegionFrame){
  const p=frame.player;if(!structureDirty&&lastGate===frame.gateOpen&&Math.hypot(p.e-lastStructureE,p.n-lastStructureN)<12)return;
  structureDirty=false;lastGate=frame.gateOpen;lastStructureE=p.e;lastStructureN=p.n;
  const wanted=source.layout.placements.filter(item=>Math.hypot(item.e-p.e,item.n-p.n)<visuals.structureM&&!(item.gate&&frame.gateOpen));
  for(const id of new Set(wanted.map(item=>item.asset)))void loadAsset(id);
  const replaced=new Set(wanted.filter(item=>assetFamilies.has(item.asset)).flatMap(item=>item.replace??[]));
  for(const [kind,batch]of Object.entries(boxBatches)){
   const values:number[]=[];
   for(const item of source.layout.boxes)if(item.material===kind&&!replaced.has(item.id)&&!(item.id==='north-gate'&&frame.gateOpen)&&Math.hypot(item.e-p.e,item.n-p.n)<visuals.structureM){values.push(...instance(item.e,item.y,item.n,item.yaw,item.width,item.height,item.depth,boxColors[kind]));}
   setInstances(batch,new Float32Array(values));
  }
  for(const batch of assetBatches.values())batch.count=0;
  const groups=new Map<string,number[]>();
  for(const item of wanted){const family=assetFamilies.get(item.asset);if(!family)continue;const d=Math.hypot(item.e-p.e,item.n-p.n),lod=Math.min(family.levels.length-1,d<95?0:d<300?1:2),key=`${item.asset}:${lod}`;
   const values=groups.get(key)??[];values.push(...instance(item.e,item.y,item.n,item.yaw??0,...(item.scale??[1,1,1])));groups.set(key,values);
  }
  for(const [key,values]of groups){const at=key.lastIndexOf(':'),asset=key.slice(0,at),lod=Number(key.slice(at+1));assetFamilies.get(asset)!.levels[lod].forEach(({mesh:shape,material},part)=>{
   const partKey=key+':'+part;let batch=assetBatches.get(partKey);if(!batch){batch=createBatch(shape,material,values.length/20);assetBatches.set(partKey,batch);}setInstances(batch,new Float32Array(values));
  });}
 }
 const boatBatches=new Map<string,Batch>();
 function updateBoats(frame:NativeRegionFrame){
  for(const batch of boatBatches.values())batch.count=0;
  const family=assetFamilies.get('rowboat');if(!family)return;
  const groups=new Map<number,number[]>(),water=frame.waterOffsetM>0?'high':frame.waterOffsetM<0?'low':'normal';
  for(const boat of frame.boats){
   const distance=Math.hypot(boat.e-frame.player.e,boat.n-frame.player.n);if(distance>500)continue;
   const level=source.data.geo.waterAt(boat.e,boat.n,water)?.level??0,lod=Math.min(family.levels.length-1,distance<50?0:distance<150?1:2);
   const values=groups.get(lod)??[];values.push(...instance(boat.e,level-.17,boat.n,-boat.heading*Math.PI/180));groups.set(lod,values);
  }
  for(const [lod,values]of groups)family.levels[lod].forEach(({mesh:shape,material},part)=>{
   const id=`${lod}:${part}`;let batch=boatBatches.get(id);
   if(!batch){batch=createBatch(shape,material,2);boatBatches.set(id,batch);}
   setInstances(batch,new Float32Array(values));
  });
 }
 const trailAt=trailIndex(source.data.trails),meadowBatches=new Map<string,Batch>();
 let meadowDirty=true,lastMeadowE=Infinity,lastMeadowN=Infinity;
 function updateMeadow(frame:NativeRegionFrame){
  const p=frame.player;if(!meadowDirty&&Math.hypot(p.e-lastMeadowE,p.n-lastMeadowN)<16)return;
  meadowDirty=false;lastMeadowE=p.e;lastMeadowN=p.n;
  const groups=new Map<string,number[]>(),geo=source.data.geo;
  const centerE=Math.floor(p.e/32)*32,centerN=Math.floor(p.n/32)*32;
  for(let cy=-5;cy<=5;cy++)for(let cx=-5;cx<=5;cx++){
   const e=centerE+cx*32,n=centerN+cy*32;if(Math.hypot(e+16-p.e,n+16-p.n)>190)continue;
   for(let i=0;i<42;i++){
   const E=e+hash01(e,n,i+1101)*32,N=n+hash01(e,n,i+1301)*32;
    const distance=Math.hypot(E-p.e,N-p.n);
    if(distance>175||geo.coverExclusion(E,N)||trailAt(E,N).distance<2.2||(geo.waterAt(E,N,frame.waterOffsetM>0?'high':'normal')?.depth??0)>.01)continue;
    const forest=geo.forestAt(E,N);if(forest&&hash01(e,n,i+1401)>.34)continue;
    const r=hash01(e,n,i+1501),species=forest?(r<.65?'fern':r<.88?'hazel':'grass-short'):r<.65?'grass-short':r<.85?'grass-tall':r<.925?'flowers-cream':r<.97?'flowers-blue':'dogrose';
    const shrub=species==='hazel'||species==='dogrose';if(!shrub&&distance>(floorTier===0?100:floorTier===1?82:68))continue;
    if(!assetFamilies.has(species))continue;
    const height=geo.surfaceHeight(E,N),scale=.7+hash01(e,n,i+1701)*.6;
    if(Math.abs(geo.surfaceHeight(E+1,N)-height)>.65)continue;
    const lod=shrub?distance<45?0:distance<100?1:2:0,key=`${species}:${lod}`;
    const values=groups.get(key)??[];values.push(...instance(E,height-.035,N,hash01(e,n,i+1801)*Math.PI*2,scale,scale,scale));groups.set(key,values);
   }
  }
  for(const batch of meadowBatches.values())batch.count=0;
  for(const [group,values]of groups){const [species,lodText]=group.split(':'),family=assetFamilies.get(species)!;
   for(const [part,{mesh:shape,material}]of family.levels[Math.min(Number(lodText),family.levels.length-1)].entries()){
    const key=group+':'+part;let batch=meadowBatches.get(key);
    if(!batch){batch=createBatch(shape,material,values.length/20);meadowBatches.set(key,batch);}
    setInstances(batch,new Float32Array(values));
   }
  }
 }
 function updateNearTerrain(p:{e:number;n:number}){
  const radius=Math.ceil(visuals.nearTerrainM/128),centerE=Math.floor(p.e/128)*128,centerN=Math.floor(p.n/128)*128;
  for(let n=-radius;n<=radius;n++)for(let e=-radius;e<=radius;e++)if(Math.hypot(e*128,n*128)<visuals.nearTerrainM+128)void requestPatch(centerE+e*128,centerN+n*128);
  for(const [id,batch]of patchBatches){const [e,n]=id.split(',').map(Number);batch.count=Math.hypot(e*128+64-p.e,n*128+64-p.n)<visuals.nearTerrainM+170?1:0;}
  for(const [id,batch]of patchBatches){const [e,n]=id.split(',').map(Number);if(Math.hypot(e*128+64-p.e,n*128+64-p.n)>visuals.nearTerrainM+550){removePatch(batch);patchBatches.delete(id);}}
  source.data.evict(p,undefined);
  for(const item of waterBatches)item.batch.count=Math.hypot(item.e+64-p.e,item.n+64-p.n)<visuals.structureM?1:0;
 }
 function updateActors(frame:NativeRegionFrame){
  const people=[[] as number[],[] as number[],[] as number[]],clues:number[]=[],wolves:number[]=[],ravens:number[]=[];
  const tint:{[K in NativeRegionFrame['actors'][number]['kind']]:[number,number,number]}={
   hero:[1,1,1],southerner:[.65,.55,.45],goblin:[.47,.64,.35],orc:[.41,.47,.38],wolf:[.50,.47,.38],raven:[.12,.14,.16],clue:[.68,.54,.32],
  };
  for(const actor of frame.actors){if(!actor.visible)continue;const s=actor.kind==='goblin'?.72:actor.kind==='orc'?1.22:actor.kind==='wolf'?.72:actor.kind==='raven'?.35:actor.kind==='clue'?.27:1;
   const values=instance(actor.e,actor.h,actor.n,actor.yaw,s,s,s,tint[actor.kind]);
   if(actor.kind==='clue')clues.push(...values);else if(actor.kind==='wolf')wolves.push(...values);else if(actor.kind==='raven')ravens.push(...values);else people[actor.speed<.1?0:actor.speed<4?1:2].push(...values);
  }
  for(const [index,actor]of skinnedActors.entries()){
   setInstances(actor.batch,new Float32Array(people[index]));
   if(actor.batch.count)device.queue.writeBuffer(actor.skin,0,ranger.pose(frame.time,index===0?0:index===1?1.8:5));
  }
  setInstances(clueBatch,new Float32Array(clues));
  setInstances(wolfBatch,new Float32Array(wolves));setInstances(ravenBatch,new Float32Array(ravens));
  const hero=frame.actors.find(a=>a.kind==='hero');if(!hero){weaponBatch.count=0;return;}
  const weapon:number[]=[],add=(x:number,y:number,z:number,w:number,ht:number,d:number,color:[number,number,number],angle=0)=>{
   const c=Math.cos(hero.yaw),s=Math.sin(hero.yaw),e=hero.e+c*x+s*z,n=hero.n+s*x-c*z;
   const matrix=modelMatrix(e,hero.h+y,-n,hero.yaw,0,angle,w,ht,d);weapon.push(...matrix,...color,1);
  };
  if(frame.weapon==='bow'){
   const points=Array.from({length:9},(_,i)=>({x:.55+.23*Math.sin(i/8*Math.PI),y:.54+i*.145}));
   for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y;add((a.x+b.x)/2,(a.y+b.y)/2,-.24,.045,Math.hypot(dx,dy)+.015,.045,[.34,.19,.09],-Math.atan2(dx,dy));}
   add(.55,1.12,-.24,.012,1.18,.012,[.82,.70,.47]);
  }else{
   add(.55,1.15,-.25,.075,.75,.024,[.64,.74,.76]);add(.55,.76,-.25,.29,.045,.075,[.55,.60,.57]);add(.55,.57,-.25,.065,.32,.065,[.33,.20,.10]);
  }
  setInstances(weaponBatch,new Float32Array(weapon));
 }
 let lastTerrainE=Infinity,lastTerrainN=Infinity,drawCalls=0;
 let lastWake:{id:string;e:number;n:number;time:number}|undefined;
 function draw(frame:NativeRegionFrame){
  if(!timing&&frame.active){
   const now=performance.now();if(lastDrawAt){frameIntervals.push(now-lastDrawAt);if(frameIntervals.length===120){
    const missed=frameIntervals.filter(ms=>ms>20).length;
    if(missed>12){if(pixelScale>.82)pixelScale=Math.max(.82,pixelScale*.9);else if(floorTier<2)setDetailTier(floorTier+1);else pixelScale=Math.max(.62,pixelScale*.9);}
    else if(missed<4){if(pixelScale<1)pixelScale=Math.min(1,pixelScale*1.04);else if(floorTier>0)setDetailTier(floorTier-1);}
    frameIntervals.length=0;
   }}lastDrawAt=now;
  }else if(!frame.active)lastDrawAt=0;
  resize();origin={e:Math.round(frame.player.e/1024)*1024,n:Math.round(frame.player.n/1024)*1024};
  if(Math.hypot(frame.player.e-lastTerrainE,frame.player.n-lastTerrainN)>48){lastTerrainE=frame.player.e;lastTerrainN=frame.player.n;updateNearTerrain(frame.player);}
  updateTrees(frame);updateGroves(frame.player);updateStructures(frame);updateBoats(frame);updateMeadow(frame);updateFineFloor(frame);updateActors(frame);
  const eye:[number,number,number]=[frame.eye[0]-origin.e,frame.eye[1],frame.eye[2]+origin.n];
  const target:[number,number,number]=[frame.target[0]-origin.e,frame.target[1],frame.target[2]+origin.n];
  const matrix=multiply(perspective(Math.PI/3,width/height,.12,visuals.fogDistanceM*2),lookAt(eye,target));
  const values=new Float32Array(104);values.set(matrix);
  const chunks=[...visuals.sunDirection,0,...eye,0,...visuals.sun,0,...visuals.ambient,0,...visuals.fog,visuals.fogDistanceM,...visuals.skyZenith,0,...visuals.skyHorizon,0,...visuals.waterShallow,0,...visuals.waterDeep,0,...visuals.terrainTint,0,...visuals.foliageTint,0,frame.time,origin.e,origin.n,frame.waterOffsetM];
  values.set(chunks,16);
  const sun=visuals.sunDirection,sunLength=Math.hypot(...sun)||1,center:[number,number,number]=[frame.player.e-origin.e,source.data.height(frame.player.e,frame.player.n)+2,origin.n-frame.player.n];
  const lightEye:[number,number,number]=[center[0]+sun[0]/sunLength*100,center[1]+sun[1]/sunLength*100,center[2]+sun[2]/sunLength*100];
  values.set(multiply(orthographic(78,1,250),lookAt(lightEye,center)),64);
  const basis=cameraBasis(eye,target),tanFov=Math.tan(Math.PI/6);
  values.set([...basis.right,tanFov*width/height,...basis.up,tanFov,...basis.forward,visuals.cloudCoverage],80);
  const hero=frame.actors.find(actor=>actor.kind==='hero');
  values.set([frame.player.e-origin.e,hero?.h??source.data.height(frame.player.e,frame.player.n),origin.n-frame.player.n,visuals.windStrength],92);
  values.set([...visuals.riverFlowXZ,visuals.riverClarityM,visuals.riverRippleStrength],96);
  const movingBoat=frame.boats.find(boat=>boat.occupied);
  if(movingBoat){
   const elapsed=frame.time-(lastWake?.time??frame.time);
   const speed=lastWake?.id===movingBoat.id&&elapsed>.001?Math.min(4,Math.hypot(movingBoat.e-lastWake.e,movingBoat.n-lastWake.n)/elapsed):0;
   values.set([movingBoat.e-origin.e,origin.n-movingBoat.n,movingBoat.heading*Math.PI/180,speed],100);
   lastWake={id:movingBoat.id,e:movingBoat.e,n:movingBoat.n,time:frame.time};
  }else lastWake=undefined;
  device.queue.writeBuffer(frameBuffer,0,values);
  const encoder=device.createCommandEncoder();
  const measure=!!timing&&frame.active&&!timingPending&&frameNumber++%12===0;
  if(measure)timingPending=true;
  const shadowPass=encoder.beginRenderPass({colorAttachments:[],depthStencilAttachment:{view:shadowView,depthLoadOp:'clear',depthStoreOp:'store',depthClearValue:1},...(measure?{timestampWrites:{querySet:timing!.queries,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}}:{})});
  shadowPass.setPipeline(shadowPipeline);shadowPass.setBindGroup(0,shadowFrameGroup);
  const castShadow=(batch:Batch)=>{
   if(!batch.count)return;
   shadowPass.setBindGroup(1,batch.material.group);shadowPass.setVertexBuffer(0,batch.mesh.vertex);shadowPass.setVertexBuffer(1,batch.instances);shadowPass.setIndexBuffer(batch.mesh.index,'uint32');shadowPass.drawIndexed(batch.mesh.count,batch.count);
  };
  // The light frustum covers 78 m. Distant LODs cannot contribute to it.
  for(const [key,batch]of treeBatches)if(key.split(':')[2]==='0')castShadow(batch);
  for(const [key,batch]of assetBatches)if(key.split(':')[1]==='0')castShadow(batch);
  for(const batch of [...boatBatches.values(),...Object.values(boxBatches),wolfBatch,ravenBatch,weaponBatch])castShadow(batch);
  shadowPass.setPipeline(skinnedShadowPipeline);
  for(const actor of skinnedActors){const batch=actor.batch;if(!batch.count)continue;shadowPass.setBindGroup(1,batch.material.group);shadowPass.setBindGroup(2,actor.group);shadowPass.setVertexBuffer(0,batch.mesh.vertex);shadowPass.setVertexBuffer(1,batch.instances);shadowPass.setIndexBuffer(batch.mesh.index,'uint32');shadowPass.drawIndexed(batch.mesh.count,batch.count);}
  shadowPass.end();
  const canvasTexture=gpuContext.getCurrentTexture();
  const pass=encoder.beginRenderPass({
   colorAttachments:[{view:opaqueScene!.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:.3,g:.4,b:.4,a:1}}],
   depthStencilAttachment:{view:depth!.createView(),depthLoadOp:'clear',depthStoreOp:'store',depthClearValue:1},
   ...(measure?{timestampWrites:{querySet:timing!.queries,endOfPassWriteIndex:2}}:{}),
  });
  pass.setPipeline(skyPipeline);pass.setBindGroup(0,frameGroup);pass.draw(3);
  pass.setPipeline(scenePipeline);pass.setBindGroup(0,frameGroup);drawCalls=0;
  for(const batch of batches){if(!batch.count||batch.material===waterMaterial)continue;pass.setBindGroup(1,batch.material.group);pass.setVertexBuffer(0,batch.mesh.vertex);pass.setVertexBuffer(1,batch.instances);pass.setIndexBuffer(batch.mesh.index,'uint32');pass.drawIndexed(batch.mesh.count,batch.count);drawCalls++;}
  pass.setPipeline(skinnedScenePipeline);
  for(const actor of skinnedActors){const batch=actor.batch;if(!batch.count)continue;pass.setBindGroup(1,batch.material.group);pass.setBindGroup(2,actor.group);pass.setVertexBuffer(0,batch.mesh.vertex);pass.setVertexBuffer(1,batch.instances);pass.setIndexBuffer(batch.mesh.index,'uint32');pass.drawIndexed(batch.mesh.count,batch.count);drawCalls++;}
  pass.end();
  encoder.copyTextureToTexture({texture:opaqueScene!},{texture:canvasTexture},[width,height]);
  const riverPass=encoder.beginRenderPass({
   colorAttachments:[{view:canvasTexture.createView(),loadOp:'load',storeOp:'store'}],
   depthStencilAttachment:{view:depth!.createView(),depthLoadOp:'load',depthStoreOp:'store'},
   ...(measure?{timestampWrites:{querySet:timing!.queries,endOfPassWriteIndex:3}}:{}),
  });
  riverPass.setPipeline(scenePipeline);riverPass.setBindGroup(0,waterFrameGroup!);
  for(const {batch} of waterBatches){if(!batch.count)continue;riverPass.setBindGroup(1,batch.material.group);riverPass.setVertexBuffer(0,batch.mesh.vertex);riverPass.setVertexBuffer(1,batch.instances);riverPass.setIndexBuffer(batch.mesh.index,'uint32');riverPass.drawIndexed(batch.mesh.count,batch.count);drawCalls++;}
  riverPass.end();
  if(measure){
   encoder.resolveQuerySet(timing!.queries,0,4,timing!.resolved,0);
   encoder.copyBufferToBuffer(timing!.resolved,0,timing!.readback,0,32);
  }
  device.queue.submit([encoder.finish()]);
  if(measure)void timing!.readback.mapAsync(GPUMapMode.READ).then(()=>{
   const stamps=new BigUint64Array(timing!.readback.getMappedRange());
   const ms=(a:number,b:number)=>Number(stamps[b]-stamps[a])/1e6;
   const sample={total:ms(0,3),shadow:ms(0,1),opaque:ms(1,2),river:ms(2,3)};
   timing!.readback.unmap();if(Number.isFinite(sample.total)&&sample.total>=0&&sample.total<1000){gpuSamples.push(sample);if(gpuSamples.length>120)gpuSamples.shift();if(++samplesSeen%30===0)tuneQuality();}
  }).catch(error=>{timingError=String(error);}).finally(()=>{timingPending=false;});
 }
 function dispose(){depth?.destroy();opaqueScene?.destroy();shadowTexture.destroy();frameBuffer.destroy();timing?.queries.destroy();timing?.resolved.destroy();timing?.readback.destroy();for(const batch of batches)batch.instances.destroy();for(const actor of skinnedActors){actor.batch.instances.destroy();actor.skin.destroy();}for(const item of meshes){item.vertex.destroy();item.index.destroy();}for(const item of materials)item.uniform.destroy();for(const item of ownedTextures)item.destroy();source.data.dispose();}
 await requestPatch(source.entry.e,source.entry.n);
  return {draw,dispose,stats:()=>{const percentile=(key:keyof typeof gpuSamples[number],p:number)=>{const values=gpuSamples.map(s=>s[key]).sort((a,b)=>a-b);return values[Math.floor(values.length*p)]??null;};const triangles=(items:Iterable<Batch>)=>Array.from(items).reduce((sum,b)=>sum+b.mesh.count/3*b.count,0);return {renderer:'direct-webgpu',drawCalls,resolution:[width,height],pixelScale,floorRangeM:activeFloorRange(),patches:patchBatches.size,floorChunks:floorChunks.size,trees:trees.length,visibleTrees,treeLods,farTrees:farTreeCount,triangles:{trees:triangles(treeBatches.values()),farTrees:triangles(farTreeBatches.values()),floor:triangles([...floorChunks.values()].flat()),meadow:triangles(meadowBatches.values())},canopyReady,treeFamilies:families.size,assets:assetFamilies.size,boats:boatBatches.size,water:waterBatches.length,patchFailures,floorFailures,treeFailures,assetFailures,gpuMs:{available:gpuTimingAvailable,samples:gpuSamples.length,median:percentile('total',.5),p95:percentile('total',.95),shadowP95:percentile('shadow',.95),opaqueP95:percentile('opaque',.95),riverP95:percentile('river',.95),error:timingError}};},ready:()=>patchBatches.size>0};
}
