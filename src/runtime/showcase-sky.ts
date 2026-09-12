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
import {createCloudPixels,createMoonPixels,SKY_TEXTURE_SIZE} from '../domain/sky-textures.ts';

ShaderStore.ShadersStoreWGSL.showcaseSkyVertexShader=`
attribute position:vec3f;uniform worldViewProjection:mat4x4f;uniform skyDepth:f32;varying skyDirection:vec3f;
@vertex fn main(input:VertexInputs)->FragmentInputs {
 vertexOutputs.skyDirection=vertexInputs.position;
 var clip=uniforms.worldViewProjection*vec4f(vertexInputs.position,1.0);
 clip.z=clip.w*uniforms.skyDepth;vertexOutputs.position=clip;
}`;

// One opaque sky draw, three cloud samples and one lunar sample. No screen buffers,
// transparent cloud geometry, ray marching, extra lights or animated texture uploads.
ShaderStore.ShadersStoreWGSL.showcaseSkyPixelShader=`
varying skyDirection:vec3f;
uniform zenith:vec3f;uniform horizon:vec3f;uniform solar:vec3f;uniform lunar:vec3f;
uniform stars:f32;uniform starAngle:f32;uniform daylight:f32;uniform sunset:f32;uniform wind:f32;
var cloudMap:texture_2d<f32>;var cloudMapSampler:sampler;
var moonMap:texture_2d<f32>;var moonMapSampler:sampler;
@fragment fn main(input:FragmentInputs)->FragmentOutputs {
 let dir=normalize(fragmentInputs.skyDirection);
 let up=max(dir.y,0.0);
 let sunset=uniforms.sunset;
 let sunD=length(dir-uniforms.solar);
 let moonD=length(dir-uniforms.lunar);
 let sunAA=max(fwidth(sunD),0.0003);
 let moonAA=max(fwidth(moonD),0.0003);
 let horizonMask=smoothstep(-0.035,0.015,dir.y);
 let sunVisible=smoothstep(-0.085,0.005,uniforms.solar.y)*horizonMask;
 let moonVisible=smoothstep(-0.085,0.005,uniforms.lunar.y)*horizonMask;
 let sunRadius=mix(0.031,0.048,1.0-smoothstep(0.0,0.32,abs(uniforms.solar.y)));
 let moonRadius=mix(0.040,0.052,1.0-smoothstep(0.0,0.30,abs(uniforms.lunar.y)));
 let sunDisc=1.0-smoothstep(sunRadius-sunAA,sunRadius+sunAA,sunD);
 let moonDisc=1.0-smoothstep(moonRadius-moonAA,moonRadius+moonAA,moonD);
 let sunward=pow(max(0.0,dot(dir,uniforms.solar)),4.0);
 let twilight=(1.0-smoothstep(0.0,0.30,abs(uniforms.solar.y)));
 let top=mix(uniforms.zenith,vec3f(0.16,0.12,0.29),sunset*0.60);
 let horizon=mix(uniforms.horizon,vec3f(0.80,0.26,0.19),sunset*0.70);
 var colour=mix(horizon,top,pow(up,0.48));
 // Low amber band, then rose/violet above it. The strongest colours follow the sun.
 colour+=vec3f(0.43,0.12,0.035)*exp(-up*7.0)*sunward*sunset;
 colour=mix(colour,vec3f(0.53,0.20,0.36),exp(-pow((up-0.18)/0.15,2.0))*sunset*(0.12+0.25*sunward));
 colour+=vec3f(0.28,0.12,0.15)*twilight*exp(-up*9.0)*(1.0-uniforms.daylight)*0.3;
 let sunTint=mix(vec3f(1.0,0.91,0.66),vec3f(1.0,0.29,0.09),sunset);
 let halo=exp(-sunD*sunD/0.055)*0.23+exp(-sunD*sunD/0.005)*0.48;
 colour+=sunTint*halo*sunVisible;
 // A white-hot core and compact aureole simulate glare locally, respecting forest occlusion.
 let corona=exp(-max(0.0,sunD-sunRadius)*65.0)*0.48;
 colour+=sunTint*corona*sunVisible;
 let vertical=clamp((dir.y-uniforms.solar.y)/sunRadius*0.5+0.5,0.0,1.0);
 let sunsetDisc=mix(vec3f(1.0,0.16,0.09),vec3f(1.0,0.78,0.32),vertical);
 colour=mix(colour,mix(vec3f(1.65,1.52,1.20),sunsetDisc,sunset*0.92),sunDisc*sunVisible);

 let moonRight=normalize(cross(vec3f(0.0,1.0,0.0),uniforms.lunar));
 let moonUp=cross(uniforms.lunar,moonRight);
 let moonXY=vec2f(dot(dir,moonRight),dot(dir,moonUp))/moonRadius;
 let lunarTex=textureSample(moonMap,moonMapSampler,moonXY*vec2f(0.5,-0.5)+0.5).rgb;
 let relief=sqrt(max(0.0,1.0-dot(moonXY,moonXY)));
 let lunarShading=0.52+0.48*relief;
 colour+=vec3f(0.38,0.52,0.83)*exp(-moonD*moonD/0.014)*0.10*moonVisible;
 colour+=vec3f(0.60,0.72,1.0)*exp(-moonD*moonD/0.0028)*0.12*moonVisible;
 colour=mix(colour,lunarTex*lunarShading*vec3f(0.91,0.97,1.10),moonDisc*moonVisible);

 let starUV=vec2f(atan2(dir.z,dir.x)/6.2831853+0.5+uniforms.starAngle,acos(clamp(dir.y,-1.0,1.0))/3.14159265);
 let q=starUV*vec2f(360.0,180.0);let cell=floor(q);
 let seed=fract(sin(dot(cell,vec2f(127.1,311.7)))*43758.5453);
 let offset=vec2f(fract(seed*91.13),fract(seed*173.17))*0.65+0.175;
 let starD=length(fract(q)-offset);let aa=max(length(fwidth(q))*0.55,0.025);
 let point=1.0-smoothstep(0.045,0.045+aa,starD);
 colour+=vec3f(0.77,0.84,1.0)*point*step(0.976,seed)*uniforms.stars*smoothstep(0.0,0.15,dir.y)*(0.4+fract(seed*741.0)*0.6)*(1.0-moonDisc);

 // Project a high cloud layer onto the dome; mipmaps filter the compressed horizon.
 let cloudUV=dir.xz/(max(dir.y,0.0)+0.18)*0.65+vec2f(uniforms.wind,uniforms.wind*0.37);
 let base=textureSample(cloudMap,cloudMapSampler,cloudUV);
 let detail=textureSample(cloudMap,cloudMapSampler,cloudUV*3.1+vec2f(0.17,-uniforms.wind*0.23));
 let lightOffset=uniforms.solar.xz*0.008;
 let neighbour=textureSample(cloudMap,cloudMapSampler,cloudUV+lightOffset).r;
 let density=base.r*0.83+detail.r*0.17;
 let coverage=smoothstep(0.51,0.65,density)*smoothstep(-0.015,0.09,dir.y);
 let depth=smoothstep(0.52,0.73,density);
 let sculpt=clamp(0.50+(base.r-neighbour)*9.0+detail.g*0.14,0.0,1.0);
 let cloudShade=mix(vec3f(0.055,0.072,0.12),vec3f(0.42,0.52,0.60),uniforms.daylight);
 let cloudLight=mix(vec3f(0.18,0.23,0.34),vec3f(1.0,0.97,0.88),uniforms.daylight);
 let warmShade=mix(cloudShade,vec3f(0.28,0.16,0.30),sunset*0.80);
 let warmLight=mix(cloudLight,vec3f(1.0,0.48,0.24),sunset*(0.45+sunward*0.55));
 var cloudColour=mix(warmShade,warmLight,clamp(sculpt*0.8+(1.0-depth)*0.30,0.0,1.0));
 let silver=pow(max(0.0,1.0-abs(coverage-0.45)*2.0),3.0);
 cloudColour+=sunTint*silver*exp(-sunD*sunD/0.12)*sunVisible*0.50;
 cloudColour+=vec3f(0.22,0.30,0.47)*silver*exp(-moonD*moonD/0.14)*moonVisible*0.30;
 colour=mix(colour,cloudColour,coverage*0.97);
 fragmentOutputs.color=vec4f(colour,1.0);
}`;

