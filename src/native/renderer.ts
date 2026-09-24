import type {Daylight} from '../domain/daylight.ts';
import {forestPlacements,treeCollider} from '../domain/forest.ts';
import {finalizeForestPlacements} from '../domain/forest-records.ts';
import type {TreePlacement} from '../domain/forest.ts';
import {treeTone} from '../domain/tree-tone.ts';
import {CLOAK_COLORS} from '../domain/cloak-colors.ts';
import {showcaseHeight} from '../domain/showcase.ts';
import {fadeOpacity,occludesTraveller} from '../domain/harness.ts';
import type {Box,Point3} from '../domain/harness.ts';
import {collisionGeometry,meshBlocksSegment,meshCollider} from '../domain/mesh-collision.ts';
import type {CollisionGeometry} from '../domain/mesh-collision.ts';
import {createCloudPixels,SKY_TEXTURE_SIZE} from '../domain/sky-textures.ts';
import {cloudOffsets,moonBasis,sourceTransmission} from '../domain/sky.ts';
import type {SkyQuality,SkySettings} from '../domain/sky.ts';
import type {WeatherState} from '../domain/weather.ts';
import {rainDrop,rainDropIndices,rainTiles,RAIN_TILE_SIZE} from '../domain/rain.ts';
import {moonAlbedoUrl} from '../runtime/sky-assets.ts';
import type {TreeAssetData} from '../runtime/tree-assets.ts';
import type {WindSystem} from '../runtime/wind.ts';
import oakUrl from '../../assets/trees/meshy-a/tree.json?url';
import oakTexture from '../../assets/optimized/showcase/oak.webp';
import forkUrl from '../../assets/trees/fork-oak/variants.json?url';
import forkTexture from '../../assets/optimized/showcase/fork.webp';
import youngUrl from '../../assets/trees/young-tree/variants.json?url';
import youngTexture from '../../assets/optimized/showcase/young.webp';
import rangerUrl from '../../assets/characters/ranger/runtime.glb?url';
import foliageUrl from '../../assets/optimized/showcase/foliage.webp';
import soilUrl from '../../assets/optimized/showcase/soil.webp';
import patchesUrl from '../../assets/floor/trial/patches.png';
import heightsUrl from '../../assets/floor/trial/heights.png';
import normalsUrl from '../../assets/floor/trial/normals.png';
import reliefSoilUrl from '../../assets/floor/trial/soil.png';
import litterUrl from '../../assets/floor/trial/litter.png';
import rockUrl from '../../assets/rocks/moss-boulder/variants.json?url';
import rockTextureUrl from '../../assets/optimized/showcase/rock.webp';
import slabUrl from '../../assets/props/slate-slab/variants.json?url';
import slabTextureUrl from '../../assets/optimized/showcase/slab.webp';
import stumpUrl from '../../assets/props/old-stump/variants.json?url';
import stumpTextureUrl from '../../assets/optimized/showcase/stump.webp';
import logUrl from '../../assets/props/fallen-log/variants.json?url';
import logTextureUrl from '../../assets/optimized/showcase/log.webp';
import {cameraBasis,inverseAffine,lookAt,modelMatrix,multiply,normalize,orthographic,perspective} from './math.ts';
import type {Vec3} from './math.ts';
import {crownLeafGeometry,detailTerrainGeometry,rangerGeometry,terrainGeometry,treeGeometry} from './geometry.ts';
import type {MeshData} from './geometry.ts';
import {POST_WGSL,RAIN_WGSL,SCENE_WGSL} from './shaders.ts';

interface GpuMesh {vertex:GPUBuffer;index:GPUBuffer;count:number}
interface GpuMaterial {group:GPUBindGroup;uniform:GPUBuffer}
interface Family {levels:GpuMesh[];leaves:GpuMesh;materials:GpuMaterial[];data:TreeAssetData;collision:CollisionGeometry}
interface Tree {placement:TreePlacement;family:number;packed:Float32Array;opacity:number;box:Box;visualBox:Box}
interface Bucket {buffer:GPUBuffer;data:Float32Array;near:Tree[];far:Tree[];count:number;shadowCount:number;
 fadedBuffer:GPUBuffer;fadedData:Float32Array;fadedNear:Tree[];fadedFar:Tree[];fadedCount:number;fadedShadowCount:number}
interface FoliageMeshes {grass:GpuMesh;leaves:GpuMesh;cover:GpuMesh}
interface FoliageReply {type:'built';id:number;center:{e:number;n:number};grass:MeshData;leaves:MeshData;cover:MeshData}
interface Prop {mesh:GpuMesh;material:GpuMaterial;instance:GPUBuffer;packed:Float32Array;opacity:number;box:Box}
interface AvatarGpu {instance:GPUBuffer;skinBuffer:GPUBuffer;skinGroup:GPUBindGroup}
export interface NativeRemote {id:string;e:number;n:number;heading:number;speed:number;cloakColor:string}
export interface NativeFrame {
 eye:Vec3;target:Vec3;player:{e:number;n:number;heading:number};
 daylight:Daylight;dt:number;speed:number;seconds:number;fogDensity:number;wind:WindSystem;cloakColor?:string;remotes?:NativeRemote[];
 weather:WeatherState;sky:SkySettings;skySeconds:number;skyQuality:SkyQuality;rays:boolean;
}

function cloakTone(hex:string):[number,number,number]{
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 const luma=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];return [rgb[0]/luma,rgb[1]/luma,rgb[2]/luma];
}

