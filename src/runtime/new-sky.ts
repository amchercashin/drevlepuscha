import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import {ShaderStore} from '@babylonjs/core/Engines/shaderStore.js';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial.js';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture.js';
import {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {Camera} from '@babylonjs/core/Cameras/camera.js';
import type {Daylight} from '../domain/daylight.ts';
import {createCloudLayerPixels,createCirrusLayerPixels,SKY_LAYER_SIZE} from '../domain/sky-noise.ts';
import {MOON_TEXTURE_PNG_BASE64} from '../domain/moon-texture.ts';
import {advanceClouds,normalizeAtmosphere,skyAppearanceAt,skyAppearanceKey} from '../domain/sky-appearance.ts';
import type {Atmosphere,CloudOffset,CloudWind,SkyAppearanceType} from '../domain/sky-appearance.ts';


ShaderStore.ShadersStoreWGSL.newSkyVertexShader=`
attribute position:vec3f;uniform worldViewProjection:mat4x4f;uniform skyDepth:f32;varying skyDirection:vec3f;
@vertex fn main(input:VertexInputs)->FragmentInputs {
 vertexOutputs.skyDirection=vertexInputs.position;
 var clip=uniforms.worldViewProjection*vec4f(vertexInputs.position,1.0);
 clip.z=clip.w*uniforms.skyDepth;vertexOutputs.position=clip;
}`;

/**
 * One opaque sky draw. Two cloud layers (five texture fetches total), three star
 * layers sharing one twinkle sum, one lunar sample. No screen buffers, no ray
 * marching, no per-frame texture uploads, no extra lights.
 */
ShaderStore.ShadersStoreWGSL.newSkyPixelShader=`
varying skyDirection:vec3f;
uniform zenith:vec3f;uniform horizon:vec3f;uniform solar:vec3f;uniform lunar:vec3f;
uniform stars:f32;uniform starAngle:f32;uniform daylight:f32;uniform sunset:f32;uniform afterglow:f32;
uniform coverage:f32;uniform thickness:f32;uniform cirrus:f32;uniform moonScale:f32;uniform moonGlow:f32;uniform starDensity:f32;
uniform cloudOffset:vec2f;uniform morphology:vec2f;
uniform skyTime:f32;
var cloudMap:texture_2d<f32>;var cloudMapSampler:sampler;
var cirrusMap:texture_2d<f32>;var cirrusMapSampler:sampler;
var moonMap:texture_2d<f32>;var moonMapSampler:sampler;
const TWO_PI:f32=6.28318531;

fn hash21(p:vec2f)->f32 {
 var q=fract(p*vec2f(0.1031,0.1030));
 q+=dot(q,q+33.33);
 return fract((q.x+q.y)*q.x);
}
fn smoothMask(edge0:f32,edge1:f32,x:f32)->f32 {
 let t=clamp((x-edge0)/(edge1-edge0),0.0,1.0);
 return t*t*(3.0-2.0*t);
}
/** Per-star radius spread keeps small points from crawling between pixels. Mirrors
 * src/domain/star-field.ts, where the same arithmetic is tested without a GPU. */
fn starLayer(azimuth:f32,elevation:f32,spin:f32,density:f32,tile:vec2f,level:f32,phase:f32)->f32 {
 let angle=spin*TWO_PI;
 let lon=azimuth*TWO_PI+angle;
 let axis=vec2f(sin(elevation),cos(elevation));
 var weight=0.0;var sum=0.0;
 for(var i=0;i<2;i+=1){
  let index=f32(i);
  if(i==0){weight=1.0-weight;}else{weight=smoothMask(0.25,0.75,fract(spin+0.5));}
  let offset=axis*vec2f(tile.x*0.25,tile.y*0.25);
  let q=vec2f(lon/(TWO_PI*tile.x)+offset.x,elevation/3.14159265*tile.y+offset.y);
  let cell=floor(q);let local=fract(q);
  let seed=hash21(cell+vec2f(index*97.0));
  if(seed>density){
   let jitter=vec2f(hash21(cell+13.7),hash21(cell+71.3));
   let distance=length(local-jitter);
   let radius=0.09+hash21(cell+29.1)*0.15;
   let point=(1.0-smoothstep(radius,radius+0.02,distance))*(0.65+hash21(cell+53.9)*0.35);
   sum+=point;
  }
 }
 let twinkle=0.82+0.18*sin(uniforms.skyTime*(0.7+phase*1.6)+phase*37.0);
 return sum*weight*level*twinkle;
}
/** Star colour from the mid layer's cell: sparse warm and blue-white uniforms.stars, most
 * of the dome left near white. Level is a single scalar, so the tint is too. */
fn starTint(azimuth:f32,elevation:f32)->vec3f {
 let q=vec2f(azimuth/(TWO_PI*26.0),elevation/3.14159265*13.0);
 let warm=hash21(floor(q)+vec2f(19.3,19.3));
 return mix(vec3f(1.0,0.93,0.80),vec3f(0.78,0.86,1.0),smoothMask(0.25,0.75,warm));
}
/** Stereo projection onto a plane above the dome: the uniforms.horizon streak stays bounded,
 * and the base map breaks it up with a second, finer scale. */
fn projectDome(point:vec3f)->vec2f {return point.xz/(point.y+0.30)+0.5;}
const CLOUD_SCALE:f32=0.42;
/** Relief from a tangent-plane height difference: sunlit tops, cool undersides. */
fn cloudLight(nearHeight:f32,farHeight:f32,rise:f32,toward:f32,slope:f32)->f32 {
 let edge=clamp((farHeight-nearHeight)*9.0,0.0,1.0);
 let face=clamp(slope*0.35+0.5,0.0,1.0);
 return clamp(0.06+0.52*edge+0.26*face+rise*0.30+toward*0.14-slope*0.26,0.0,1.0);
}
@fragment fn main(input:FragmentInputs)->FragmentOutputs {
 let dir=normalize(fragmentInputs.skyDirection);
 let up=max(dir.y,0.0);
 let dusk=max(uniforms.sunset,uniforms.afterglow);
 let sunD=length(dir-uniforms.solar);
 let moonD=length(dir-uniforms.lunar);
 let sunAA=max(fwidth(sunD),0.0003);
 let moonAA=max(fwidth(moonD),0.0003);
 let horizonMask=smoothstep(-0.035,0.015,dir.y);
 let sunVisible=smoothstep(-0.085,0.005,uniforms.solar.y)*horizonMask;
 let moonVisible=smoothstep(-0.085,0.005,uniforms.lunar.y)*horizonMask;
 let sunRadius=mix(0.031,0.048,1.0-smoothstep(0.0,0.32,abs(uniforms.solar.y)));
 let moonRadius=mix(0.040,0.052,1.0-smoothstep(0.0,0.30,abs(uniforms.lunar.y)))*uniforms.moonScale;
 let sunDisc=1.0-smoothstep(sunRadius-sunAA,sunRadius+sunAA,sunD);
 let moonDisc=1.0-smoothstep(moonRadius-moonAA,moonRadius+moonAA,moonD);
 let sunward=pow(max(0.0,dot(dir,uniforms.solar)),4.0);
 let twilight=(1.0-smoothstep(0.0,0.30,abs(uniforms.solar.y)));
 let top=mix(uniforms.zenith,vec3f(0.16,0.12,0.29),uniforms.sunset*0.60);
 let low=mix(uniforms.horizon,vec3f(0.80,0.26,0.19),uniforms.sunset*0.70);
 var colour=mix(low,top,pow(up,0.48));
 // Low amber band, then rose/violet above it. The strongest colours follow the sun.
 colour+=vec3f(0.43,0.12,0.035)*exp(-up*7.0)*sunward*uniforms.sunset;
 colour=mix(colour,vec3f(0.53,0.20,0.36),exp(-pow((up-0.18)/0.15,2.0))*uniforms.sunset*(0.12+0.25*sunward));
 colour+=vec3f(0.28,0.12,0.15)*twilight*exp(-up*9.0)*(1.0-uniforms.daylight)*0.3;
 // Afterglow is weaker and much flatter than the uniforms.sunset band, and outlives the disc.
 colour+=vec3f(0.34,0.13,0.08)*exp(-up*3.4)*uniforms.afterglow*(0.30+0.70*sunward)*(1.0-uniforms.daylight);
 let sunTint=mix(vec3f(1.0,0.91,0.66),vec3f(1.0,0.29,0.09),uniforms.sunset);
 // Glare has to stay local: a wide lobe with a 0.055 radius covers most of a
 // 50 degree frame and flattens the whole sky into one pale sheet.
 let halo=exp(-sunD*sunD/0.020)*0.07+exp(-sunD*sunD/0.0045)*0.30;
 colour+=sunTint*halo*sunVisible;
 // A white-hot core and compact aureole simulate glare locally, respecting forest occlusion.
 let corona=exp(-max(0.0,sunD-sunRadius)*70.0)*0.40;
 colour+=sunTint*corona*sunVisible;
 let vertical=clamp((dir.y-uniforms.solar.y)/sunRadius*0.5+0.5,0.0,1.0);
 let sunsetDisc=mix(vec3f(1.0,0.16,0.09),vec3f(1.0,0.78,0.32),vertical);
 let sunBody=mix(vec3f(1.65,1.52,1.20),sunsetDisc,uniforms.sunset*0.92);

 // Two cloud layers over a planar dome projection.
 let dome=vec3f(dir.x,up,dir.z);
 let baseUV=(projectDome(dome)-0.5)*CLOUD_SCALE+0.5+uniforms.cloudOffset;
 let detailUV=baseUV*2.9-uniforms.cloudOffset*0.4+vec2f(0.19,0.07);
 let warpedBase=clamp(baseUV+uniforms.morphology*0.6,vec2f(0.06),vec2f(0.94));
 let warpedDetail=clamp(detailUV+uniforms.morphology*0.9,vec2f(0.06),vec2f(0.94));
 let mass=textureSample(cloudMap,cloudMapSampler,warpedBase);
 let detail=textureSample(cloudMap,cloudMapSampler,warpedDetail);
 let warp=vec2f(mass.b,mass.a)*2.0-1.0;
 let shape=clamp(baseUV+warp*0.035+uniforms.morphology*0.35,vec2f(0.04),vec2f(0.96));
 let fine=clamp(shape*4.4+uniforms.morphology*1.4,vec2f(0.04),vec2f(0.96));
 let sculpt=textureSample(cloudMap,cloudMapSampler,shape);
 let grains=textureSample(cloudMap,cloudMapSampler,fine);
 let density=sculpt.r*0.60+sculpt.g*0.14+grains.g*0.26;
 // Coverage decides how much sky is filled; density how solid each filled part is.
 let cover=smoothstep(0.28,1.20,uniforms.coverage);
 let cloud=smoothstep(mix(0.56,0.14,cover),mix(0.64,0.40,cover),density);
 let mask=clamp(cloud,0.0,1.0)*smoothstep(-0.012,0.10,dir.y);
 // Sun- and moon-relative height difference: no extra shadow map, no ray march.
 let lightOffset=uniforms.solar.xz*0.02;
 let sunSlope=textureSample(cloudMap,cloudMapSampler,shape+lightOffset).r-textureSample(cloudMap,cloudMapSampler,shape-lightOffset).r;
 let moonSlope=textureSample(cloudMap,cloudMapSampler,shape+uniforms.lunar.xz*0.02).r-textureSample(cloudMap,cloudMapSampler,shape-uniforms.lunar.xz*0.02).r;
 let sunLit=cloudLight(sculpt.r,textureSample(cloudMap,cloudMapSampler,shape+lightOffset).r,clamp((sculpt.g-detail.g)*2.4,-1.0,1.0),sunward,sunSlope);
 let moonLit=cloudLight(sculpt.r,textureSample(cloudMap,cloudMapSampler,shape+uniforms.lunar.xz*0.02).r,clamp((sculpt.g-detail.g)*2.0,-1.0,1.0),max(0.0,dot(dir,uniforms.lunar)),moonSlope);
 let cloudShade=mix(vec3f(0.055,0.072,0.12),vec3f(0.42,0.52,0.60),uniforms.daylight);
 let cloudLightColour=mix(vec3f(0.18,0.23,0.34),vec3f(1.0,0.97,0.88),uniforms.daylight);
 let warmShade=mix(cloudShade,vec3f(0.28,0.16,0.30),dusk*0.80);
 let warmLight=mix(cloudLightColour,vec3f(1.0,0.48,0.24),dusk*(0.45+sunward*0.55));
 let reliefTone=pow(clamp(0.50+0.85*(sculpt.g-0.45)+0.35*clamp((sculpt.r-detail.r)*2.2,-1.0,1.0),0.0,1.0),1.35);
 var cloudColour=mix(cloudShade,cloudLightColour,reliefTone);
 cloudColour=mix(cloudColour,mix(warmShade,warmLight,pow(sunLit,1.25)),0.88);
 let nightLight=smoothstep(-0.010,0.004,uniforms.lunar.y);
 cloudColour=mix(cloudColour,mix(vec3f(0.07,0.09,0.15),vec3f(0.52,0.62,0.82),moonLit),nightLight*0.85);
 let edge=smoothstep(0.34,0.10,cloud);
 cloudColour+=sunTint*edge*exp(-sunD*sunD/0.075)*sunVisible*0.42;
 cloudColour+=vec3f(0.55,0.64,0.86)*edge*exp(-moonD*moonD/0.10)*moonVisible*uniforms.moonGlow*0.26;
 cloudColour*=mix(0.86,1.06,clamp(grains.g*1.2,0.0,1.0));
 let extinction=mask*smoothstep(0.35,1.0,uniforms.thickness);
 var opacity=1.0-exp(-uniforms.thickness*2.7);
 let horizonFade=smoothstep(-0.02,0.10,dir.y);
 opacity*=mix(0.55,1.0,horizonFade);

 // Stars: two half-turns of the dome are cross-faded, so nothing is rebuilt at midnight.
 let azimuth=atan2(dir.z,dir.x);
 let elevation=asin(clamp(dir.y,-1.0,1.0));
 let spin=uniforms.starAngle;
 let starLevel=starLayer(azimuth,elevation,spin,0.55,vec2f(14.0,7.0),0.45,0.37)
  +starLayer(azimuth,elevation,spin,0.86,vec2f(26.0,13.0),0.95,0.61)
  +starLayer(azimuth,elevation,spin,0.97,vec2f(44.0,22.0),1.80,0.83);
 colour+=starTint(azimuth,elevation)*starLevel*uniforms.starDensity*uniforms.stars*smoothstep(0.0,0.14,dir.y)*(1.0-mask);

 // Cirrus: a second, thinner layer at another scale, drift and colour response.
 let cirrusUV=clamp(vec2f(dir.x,up*1.6+dir.z)*0.62+vec2f(-uniforms.cloudOffset.x*0.55,-uniforms.cloudOffset.y*0.40)+uniforms.morphology*0.08,vec2f(0.05),vec2f(0.95));
 let veil=textureSample(cirrusMap,cirrusMapSampler,cirrusUV);
 let veilShape=smoothstep(0.55,0.24,uniforms.cirrus)*mix(0.42,0.66,cover);
 let veilMask=smoothstep(veilShape,veilShape+0.34,veil.r*0.62+veil.a*0.28+veil.b*0.10)*smoothstep(-0.02,0.09,dir.y);
 let veilLight=clamp(0.36+0.34*sunward+0.30*veil.g,0.0,1.0);
 let veilWarm=mix(vec3f(1.0,0.55,0.28),vec3f(1.0,0.86,0.60),veilLight);
 let veilDusk=mix(mix(vec3f(0.24,0.18,0.32),vec3f(0.55,0.32,0.40),dusk),veilWarm,veilLight);
 var veilColour=mix(vec3f(0.30,0.36,0.48),vec3f(1.0,0.99,0.96),uniforms.daylight);
 veilColour=mix(veilColour,veilDusk,dusk*0.85);
 veilColour*=mix(0.60,1.10,veilLight);
 veilColour=mix(veilColour,vec3f(0.32,0.40,0.58),nightLight*0.7);
 colour=mix(colour,veilColour,veilMask*smoothstep(0.0,0.25,uniforms.cirrus)*0.55);

 // The luminaries first pass behind the veil and then behind the mass, so a dense
 // sky hides them completely instead of leaving a 3% ghost.
 let veilDim=1.0-veilMask*smoothstep(0.0,0.5,uniforms.cirrus)*0.30;
 colour=mix(colour,sunBody,sunDisc*sunVisible*veilDim*(1.0-mask));

 let moonRight=normalize(cross(vec3f(0.0,1.0,0.0),uniforms.lunar));
 let moonUp=cross(uniforms.lunar,moonRight);
 let moonXY=vec2f(dot(dir,moonRight),dot(dir,moonUp))/moonRadius;
 let lunarTex=textureSample(moonMap,moonMapSampler,moonXY*vec2f(0.5,-0.5)+0.5).rgb;
 let relief=sqrt(max(0.0,1.0-dot(moonXY,moonXY)));
 // Weak limb shading and a slight desaturation at the rim: a lit surface on a
 // distant sphere rather than a shaded pearl.
 let lunarShading=0.86+0.14*relief;
 let moonSurface=mix(lunarTex*lunarShading*vec3f(0.93,0.98,1.08),vec3f(0.62,0.67,0.74),clamp(1.0-relief,0.0,1.0)*0.18);
 let moonGlowTight=exp(-moonD*moonD/0.0020)*0.16;
 let moonGlowWide=exp(-moonD*moonD/0.020)*0.09;
 // A thin veil scatters the light: soft halo, weak disc. Dense cloud removes both.
 let moonScatter=1.0+veilMask*1.5+mask*0.6;
 let moonClear=0.30+0.70*(1.0-veilMask*0.6);
 colour+=vec3f(0.60,0.72,1.0)*moonGlowTight*moonVisible*uniforms.moonGlow*veilDim*moonScatter*moonClear;
 colour+=vec3f(0.38,0.52,0.83)*moonGlowWide*moonVisible*uniforms.moonGlow*veilDim*moonScatter*moonClear*0.9;
 colour=mix(colour,moonSurface,moonDisc*moonVisible*veilDim*(1.0-mask));


 fragmentOutputs.color=vec4f(colour,1.0);
}`;

export type NewSkyOptions={atmosphere?:Partial<Atmosphere>;wind?:CloudWind};
/** One pixel, used only until tools/prepare-moon-texture.mjs has produced the disc. */
const BLANK_MOON='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
export type NewSky={
 update:(s:Daylight)=>void;step:(dt:number)=>boolean;configure:(patch:Partial<Atmosphere>)=>void;
 setCloudWind:(azimuth:number,speed:number)=>void;
 settings:()=>Atmosphere;
 diagnostics:()=>({appliedKey:string;moon:string;floats:{coverage:number|null;thickness:number|null;cirrus:number|null}});
 stats:()=>({atmosphere:Atmosphere;clouds:CloudOffset;time:number;wind:CloudWind;moonTexture:string;moonEmbeddedBytes:number});
};export function createNewSky(scene:Scene,camera:Camera,options:NewSkyOptions={}):NewSky{
 const material=new ShaderMaterial('new-sky',scene,{vertex:'newSky',fragment:'newSky'},
  {attributes:['position'],uniforms:['worldViewProjection','zenith','horizon','solar','lunar','stars','starAngle','daylight','sunset','afterglow','coverage','thickness','cirrus','moonScale','moonGlow','starDensity','cloudOffset','morphology','skyTime','skyDepth'],samplers:['cloudMap','cirrusMap','moonMap'],shaderLanguage:ShaderLanguage.WGSL});
 material.setFloat('skyDepth',scene.getEngine().useReverseDepthBuffer?0.000001:0.999999);
 material.backFaceCulling=false;material.disableDepthWrite=true;material.fogEnabled=false;
 const cloudMap=RawTexture.CreateRGBATexture(createCloudLayerPixels(),SKY_LAYER_SIZE,SKY_LAYER_SIZE,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);
 cloudMap.name='sky-cloud-layers';cloudMap.wrapU=cloudMap.wrapV=Texture.WRAP_ADDRESSMODE;
 const cirrusMap=RawTexture.CreateRGBATexture(createCirrusLayerPixels(),SKY_LAYER_SIZE,SKY_LAYER_SIZE,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);
 cirrusMap.name='sky-cirrus-layer';cirrusMap.wrapU=cirrusMap.wrapV=Texture.WRAP_ADDRESSMODE;
 // The painted moon ships inside this chunk: no second request, no 404 to handle, and
 // it keeps working when the site is served from a repository subpath. A blank texture
 // simply means the generator has not produced one yet.
 const moonSource=MOON_TEXTURE_PNG_BASE64?`data:image/png;base64,${MOON_TEXTURE_PNG_BASE64}`:null;
 const moonTexture=new Texture(moonSource??BLANK_MOON,scene,false,false,Texture.TRILINEAR_SAMPLINGMODE);
 moonTexture.name=moonSource?'painted-moon':'blank-moon';
 moonTexture.wrapU=moonTexture.wrapV=Texture.CLAMP_ADDRESSMODE;
 material.setTexture('cloudMap',cloudMap);material.setTexture('cirrusMap',cirrusMap);material.setTexture('moonMap',moonTexture);
 const mesh=CreateSphere('new-sky',{diameter:400,segments:12},scene);mesh.material=material;
 mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;mesh.metadata={environment:true};
 const top=new Color3(),bottom=new Color3(),solar=new Vector3(),lunar=new Vector3(),cloudOffset=new Vector3(),morphology=new Vector3();
 let atmosphere=normalizeAtmosphere(options.atmosphere??{});
 let clouds:CloudOffset={x:0,y:0,shapeX:0,shapeY:0};
 let current:Daylight|null=null,applied='',time=0,appliedKey='';
 const wind:CloudWind=options.wind??{azimuth:Math.PI*0.75,speed:1};
 function update(s:Daylight){
  current=s;
  material.setColor3('zenith',top.set(...s.zenith));material.setColor3('horizon',bottom.set(...s.horizon));
  material.setVector3('solar',solar.set(...s.towardSun));material.setVector3('lunar',lunar.set(...s.towardMoon));
  material.setFloat('stars',s.stars);material.setFloat('starAngle',s.hours/24);
  material.setFloat('daylight',s.daylight);material.setFloat('sunset',s.sunset);material.setFloat('afterglow',s.afterglow);
 }
 /** Reapplies shape/moon inputs even while the clock stands still. */
 function applyAppearance(){
  if(!current)return false;
  const appearance=skyAppearanceAt(current.hours,atmosphere,clouds),key=skyAppearanceKey(appearance);
  if(key===applied)return false;applied=key;appliedKey=key;
  material.setFloat('coverage',appearance.coverage);material.setFloat('thickness',appearance.thickness);
  material.setFloat('cirrus',appearance.cirrus);material.setFloat('moonScale',appearance.moonScale);material.setFloat('moonGlow',appearance.moonGlow);
  material.setVector3('cloudOffset',cloudOffset.set(appearance.cloudX,appearance.cloudY,0));
  material.setVector3('morphology',morphology.set(appearance.morphX,appearance.morphY,0));
  return true;
 }
 /** Advances drift and morph; true only when the sky state visibly moved. */
 function step(dt:number){
  if(!Number.isFinite(dt))return false;
  time+=Math.max(0,Math.min(dt,.1));material.setFloat('skyTime',time);
  clouds=advanceClouds(clouds,wind,atmosphere,dt);
  return applyAppearance();
 }
 /** Cloud drift follows the scene wind when one exists; otherwise it keeps its own. */
 function setCloudWind(azimuth:number,speed:number){
  if(!Number.isFinite(azimuth)||!Number.isFinite(speed))return;
  wind.azimuth=azimuth;wind.speed=Math.max(0,speed);
 }
 function configure(patch:Partial<Atmosphere>){
  atmosphere=normalizeAtmosphere({...atmosphere,...patch});applied='';applyAppearance();
 }
 scene.onBeforeRenderObservable.add(()=>mesh.position.copyFrom(camera.position));
 scene.onDisposeObservable.add(()=>moonTexture.dispose());
 return {update,step,configure,setCloudWind,settings:()=>({...atmosphere}),diagnostics:()=>{const floats=(material as unknown as {_floats?:Record<string,number>})._floats??{};return {appliedKey,moon:moonTexture.name,floats:{coverage:floats.coverage??null,thickness:floats.thickness??null,cirrus:floats.cirrus??null}};},
  stats:()=>({atmosphere:{...atmosphere},clouds:{...clouds},time,wind:{...wind},moonTexture:moonTexture.name,moonEmbeddedBytes:MOON_TEXTURE_PNG_BASE64.length})};
}