export function createShowcaseSky(scene:Scene,camera:Camera){
 const material=new ShaderMaterial('showcase-sky',scene,{vertex:'showcaseSky',fragment:'showcaseSky'},
  {attributes:['position'],uniforms:['worldViewProjection','zenith','horizon','solar','lunar','stars','starAngle','daylight','sunset','wind','skyDepth'],samplers:['cloudMap','moonMap'],shaderLanguage:ShaderLanguage.WGSL});
 material.setFloat('skyDepth',scene.getEngine().useReverseDepthBuffer?0.000001:0.999999);
 material.backFaceCulling=false;material.disableDepthWrite=true;material.fogEnabled=false;
 const clouds=RawTexture.CreateRGBATexture(createCloudPixels(),SKY_TEXTURE_SIZE,SKY_TEXTURE_SIZE,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);
 clouds.name='procedural-clouds';clouds.wrapU=clouds.wrapV=Texture.WRAP_ADDRESSMODE;
 const moon=RawTexture.CreateRGBATexture(createMoonPixels(),SKY_TEXTURE_SIZE,SKY_TEXTURE_SIZE,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);
 moon.name='procedural-moon';moon.wrapU=moon.wrapV=Texture.CLAMP_ADDRESSMODE;
 material.setTexture('cloudMap',clouds);material.setTexture('moonMap',moon);material.setFloat('wind',0);
 const mesh=CreateSphere('showcase-sky',{diameter:400,segments:12},scene);mesh.material=material;
 mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;mesh.metadata={environment:true};
 const top=new Color3(),bottom=new Color3(),solar=new Vector3(),lunar=new Vector3();
 let wind=0;
 function update(s:Daylight){
  material.setColor3('zenith',top.set(...s.zenith));material.setColor3('horizon',bottom.set(...s.horizon));
  material.setVector3('solar',solar.set(...s.towardSun));material.setVector3('lunar',lunar.set(...s.towardMoon));
  material.setFloat('stars',s.stars);material.setFloat('starAngle',s.hours/24);
  material.setFloat('daylight',s.daylight);material.setFloat('sunset',s.sunset);
 }
 function animate(dt:number){wind+=Math.max(0,Math.min(dt,.05))*.0014;material.setFloat('wind',wind);}
 scene.onBeforeRenderObservable.add(()=>mesh.position.copyFrom(camera.position));
 return {update,animate,mesh};
}