function gpuBuffer(device:GPUDevice,data:Float32Array|Uint32Array,usage:GPUBufferUsageFlags):GPUBuffer {
 const buffer=device.createBuffer({size:Math.max(4,(data.byteLength+3)&~3),usage,mappedAtCreation:true});
 const target=data instanceof Float32Array?new Float32Array(buffer.getMappedRange()):new Uint32Array(buffer.getMappedRange());
 target.set(data);buffer.unmap();return buffer;
}
function makeMesh(device:GPUDevice,data:MeshData):GpuMesh {
 return {vertex:gpuBuffer(device,data.vertices,GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST),index:gpuBuffer(device,data.indices,GPUBufferUsage.INDEX),count:data.indices.length};
}
function identityInstance():Float32Array {
 const values=new Float32Array(20);values[0]=values[5]=values[10]=values[15]=1;values[16]=values[17]=values[18]=values[19]=1;return values;
}
async function json<T>(url:string):Promise<T>{const r=await fetch(url);if(!r.ok)throw new Error(`Лес: HTTP ${r.status}`);return r.json() as Promise<T>;}

export async function createNativeRenderer(canvas:HTMLCanvasElement,onLost:(message:string)=>void,progress?:(label:string)=>void){
 if(!navigator.gpu)throw new Error('Для прогулки нужен WebGPU. Обновите браузер и включите аппаратное ускорение.');
 const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
 if(!adapter)throw new Error('WebGPU не нашёл подходящий графический адаптер.');
 const device=await adapter.requestDevice();
 const context=canvas.getContext('webgpu');if(!context)throw new Error('Не удалось получить холст WebGPU.');
 const gpuContext=context;
 const swapFormat=navigator.gpu.getPreferredCanvasFormat();
 context.configure({device,format:swapFormat,alphaMode:'opaque'});
 void device.lost.then(info=>onLost(`Графическое устройство потеряно: ${info.message || info.reason}. Перезагрузите стенд.`));

 const frameBuffer=device.createBuffer({size:544,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 const frameData=new Float32Array(136);
 const shadowTexture=device.createTexture({size:[1024,1024],format:'depth32float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
 const shadowView=shadowTexture.createView();
 const shadowSampler=device.createSampler({compare:'less-equal',magFilter:'linear',minFilter:'linear'});
 const frameLayout=device.createBindGroupLayout({entries:[
  {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
  {binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'depth'}},
  {binding:2,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'comparison'}},
 ]});
 const shadowFrameLayout=device.createBindGroupLayout({entries:[
  {binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:'uniform'}},
 ]});
 const materialLayout=device.createBindGroupLayout({entries:[
  {binding:0,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
  {binding:1,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}},
  {binding:2,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
  ...[3,4,5,6,7].map(binding=>({binding,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float' as const}})),
  {binding:8,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
  {binding:9,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}},
  {binding:10,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
 ]});
 const skinLayout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:'read-only-storage'}}]});
 const frameGroup=device.createBindGroup({layout:frameLayout,entries:[
  {binding:0,resource:{buffer:frameBuffer}},{binding:1,resource:shadowView},{binding:2,resource:shadowSampler},
 ]});
 const shadowFrameGroup=device.createBindGroup({layout:shadowFrameLayout,entries:[{binding:0,resource:{buffer:frameBuffer}}]});
 const textureSampler=device.createSampler({magFilter:'linear',minFilter:'linear',mipmapFilter:'linear',addressModeU:'repeat',addressModeV:'repeat',maxAnisotropy:4});
 const moonSampler=device.createSampler({magFilter:'linear',minFilter:'linear',mipmapFilter:'linear',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});
 const white=device.createTexture({size:[1,1],format:'rgba8unorm-srgb',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
 device.queue.writeTexture({texture:white},new Uint8Array([255,255,255,255]),{bytesPerRow:4},[1,1]);
 const contactTexture=device.createTexture({size:[512,640],format:'r8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});

 let groundMaps:GPUTexture[]=[],moonTexture:GPUTexture;
 function makeMaterial(texture:GPUTexture,kind:number,tint:[number,number,number]=[1,1,1]):GpuMaterial {
  const uniform=device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  device.queue.writeBuffer(uniform,0,new Float32Array([kind,1,0,0,...tint,1]));
  const group=device.createBindGroup({layout:materialLayout,entries:[
   {binding:0,resource:texture.createView()},{binding:1,resource:textureSampler},{binding:2,resource:{buffer:uniform}},
   ...groundMaps.map((map,index)=>({binding:index+3,resource:map.createView()})),
   {binding:8,resource:moonTexture.createView()},{binding:9,resource:moonSampler},{binding:10,resource:contactTexture.createView()},
  ]});
  return {group,uniform};
 }
 async function imageTexture(blob:Blob,linear=false):Promise<GPUTexture>{
  const bitmap=await createImageBitmap(blob),width=bitmap.width,height=bitmap.height;
  const levels=Math.floor(Math.log2(Math.max(width,height)))+1;
  const texture=device.createTexture({size:[width,height],mipLevelCount:levels,format:linear?'rgba8unorm':'rgba8unorm-srgb',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
  for(let level=0;level<levels;level++){
   const w=Math.max(1,width>>level),h=Math.max(1,height>>level);
   const source=level===0?bitmap:await createImageBitmap(bitmap,{resizeWidth:w,resizeHeight:h,resizeQuality:'high'});
   device.queue.copyExternalImageToTexture({source},{texture,mipLevel:level},[w,h]);
   if(level>0)source.close();
  }
  bitmap.close();return texture;
 }
 async function urlTexture(url:string,linear=false):Promise<GPUTexture>{const r=await fetch(url);if(!r.ok)throw new Error(`Текстура леса: HTTP ${r.status}`);return imageTexture(await r.blob(),linear);}
 groundMaps=await Promise.all([urlTexture(patchesUrl,true),urlTexture(heightsUrl,true),urlTexture(normalsUrl,true),urlTexture(reliefSoilUrl),urlTexture(litterUrl)]);
 if(!moonAlbedoUrl)throw new Error('Не найдена текстура Луны.');
 moonTexture=await urlTexture(moonAlbedoUrl,true);
 const cloudPixels=createCloudPixels();
 const cloudTexture=device.createTexture({size:[SKY_TEXTURE_SIZE,SKY_TEXTURE_SIZE],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
 device.queue.writeTexture({texture:cloudTexture},cloudPixels,{bytesPerRow:SKY_TEXTURE_SIZE*4},[SKY_TEXTURE_SIZE,SKY_TEXTURE_SIZE]);
 const skyMaterial=makeMaterial(cloudTexture,0),groundMaterial=makeMaterial(await urlTexture(soilUrl),0),grassMaterial=makeMaterial(white,3,[.31,.48,.32]),crownMaterial=makeMaterial(white,5,[.22,.38,.24]);

 const shader=device.createShaderModule({code:SCENE_WGSL,label:'native-showcase-scene'}),postShader=device.createShaderModule({code:POST_WGSL,label:'native-showcase-tonemap'}),rainShader=device.createShaderModule({code:RAIN_WGSL,label:'native-showcase-rain'});
 const issues=[...(await shader.getCompilationInfo()).messages,...(await rainShader.getCompilationInfo()).messages].filter(m=>m.type==='error');
 if(issues.length)throw new Error(`WGSL: ${issues.map(m=>`${m.lineNum}:${m.linePos} ${m.message}`).join('; ')}`);
 const sceneLayout=device.createPipelineLayout({bindGroupLayouts:[frameLayout,materialLayout]});
 const shadowLayout=device.createPipelineLayout({bindGroupLayouts:[shadowFrameLayout,materialLayout]});
 const vertexBuffers:GPUVertexBufferLayout[]=[
  {arrayStride:48,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x3'},{shaderLocation:2,offset:24,format:'float32x2'},{shaderLocation:8,offset:32,format:'float32x4'}]},
  {arrayStride:80,stepMode:'instance',attributes:[
   {shaderLocation:3,offset:0,format:'float32x4'},{shaderLocation:4,offset:16,format:'float32x4'},
   {shaderLocation:5,offset:32,format:'float32x4'},{shaderLocation:6,offset:48,format:'float32x4'},
   {shaderLocation:7,offset:64,format:'float32x4'},
  ]},
 ];
 const skinnedVertexBuffers:GPUVertexBufferLayout[]=[
  {arrayStride:64,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x3'},{shaderLocation:2,offset:24,format:'float32x2'},{shaderLocation:8,offset:32,format:'float32x4'},{shaderLocation:9,offset:48,format:'float32x4'}]},
  vertexBuffers[1],
 ];
 const foliageVertexBuffers:GPUVertexBufferLayout[]=[
  {arrayStride:64,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x3'},{shaderLocation:2,offset:24,format:'float32x2'},{shaderLocation:8,offset:32,format:'float32x4'},{shaderLocation:10,offset:48,format:'float32x4'}]},
  vertexBuffers[1],
 ];
 const skinnedSceneLayout=device.createPipelineLayout({bindGroupLayouts:[frameLayout,materialLayout,skinLayout]});
 const skinnedShadowLayout=device.createPipelineLayout({bindGroupLayouts:[shadowFrameLayout,materialLayout,skinLayout]});
 const shadowPipeline=await device.createRenderPipelineAsync({layout:shadowLayout,vertex:{module:shader,entryPoint:'vsShadow',buffers:vertexBuffers},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less'}});
 const skinnedShadowPipeline=await device.createRenderPipelineAsync({layout:skinnedShadowLayout,vertex:{module:shader,entryPoint:'vsSkinnedShadow',buffers:skinnedVertexBuffers},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less'}});
 const rainLayout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:'read-only-storage'}}]});
 const rainBlend:GPUBlendState={color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}};
 async function createScenePipelines(count:1|4){
  const multisample={count};
  const [main,faded,skinned,foliage,sky,rain]=await Promise.all([
   device.createRenderPipelineAsync({layout:sceneLayout,vertex:{module:shader,entryPoint:'vs',buffers:vertexBuffers},fragment:{module:shader,entryPoint:'fs',targets:[{format:'rgba16float'}]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less-equal'},multisample}),
   device.createRenderPipelineAsync({layout:sceneLayout,vertex:{module:shader,entryPoint:'vs',buffers:vertexBuffers},fragment:{module:shader,entryPoint:'fsBlend',targets:[{format:'rgba16float',blend:rainBlend}]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth32float',depthWriteEnabled:false,depthCompare:'less-equal'},multisample}),
   device.createRenderPipelineAsync({layout:skinnedSceneLayout,vertex:{module:shader,entryPoint:'vsSkinned',buffers:skinnedVertexBuffers},fragment:{module:shader,entryPoint:'fs',targets:[{format:'rgba16float'}]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less-equal'},multisample}),
   device.createRenderPipelineAsync({layout:sceneLayout,vertex:{module:shader,entryPoint:'vsFoliage',buffers:foliageVertexBuffers},fragment:{module:shader,entryPoint:count===4?'fsCoverage':'fs',targets:[{format:'rgba16float'}]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less-equal'},multisample:{count,alphaToCoverageEnabled:count===4}}),
   device.createRenderPipelineAsync({layout:sceneLayout,vertex:{module:shader,entryPoint:'screenVs'},fragment:{module:shader,entryPoint:'skyFs',targets:[{format:'rgba16float'}]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth32float',depthWriteEnabled:false,depthCompare:'always'},multisample}),
   device.createRenderPipelineAsync({layout:device.createPipelineLayout({bindGroupLayouts:[frameLayout,rainLayout]}),vertex:{module:rainShader,entryPoint:'rainVs'},fragment:{module:rainShader,entryPoint:'rainFs',targets:[{format:'rgba16float',blend:rainBlend}]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth32float',depthWriteEnabled:false,depthCompare:'less-equal'},multisample}),
  ]);
  return {main,faded,skinned,foliage,sky,rain};
 }
 const singleSample=await createScenePipelines(1),fourSamples=await createScenePipelines(4);
 const postLayout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},{binding:1,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}}]});
 const postPipeline=await device.createRenderPipelineAsync({layout:device.createPipelineLayout({bindGroupLayouts:[postLayout]}),vertex:{module:postShader,entryPoint:'vs'},fragment:{module:postShader,entryPoint:'fs',targets:[{format:swapFormat}]},primitive:{topology:'triangle-list'}});
 const postSampler=device.createSampler({magFilter:'linear',minFilter:'linear'});
 const rainBuffer=device.createBuffer({size:9*256*8*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
 const rainGroup=device.createBindGroup({layout:rainLayout,entries:[{binding:0,resource:{buffer:rainBuffer}}]});

 progress?.('Готовим рельеф…');
 const terrain=makeMesh(device,terrainGeometry()),detailData=detailTerrainGeometry(0,0),detail=makeMesh(device,detailData);
 const identity=gpuBuffer(device,identityInstance(),GPUBufferUsage.VERTEX);
 let detailCell='0:0';

 progress?.('Загружаем деревья и следопыта…');
 const variety=new URLSearchParams(location.search).get('variety')!=='0';
 const [oak,fork,young,ranger,oakTex,forkTex,youngTex]=await Promise.all([
  json<TreeAssetData>(oakUrl),
  variety?json<{variants:(TreeAssetData&{id:string})[]}>(forkUrl):Promise.resolve(null),
  variety?json<{variants:(TreeAssetData&{id:string})[]}>(youngUrl):Promise.resolve(null),
  rangerGeometry(rangerUrl),urlTexture(oakTexture),
  variety?urlTexture(forkTexture):Promise.resolve(white),
  variety?urlTexture(youngTexture):Promise.resolve(white),
 ]);
 const assetFamilies:TreeAssetData[]=[oak,...(fork?.variants??[]),...(young?.variants??[])];
 const textureForFamily=assetFamilies.map((_,i)=>i===0?oakTex:i<=3?forkTex:youngTex);
 const families:Family[]=assetFamilies.map((data,i)=>({
  data,levels:data.levels.map(level=>makeMesh(device,treeGeometry(level[0]))),
  leaves:makeMesh(device,crownLeafGeometry(data.levels[0][0],0x9e3779b9^(i*0x85ebca6b))),
  materials:data.levels.map((_,level)=>makeMaterial(level>=(data.bakedColorFromLevel??Infinity)?white:textureForFamily[i],1)),
  collision:collisionGeometry(data.levels[0]),
 }));
 const rangerMesh=makeMesh(device,ranger.mesh),rangerTex=await imageTexture(ranger.image),rangerInstance=device.createBuffer({size:80,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
 const skinBuffer=device.createBuffer({size:ranger.jointCount*64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
 const skinGroup=device.createBindGroup({layout:skinLayout,entries:[{binding:0,resource:{buffer:skinBuffer}}]});
 const localAvatar:AvatarGpu={instance:rangerInstance,skinBuffer,skinGroup};
 const remoteAvatars=new Map<string,AvatarGpu>(),cloakMaterials=new Map<string,GpuMaterial>();
 function materialForCloak(color:string){let material=cloakMaterials.get(color);if(!material){material=makeMaterial(rangerTex,2,cloakTone(color));cloakMaterials.set(color,material);}return material;}
 function createAvatar():AvatarGpu{
  const instance=device.createBuffer({size:80,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
  const skinBuffer=device.createBuffer({size:ranger.jointCount*64,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  return {instance,skinBuffer,skinGroup:device.createBindGroup({layout:skinLayout,entries:[{binding:0,resource:{buffer:skinBuffer}}]})};
 }
 const slotCounts:[number,number]=[fork?.variants.length??0,young?.variants.length??0];
 const placements=finalizeForestPlacements(forestPlacements(oak.rootRadius,oak.placement),
  assetFamilies.map((data,i)=>({id:`family-${i}`,version:data.version??'',rootRadius:data.rootRadius,sink:i===0?.85:i<=slotCounts[0]?.35:.16})),
  slotCounts,showcaseHeight,variety,true);
 const trees:Tree[]=placements.map(({placement:p,slot:family})=>{
  const selected=families[family].data;
  const matrix=modelMatrix(p.e,p.y,-p.n,p.yaw,p.leanX,p.leanZ,p.width,p.height,p.depth);
  const packed=new Float32Array(20);packed.set(matrix);
  const tone=treeTone(p.id,p.e,p.n);packed.set([1+tone[0],1+tone[1],1+tone[2],1],16);
  const collision=meshCollider(families[family].collision,matrix,inverseAffine(matrix));
  return {placement:p,family,packed,opacity:1,
   box:{...treeCollider(p,selected.trunkRadius??1.18),collision},
   visualBox:{id:p.id,min:collision.min,max:collision.max}};
 });
 const contactPixels=new Uint8Array(512*640);
 for(const tree of trees){
  const p=tree.placement,radius=(families[tree.family].data.trunkRadius??1.18)*Math.max(p.width,p.depth)+2.2;
  const minX=Math.max(0,Math.floor(p.e+256-radius)),maxX=Math.min(511,Math.ceil(p.e+256+radius));
  const minY=Math.max(0,Math.floor(p.n+256-radius)),maxY=Math.min(639,Math.ceil(p.n+256+radius));
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
   const d=Math.hypot(x+.5-256-p.e,y+.5-256-p.n),weight=Math.max(0,1-d/radius);
   const value=Math.round(240*weight*weight),index=y*512+x;
   if(value>contactPixels[index])contactPixels[index]=value;
  }
 }
 device.queue.writeTexture({texture:contactTexture},contactPixels,{bytesPerRow:512},[512,640]);
 const props:Prop[]=[];
 const propDefinitions=[
  {url:rockUrl,texture:rockTextureUrl,places:[[-2.7,5,.75,.3],[3.4,12,1.2,1.5],[-3.2,18,.85,2.4],[4.3,24,1.1,.8],[-4,35,.9,2.9],[3.7,43,.7,1.2],[-3.3,51,1.15,2]]},
  {url:slabUrl,texture:slabTextureUrl,places:[[-3.3,10,.9,.2],[4.2,20,1.1,1.8],[-5.2,40,.85,2.3],[4.5,55,1.1,.6]]},
  {url:stumpUrl,texture:stumpTextureUrl,places:[[-4,14,.9,.3],[4.8,31,1.05,2.1],[-4.8,50,.85,1.4]]},
  {url:logUrl,texture:logTextureUrl,places:[[-4.7,9,1,.3],[4.8,30,1.15,-.4],[-5.5,49,.9,.7],[7,57,1.2,.2]]},
 ];
 const propSources=await Promise.all(propDefinitions.map(async definition=>({
  data:await json<{variants:{levels:TreeAssetData['levels']}[]}>(definition.url),
  material:makeMaterial(await urlTexture(definition.texture),4),definition,
 })));
 for(const {data,material,definition} of propSources){
  const meshes=data.variants.map(variant=>makeMesh(device,treeGeometry(variant.levels[0][0])));
  for(const [i,[pe,pn,scale,yaw]] of definition.places.entries()){
   const n=pn*4-70,e=17*Math.sin(n*.019)+6*Math.sin(n*.047)+pe*1.8,source=data.variants[i%data.variants.length].levels[0][0];
   const positions=source.positions,minY=Math.min(...positions.filter((_,index)=>index%3===1));
   const y=showcaseHeight(e,n)-minY*scale-.08*scale,matrix=modelMatrix(e,y,-n,yaw,0,0,scale,scale,scale*.9);
   const packed=new Float32Array(20);packed.set(matrix);packed.set([1,1,1,1],16);
   const instance=gpuBuffer(device,packed,GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST);
   const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};
   for(let v=0;v<positions.length;v+=3){
    const x=positions[v],h=positions[v+1],z=positions[v+2];
    const point={x:matrix[0]*x+matrix[4]*h+matrix[8]*z+matrix[12],y:matrix[1]*x+matrix[5]*h+matrix[9]*z+matrix[13],z:matrix[2]*x+matrix[6]*h+matrix[10]*z+matrix[14]};
    for(const key of ['x','y','z'] as const){min[key]=Math.min(min[key],point[key]);max[key]=Math.max(max[key],point[key]);}
   }
   props.push({mesh:meshes[i%meshes.length],material,instance,packed,opacity:1,box:{id:`prop-${definition.url}-${i}`,min,max}});
  }
 }
 const collisionBoxes=[...trees.map(tree=>tree.box),...props.map(prop=>prop.box)];
 const familyCounts=families.map((_,i)=>trees.filter(t=>t.family===i).length);
 const buckets:Bucket[][]=families.map((_,i)=>[0,1,2].map(()=>{
  const size=Math.max(80,familyCounts[i]*80);
  return {buffer:device.createBuffer({size,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),data:new Float32Array(size/4),near:[],far:[],count:0,shadowCount:0,
   fadedBuffer:device.createBuffer({size,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),fadedData:new Float32Array(size/4),fadedNear:[],fadedFar:[],fadedCount:0,fadedShadowCount:0};
 }));

 progress?.('Готовим папоротники и лесной покров…');
 const foliageMaterial=makeMaterial(await urlTexture(foliageUrl),3);
 const foliageWorker=new Worker(new URL('./foliage.worker.ts',import.meta.url),{type:'module'});
 foliageWorker.postMessage({type:'init',boxes:collisionBoxes.map(box=>({id:box.id,min:box.min,max:box.max}))});
 let foliage:FoliageMeshes|undefined,foliageCenter={e:0,n:0},foliagePending=false,foliageId=0;
 const destroyMesh=(mesh:GpuMesh)=>{mesh.vertex.destroy();mesh.index.destroy();};
 await new Promise<void>((resolve,reject)=>{
  let initial=true;
  foliageWorker.onmessage=({data}:{data:FoliageReply|{type:'error';id:number;error:string}})=>{
   if(data.type==='error'){
    foliagePending=false;
    if(initial){initial=false;reject(new Error(data.error));}else onLost(`Не удалось подготовить подлесок: ${data.error}`);
    return;
   }
   if(data.id!==foliageId)return;
   const old=foliage;
   foliage={grass:makeMesh(device,data.grass),leaves:makeMesh(device,data.leaves),cover:makeMesh(device,data.cover)};
   if(old)for(const mesh of Object.values(old))destroyMesh(mesh);
   foliageCenter=data.center;foliagePending=false;
   if(initial){initial=false;resolve();}
  };
  foliageWorker.onerror=error=>{if(initial){initial=false;reject(new Error(error.message));}else onLost(`Подлесок: ${error.message}`);};
  foliagePending=true;foliageWorker.postMessage({type:'build',id:++foliageId,e:0,n:0});
 });

 let width=0,height=0,sampleCount:1|4=1,hdr:GPUTexture|undefined,multisampledHdr:GPUTexture|undefined,depth:GPUTexture|undefined,postGroup:GPUBindGroup|undefined;
 function resize(nextWidth:number,nextHeight:number,nextSamples:1|4=1){
  nextWidth=Math.max(1,Math.min(device.limits.maxTextureDimension2D,Math.floor(nextWidth)));
  nextHeight=Math.max(1,Math.min(device.limits.maxTextureDimension2D,Math.floor(nextHeight)));
  if(nextWidth===width&&nextHeight===height&&nextSamples===sampleCount)return;
  width=nextWidth;height=nextHeight;sampleCount=nextSamples;canvas.width=width;canvas.height=height;
  hdr?.destroy();multisampledHdr?.destroy();depth?.destroy();
  hdr=device.createTexture({size:[width,height],format:'rgba16float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
  multisampledHdr=sampleCount===4?device.createTexture({size:[width,height],sampleCount,format:'rgba16float',usage:GPUTextureUsage.RENDER_ATTACHMENT}):undefined;
  depth=device.createTexture({size:[width,height],sampleCount,format:'depth32float',usage:GPUTextureUsage.RENDER_ATTACHMENT});
  postGroup=device.createBindGroup({layout:postLayout,entries:[{binding:0,resource:hdr.createView()},{binding:1,resource:postSampler}]});
 }
 resize(Math.max(1,canvas.clientWidth),Math.max(1,canvas.clientHeight));
 let visibleTrees=0,drawCalls=0,triangles=0,shadowTriangles=0;
 let rainCount=0,rainCell='',lightTransmission=1;
 const shadowsAt=58,drawDistance=190;
 function updateRain(frame:NativeFrame){
  if(frame.weather.precipitation<=.0001){rainCount=0;return;}
  const cell=`${Math.floor(frame.eye[0]/RAIN_TILE_SIZE)}:${Math.floor(frame.eye[2]/RAIN_TILE_SIZE)}:${frame.skyQuality}`;
  if(cell===rainCell)return;rainCell=cell;
  const indices=rainDropIndices(frame.skyQuality),values=new Float32Array(9*indices.length*8);
  let k=0;
  for(const [tileX,tileZ] of rainTiles(frame.eye[0],frame.eye[2]))for(const index of indices){
   const drop=rainDrop(tileX,tileZ,index),ground=showcaseHeight(drop.x,-drop.z);
   values.set([drop.x,drop.z,ground,ground+.02,drop.phase,drop.harmonic,drop.length,drop.threshold],k);k+=8;
  }
  rainCount=k/8;device.queue.writeBuffer(rainBuffer,0,values);
 }
 function updateTrees(eye:Vec3,feet:Point3,forward:Vec3,dt:number,quality:SkyQuality){
  visibleTrees=0;
 for(const row of buckets)for(const bucket of row){bucket.near.length=0;bucket.far.length=0;bucket.fadedNear.length=0;bucket.fadedFar.length=0;bucket.count=0;bucket.shadowCount=0;bucket.fadedCount=0;bucket.fadedShadowCount=0;}
  const detailedDistance=quality===2?115:quality===1?85:65;
  for(const tree of trees){
   const p=tree.placement,dx=p.e-eye[0],dz=-p.n-eye[2],distance=Math.hypot(dx,dz);
   if(distance>drawDistance||distance>22&&dx*forward[0]+dz*forward[2]<-distance*.25)continue;
   const lod=distance<23?0:distance<detailedDistance?1:2;
   const close=distance<shadowsAt;
   if(distance<15){
    const blocked=occludesTraveller({x:eye[0],y:eye[1],z:eye[2]},feet,tree.visualBox,tree.opacity<.99,
     tree.box.collision?(start,end)=>meshBlocksSegment(tree.box.collision!,start,end):undefined);
    tree.opacity=fadeOpacity(tree.opacity,blocked?.14:1,dt,blocked?.12:.23);
   }else if(tree.opacity<1)tree.opacity=fadeOpacity(tree.opacity,1,dt,.23);
   tree.packed[19]=tree.opacity;
   const bucket=buckets[tree.family][lod];
   (tree.opacity<.999?(close?bucket.fadedNear:bucket.fadedFar):(close?bucket.near:bucket.far)).push(tree);visibleTrees++;
  }
  for(const row of buckets)for(const bucket of row){
   let k=0;for(const tree of bucket.near){bucket.data.set(tree.packed,k);k+=20;}
   bucket.shadowCount=bucket.near.length;
   for(const tree of bucket.far){bucket.data.set(tree.packed,k);k+=20;}
   bucket.count=k/20;
   if(k)device.queue.writeBuffer(bucket.buffer,0,bucket.data,0,k);
   k=0;for(const tree of bucket.fadedNear){bucket.fadedData.set(tree.packed,k);k+=20;}
   bucket.fadedShadowCount=bucket.fadedNear.length;
   for(const tree of bucket.fadedFar){bucket.fadedData.set(tree.packed,k);k+=20;}
   bucket.fadedCount=k/20;
   if(k)device.queue.writeBuffer(bucket.fadedBuffer,0,bucket.fadedData,0,k);
  }
 }
 function drawMesh(pass:GPURenderPassEncoder,mesh:GpuMesh,instances:GPUBuffer,count:number){
  if(count===0)return;
  pass.setVertexBuffer(0,mesh.vertex);pass.setVertexBuffer(1,instances);pass.setIndexBuffer(mesh.index,'uint32');
  pass.drawIndexed(mesh.count,count);drawCalls++;triangles+=mesh.count*count/3;
 }
 function setFrame(frame:NativeFrame){
  const aspect=width/height,fov=50*Math.PI/180;
  const eye=frame.eye,target=frame.target;
  const basis=cameraBasis(eye,target),viewProj=multiply(perspective(fov,aspect,.08,600),lookAt(eye,target));
  const light=normalize(frame.daylight.source==='sun'?frame.daylight.towardSun:frame.daylight.towardMoon);
  const center:Vec3=[frame.player.e,showcaseHeight(frame.player.e,frame.player.n)+2,-frame.player.n];
  const lightEye:Vec3=[center[0]+light[0]*72,center[1]+light[1]*72,center[2]+light[2]*72];
  const lightMatrix=multiply(orthographic(48,.1,170),lookAt(lightEye,center));
  frameData.set(viewProj,0);frameData.set(lightMatrix,16);
  const vec=(offset:number,a:readonly number[],w=0)=>frameData.set([a[0],a[1],a[2],w],offset);
  vec(32,eye,1);vec(36,frame.daylight.towardSun,0);
  vec(40,frame.daylight.mainColor,frame.daylight.mainIntensity);
  const offsets=cloudOffsets(frame.skySeconds,frame.sky),source=frame.daylight.source==='sun'?frame.daylight.towardSun:frame.daylight.towardMoon;
  const targetTransmission=sourceTransmission(cloudPixels,SKY_TEXTURE_SIZE,source,frame.sky,offsets);
  lightTransmission+=(targetTransmission-lightTransmission)*(1-Math.exp(-Math.max(frame.dt,.016)/.7));
  for(let i=0;i<3;i++)frameData[40+i]*=frame.daylight.mainIntensity*.68*lightTransmission;
  const toLinear=(color:readonly number[])=>color.map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  vec(44,toLinear(frame.daylight.zenith),0);vec(48,toLinear(frame.daylight.horizon),0);vec(52,toLinear(frame.daylight.fogColor),0);
  frameData.set([frame.seconds,frame.daylight.daylight,frame.daylight.sunset,frame.fogDensity],56);
  vec(60,frame.daylight.towardMoon,0);
  frameData.set([width,height,Math.tan(fov/2),aspect],64);
  vec(68,basis.right);vec(72,basis.up);vec(76,basis.forward);
  vec(80,frame.daylight.fillColor.map(c=>c*frame.daylight.fillIntensity*frame.weather.ambientScale*.38+.035),0);
  vec(84,light);
  const wind=frame.wind,amplitude=Math.min(2,wind.intensity/3.5)*(.7+wind.snapshot.gust*.7);
  frameData.set([wind.snapshot.directionToXZ[0],wind.snapshot.directionToXZ[1],wind.canopyBend*amplitude,wind.coverBend*amplitude],88);
  const low=frame.sky.low,high=frame.sky.high,basisMoon=moonBasis(frame.daylight.towardMoon);
  frameData.set([low.coverage,low.opticalDepth,low.detailScale,low.warpStrength],92);
  frameData.set([high.coverage,high.opticalDepth,high.detailScale,high.warpStrength],96);
  frameData.set([...low.scale,...offsets.lowBase],100);
  frameData.set([...high.scale,...offsets.highBase],104);
  frameData.set([...offsets.lowDetail,...offsets.highDetail],108);
  frameData.set([...offsets.warp,frame.skySeconds,frame.skyQuality],112);
  frameData.set([frame.sky.stars.brightness,frame.sky.stars.twinkle,frame.sky.moon.sizeScale,frame.sky.moon.brightness],116);
  frameData.set([frame.sky.moon.halo,frame.sky.moon.limbShade,frame.daylight.moonPhase,frame.daylight.moonIllumination],120);
  vec(124,basisMoon.right);vec(128,basisMoon.up);
  frameData.set([frame.weather.precipitation,Number(frame.rays),frame.weather.ambientScale,lightTransmission],132);
  device.queue.writeBuffer(frameBuffer,0,frameData);
  return basis;
 }
 function render(frame:NativeFrame){
  if(!hdr||!depth||!postGroup)return;
  const pipelines=sampleCount===4?fourSamples:singleSample;
  const basis=setFrame(frame),feet={x:frame.player.e,y:showcaseHeight(frame.player.e,frame.player.n),z:-frame.player.n};
  updateRain(frame);
  updateTrees(frame.eye,feet,basis.forward,frame.dt,frame.skyQuality);
  for(const prop of props){
   const blocked=occludesTraveller({x:frame.eye[0],y:frame.eye[1],z:frame.eye[2]},feet,prop.box,prop.opacity<.99);
   const next=fadeOpacity(prop.opacity,blocked?.16:1,frame.dt,blocked?.08:.25);
   if(next!==prop.opacity){prop.opacity=next;prop.packed[19]=next;device.queue.writeBuffer(prop.instance,0,prop.packed);}
  }
  const groundCell=`${Math.round(frame.player.e/8)}:${Math.round(frame.player.n/8)}`;
  if(groundCell!==detailCell){
   const values=detailTerrainGeometry(frame.player.e,frame.player.n);
   device.queue.writeBuffer(detail.vertex,0,values.vertices);detailCell=groundCell;
  }
  if(!foliagePending&&Math.hypot(frame.player.e-foliageCenter.e,frame.player.n-foliageCenter.n)>12){
   foliagePending=true;foliageWorker.postMessage({type:'build',id:++foliageId,e:frame.player.e,n:frame.player.n});
  }
  const avatars:{gpu:AvatarGpu;material:GpuMaterial}[]=[];
  function updateAvatar(gpu:AvatarGpu,e:number,n:number,heading:number,speed:number,color:string,time:number){
   const bob=speed>.1?Math.sin(time*(speed>4?15:9))*.025:0;
   const transform=modelMatrix(e,showcaseHeight(e,n)+bob,-n,Math.PI-heading*Math.PI/180,0,0,1.78/1.7,1.78/1.7,1.78/1.7);
   const packed=new Float32Array(20);packed.set(transform);packed.set([1,1,1,1],16);
   device.queue.writeBuffer(gpu.instance,0,packed);device.queue.writeBuffer(gpu.skinBuffer,0,ranger.pose(time,speed));
   avatars.push({gpu,material:materialForCloak(color)});
  }
  updateAvatar(localAvatar,frame.player.e,frame.player.n,frame.player.heading,frame.speed,frame.cloakColor??CLOAK_COLORS[0],frame.seconds);
  const wanted=new Set<string>();
  for(const remote of frame.remotes??[]){
   wanted.add(remote.id);
   let gpu=remoteAvatars.get(remote.id);if(!gpu){gpu=createAvatar();remoteAvatars.set(remote.id,gpu);}
   if(Math.hypot(remote.e-frame.player.e,remote.n-frame.player.n)<120)updateAvatar(gpu,remote.e,remote.n,remote.heading,remote.speed,remote.cloakColor,frame.seconds);
  }
  for(const [id,gpu] of remoteAvatars)if(!wanted.has(id)){gpu.instance.destroy();gpu.skinBuffer.destroy();remoteAvatars.delete(id);}
  drawCalls=0;triangles=0;shadowTriangles=0;
  const encoder=device.createCommandEncoder({label:'native-showcase-frame'});
  const shadow=encoder.beginRenderPass({colorAttachments:[],depthStencilAttachment:{view:shadowView,depthLoadOp:'clear',depthClearValue:1,depthStoreOp:'store'}});
  shadow.setPipeline(shadowPipeline);shadow.setBindGroup(0,shadowFrameGroup);
  shadow.setBindGroup(1,groundMaterial.group);drawMesh(shadow,terrain,identity,1);
  shadow.setPipeline(skinnedShadowPipeline);
  for(const avatar of avatars){shadow.setBindGroup(1,avatar.material.group);shadow.setBindGroup(2,avatar.gpu.skinGroup);drawMesh(shadow,rangerMesh,avatar.gpu.instance,1);}
  shadow.setPipeline(shadowPipeline);
  for(const prop of props){shadow.setBindGroup(1,prop.material.group);drawMesh(shadow,prop.mesh,prop.instance,1);}
  for(let family=0;family<families.length;family++)for(let lod=0;lod<3;lod++){
   const bucket=buckets[family][lod];if(!bucket.shadowCount&&!bucket.fadedShadowCount)continue;
   shadow.setBindGroup(1,families[family].materials[lod].group);
   drawMesh(shadow,families[family].levels[lod],bucket.buffer,bucket.shadowCount);
   drawMesh(shadow,families[family].levels[lod],bucket.fadedBuffer,bucket.fadedShadowCount);
  }
  shadow.end();shadowTriangles=triangles;
  const main=encoder.beginRenderPass({colorAttachments:[{view:(multisampledHdr??hdr).createView(),...(multisampledHdr?{resolveTarget:hdr.createView()}:{}),loadOp:'clear',clearValue:[0,0,0,1],storeOp:multisampledHdr?'discard':'store'}],depthStencilAttachment:{view:depth.createView(),depthLoadOp:'clear',depthClearValue:1,depthStoreOp:'store'}});
  main.setBindGroup(0,frameGroup);
  main.setPipeline(pipelines.sky);main.setBindGroup(1,skyMaterial.group);main.draw(3);drawCalls++;
  main.setPipeline(pipelines.main);
  main.setBindGroup(1,groundMaterial.group);drawMesh(main,terrain,identity,1);drawMesh(main,detail,identity,1);
  for(const prop of props){main.setBindGroup(1,prop.material.group);drawMesh(main,prop.mesh,prop.instance,1);}
  for(let family=0;family<families.length;family++)for(let lod=0;lod<3;lod++){
   const bucket=buckets[family][lod];if(!bucket.count)continue;
   main.setBindGroup(1,families[family].materials[lod].group);drawMesh(main,families[family].levels[lod],bucket.buffer,bucket.count);
  }
  if(frame.skyQuality>=2)for(let family=0;family<families.length;family++){
   const bucket=buckets[family][0];if(!bucket.count)continue;
   main.setBindGroup(1,crownMaterial.group);drawMesh(main,families[family].leaves,bucket.buffer,bucket.count);
  }
  if(foliage){
   main.setPipeline(pipelines.foliage);
   main.setBindGroup(1,grassMaterial.group);drawMesh(main,foliage.grass,identity,1);
   main.setBindGroup(1,foliageMaterial.group);drawMesh(main,foliage.leaves,identity,1);drawMesh(main,foliage.cover,identity,1);
  }
  main.setPipeline(pipelines.skinned);
  for(const avatar of avatars){main.setBindGroup(1,avatar.material.group);main.setBindGroup(2,avatar.gpu.skinGroup);drawMesh(main,rangerMesh,avatar.gpu.instance,1);}
  main.setPipeline(pipelines.faded);
  for(let family=0;family<families.length;family++)for(let lod=0;lod<3;lod++){
   const bucket=buckets[family][lod];if(!bucket.fadedCount)continue;
   main.setBindGroup(1,families[family].materials[lod].group);drawMesh(main,families[family].levels[lod],bucket.fadedBuffer,bucket.fadedCount);
  }
  if(frame.skyQuality>=2)for(let family=0;family<families.length;family++){
   const bucket=buckets[family][0];if(!bucket.fadedCount)continue;
   main.setBindGroup(1,crownMaterial.group);drawMesh(main,families[family].leaves,bucket.fadedBuffer,bucket.fadedCount);
  }
  if(rainCount){main.setPipeline(pipelines.rain);main.setBindGroup(0,frameGroup);main.setBindGroup(1,rainGroup);main.draw(6,rainCount);drawCalls++;triangles+=2*rainCount;}
  main.end();
  const post=encoder.beginRenderPass({colorAttachments:[{view:gpuContext.getCurrentTexture().createView(),loadOp:'clear',clearValue:[0,0,0,1],storeOp:'store'}]});
  post.setPipeline(postPipeline);post.setBindGroup(0,postGroup);post.draw(3);post.end();drawCalls++;
  device.queue.submit([encoder.finish()]);
 }
 return {render,resize,boxes:collisionBoxes,stats:()=>({visibleTrees,trees:trees.length,props:props.length,remotes:remoteAvatars.size,rainInstances:rainCount,drawCalls,triangles,shadowTriangles,sampleCount,device:adapter.info,backend:'native-webgpu' as const}),
  dispose:()=>{foliageWorker.terminate();for(const gpu of remoteAvatars.values()){gpu.instance.destroy();gpu.skinBuffer.destroy();}hdr?.destroy();multisampledHdr?.destroy();depth?.destroy();shadowTexture.destroy();rainBuffer.destroy();frameBuffer.destroy();device.destroy();}};
}
