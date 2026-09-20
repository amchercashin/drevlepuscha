import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';
import {Vector2,Vector3,Vector4} from '@babylonjs/core/Maths/math.vector.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import {ShaderStore} from '@babylonjs/core/Engines/shaderStore.js';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial.js';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture.js';
import {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {Camera} from '@babylonjs/core/Cameras/camera.js';
import {daylightAt} from '../domain/daylight.ts';
import type {Daylight} from '../domain/daylight.ts';
import {createCloudPixels,createMoonPixels,CLOUD_TEXTURE_SIZE,MOON_TEXTURE_SIZE} from '../domain/sky-textures.ts';
import {SKY_SEED,skySettings,cloudOffsets,advanceSkyTime,modulo,moonBasis,starRotation,sourceTransmission} from '../domain/sky.ts';
import type {Direction} from '../domain/daylight.ts';
import type {SkySettingsPatch,SkyQuality,CloudOffsets} from '../domain/sky.ts';
import {skyVertex,skyFragment} from './showcase-sky.wgsl.ts';
import {moonAlbedoUrl} from './sky-assets.ts';

ShaderStore.ShadersStoreWGSL.showcaseSkyVertexShader=skyVertex;
ShaderStore.ShadersStoreWGSL.showcaseSkyPixelShader=skyFragment;

export function createShowcaseSky(scene:Scene,camera:Camera,landscapeDepth=false){
 const material=new ShaderMaterial('showcase-sky',scene,{vertex:'showcaseSky',fragment:'showcaseSky'},
  {attributes:['position'],uniforms:['worldViewProjection','landscapeDepth','skyDepth','zenith','horizon','solar','lunar','moonRight','moonUp','lightSource','moonIllumination','sourcePower','stars','starRotation','twinklePhase','daylight','sunset','quality','starSettings','moonSettings','lowShape','highShape','lowScale','highScale','lowBase','lowDetail','highBase','highDetail','warpOffset'],samplers:['cloudMap','moonMap'],shaderLanguage:ShaderLanguage.WGSL});
 material.setFloat('landscapeDepth',Number(landscapeDepth));
 material.setFloat('skyDepth',scene.getEngine().useReverseDepthBuffer?0.000001:0.999999);
 material.backFaceCulling=false;material.disableDepthWrite=true;material.fogEnabled=false;
 const cloudPixels=createCloudPixels();
 const clouds=RawTexture.CreateRGBATexture(cloudPixels,CLOUD_TEXTURE_SIZE,CLOUD_TEXTURE_SIZE,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);
 clouds.name='procedural-clouds';clouds.wrapU=clouds.wrapV=Texture.WRAP_ADDRESSMODE;clouds.gammaSpace=false;
 let moon:Texture=RawTexture.CreateRGBATexture(createMoonPixels(),MOON_TEXTURE_SIZE,MOON_TEXTURE_SIZE,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);
 moon.name='procedural-moon';moon.wrapU=moon.wrapV=Texture.CLAMP_ADDRESSMODE;moon.gammaSpace=false;
 material.setTexture('cloudMap',clouds);material.setTexture('moonMap',moon);
 const mesh=CreateSphere('showcase-sky',{diameter:400,segments:12},scene);mesh.material=material;
 mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;mesh.metadata={environment:true};
 const top=new Color3(),bottom=new Color3(),solar=new Vector3(),lunar=new Vector3(),right=new Vector3(),up=new Vector3(),source=new Vector3();
 const vectors=new Map<string,Vector2>();
 const lowShape=new Vector4(),highShape=new Vector4(),moonShape=new Vector4();
 let settings=skySettings(),quality:SkyQuality=2,animationSeconds=0,offsets=cloudOffsets(0,settings),current=daylightAt(12),disposed=false;
 let moonSource:'procedural'|'artwork'='procedural',assetState:'idle'|'loading'|'ready'|'failed'='idle',assetError:string|null=null;
 let pending:Texture|null=null,loading:Promise<void>|null=null,finishLoading:(()=>void)|null=null;
 function vec2(name:string,x:number,y:number){let v=vectors.get(name);if(!v){v=new Vector2();vectors.set(name,v);}material.setVector2(name,v.set(x,y));}
 function uploadMotion(){
  for(const [key,value] of Object.entries(offsets))vec2(key==='warp'?'warpOffset':key,...value);
  material.setFloat('twinklePhase',modulo(animationSeconds,240)*Math.PI/120);
 }
 function uploadSettings(){
  for(const [name,s,shape] of [['low',settings.low,lowShape],['high',settings.high,highShape]] as const){
   material.setVector4(name+'Shape',shape.set(s.coverage,s.opticalDepth,s.detailScale,s.warpStrength));vec2(name+'Scale',...s.scale);
  }
  vec2('starSettings',settings.stars.brightness,settings.stars.twinkle);
  material.setVector4('moonSettings',moonShape.set(settings.moon.sizeScale,settings.moon.brightness,settings.moon.halo,settings.moon.limbShade));
  material.setFloat('quality',quality);
 }
 function update(s:Daylight){
  if(disposed)return;current=s;
  top.set(...s.zenith);bottom.set(...s.horizon);
  if(landscapeDepth){const t=s.daylight*(1-s.sunset);top.set(top.r+(.20-top.r)*t*.7,top.g+(.36-top.g)*t*.7,top.b+(.63-top.b)*t*.7);bottom.set(bottom.r+(.76-bottom.r)*t*.85,bottom.g+(.83-bottom.g)*t*.85,bottom.b+(.89-bottom.b)*t*.85);}
  material.setColor3('zenith',top);material.setColor3('horizon',bottom);
  material.setVector3('solar',solar.set(...s.towardSun));material.setVector3('lunar',lunar.set(...s.towardMoon));
  material.setVector3('lightSource',source.set(...(s.source==='sun'?s.towardSun:s.towardMoon)));
  const basis=moonBasis(s.towardMoon);material.setVector3('moonRight',right.set(...basis.right));material.setVector3('moonUp',up.set(...basis.up));
  material.setFloat('stars',s.stars);vec2('starRotation',...starRotation(s.hours));
  material.setFloat('moonIllumination',s.moonIllumination);material.setFloat('sourcePower',s.source==='moon'?s.moonIllumination**1.5:1);
  material.setFloat('daylight',s.daylight);material.setFloat('sunset',s.sunset);
 }
 function animate(dt:number){
  if(disposed)return;
  const next=advanceSkyTime(animationSeconds,dt,settings.motionScale),delta=next-animationSeconds;if(delta===0)return;
  animationSeconds=next;
  // Integrate each field independently, so changing either speed never teleports it.
  const advance=cloudOffsets(delta,settings);
  for(const key of Object.keys(offsets) as (keyof CloudOffsets)[]){const a=offsets[key],b=advance[key];offsets[key]=[modulo(a[0]+b[0],1),modulo(a[1]+b[1],1)];}
  uploadMotion();
 }
 function setSettings(patch:SkySettingsPatch){if(disposed)return;settings=skySettings(settings,patch);uploadSettings();}
 function setQuality(value:SkyQuality){if(disposed)return;if(![0,1,2].includes(value))throw new Error('Invalid sky quality');quality=value;material.setFloat('quality',quality);}
 function setAnimationTime(seconds:number){
  if(disposed)return;if(!Number.isFinite(seconds)||seconds<0)throw new Error('Sky time must be finite and nonnegative');
  animationSeconds=seconds;offsets=cloudOffsets(seconds,settings);uploadMotion();
 }
 function loadArtAssets():Promise<void>{
  if(disposed||!moonAlbedoUrl)return Promise.resolve();if(loading)return loading;
  assetState='loading';
  loading=new Promise<void>(resolve=>{
   finishLoading=resolve;
   const candidate=new Texture(moonAlbedoUrl,scene,{noMipmap:false,invertY:false,samplingMode:Texture.TRILINEAR_SAMPLINGMODE,useSRGBBuffer:false,
    onLoad:()=>{
     if(disposed||scene.isDisposed){candidate.dispose();resolve();return;}
     const size=candidate.getSize();
     if(size.width!==size.height||size.width<64){assetState='failed';assetError='Moon albedo must be a square of at least 64 pixels';candidate.dispose();}
     else {const fallback=moon;moon=candidate;material.setTexture('moonMap',moon);moonSource='artwork';assetState='ready';fallback.dispose();}
     pending=null;finishLoading=null;resolve();
    },
    onError:(message)=>{if(!disposed){assetState='failed';assetError=message??'Moon texture failed';}candidate.dispose();pending=null;finishLoading=null;resolve();},
   });
   candidate.name='moon-artwork';candidate.wrapU=candidate.wrapV=Texture.CLAMP_ADDRESSMODE;candidate.gammaSpace=false;candidate.isBlocking=false;pending=candidate;
  });
  return loading;
 }
 const observer=scene.onBeforeRenderObservable.add(()=>mesh.position.copyFrom(camera.position));
 function dispose(){
  if(disposed)return;disposed=true;scene.onBeforeRenderObservable.remove(observer);scene.onDisposeObservable.remove(cleanup);
  pending?.dispose();pending=null;finishLoading?.();finishLoading=null;mesh.dispose();material.dispose();clouds.dispose();moon.dispose();
 }
 const cleanup=scene.onDisposeObservable.add(dispose);
 uploadSettings();uploadMotion();update(current);
 return {mesh,update,animate,setSettings,setQuality,setAnimationTime,loadArtAssets,dispose,
  sampleTransmission:(toward:Direction)=>sourceTransmission(cloudPixels,CLOUD_TEXTURE_SIZE,toward,settings,offsets),
  stats:()=>({version:1,seed:SKY_SEED,quality,animationSeconds,settings:skySettings(settings),offsets:Object.fromEntries(Object.entries(offsets).map(([k,v])=>[k,[...v]])),moonSource,assetState,assetError,textures:{clouds:clouds.getSize(),moon:moon.getSize()},disposed})};
}
