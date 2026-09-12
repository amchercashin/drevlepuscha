import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import {ShaderStore} from '@babylonjs/core/Engines/shaderStore.js';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial.js';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {Camera} from '@babylonjs/core/Cameras/camera.js';
import type {Daylight} from '../domain/daylight.ts';

ShaderStore.ShadersStoreWGSL.daySkyVertexShader=`
attribute position:vec3f;uniform worldViewProjection:mat4x4f;uniform skyDepth:f32;varying skyDirection:vec3f;
@vertex fn main(input:VertexInputs)->FragmentInputs {
 vertexOutputs.skyDirection=vertexInputs.position;
 var clip=uniforms.worldViewProjection*vec4f(vertexInputs.position,1.0);
 clip.z=clip.w*uniforms.skyDepth;vertexOutputs.position=clip;
}`;
/** One sky draw: no cube textures, star lights, bloom or atmosphere ray march. */

ShaderStore.ShadersStoreWGSL.daySkyPixelShader=`varying skyDirection:vec3f;uniform zenith:vec3f;uniform horizon:vec3f;uniform solar:vec3f;uniform lunar:vec3f;uniform stars:f32;uniform starAngle:f32;uniform daylight:f32;@fragment fn main(input:FragmentInputs)->FragmentOutputs {
 let dir=normalize(fragmentInputs.skyDirection);
 let up=clamp(dir.y,0.0,1.0);
 var colour=mix(uniforms.horizon,uniforms.zenith,pow(up,0.45));
 let sunD=length(dir-uniforms.solar);
 let moonD=length(dir-uniforms.lunar);
 let sunAA=max(fwidth(sunD),0.0005);
 let moonAA=max(fwidth(moonD),0.0005);
 let sunDisc=1.0-smoothstep(0.012-sunAA,0.012+sunAA,sunD);
 let moonDisc=1.0-smoothstep(0.015-moonAA,0.015+moonAA,moonD);
 let solarVisible=smoothstep(-0.025,0.01,uniforms.solar.y);
 let lunarVisible=smoothstep(-0.025,0.01,uniforms.lunar.y);
 let sunward=max(0.0,dot(normalize(vec2f(dir.x,dir.z)),normalize(vec2f(uniforms.solar.x,uniforms.solar.z))));
 let opening=pow(sunward,3.5)*exp(-up*2.6)*solarVisible*uniforms.daylight;
 let pathward=max(0.0,-dir.z);
 let clearing=pow(pathward,5.0)*exp(-up*2.0)*uniforms.daylight;
 colour+=vec3f(1.0,0.88,0.50)*opening*0.30;
 colour+=vec3f(1.0,0.94,0.72)*clearing*0.16;
 colour+=vec3f(1.0,0.78,0.42)*(exp(-sunD*6.5)*0.22+exp(-sunD*20.0)*0.11)*solarVisible;
 colour=mix(colour,vec3f(1.0,0.94,0.72),sunDisc*solarVisible);
 let moonMottle=0.87+0.08*sin(dir.x*910.0+dir.z*230.0)*sin(dir.y*670.0-dir.z*320.0);
 colour+=vec3f(0.48,0.60,0.83)*exp(-moonD*45.0)*0.06*lunarVisible;
 colour=mix(colour,vec3f(0.82,0.88,0.91)*moonMottle,moonDisc*lunarVisible);
 let uv=vec2f(atan2(dir.z,dir.x)/6.2831853+0.5+uniforms.starAngle,acos(clamp(dir.y,-1.0,1.0))/3.14159265);
 let q=uv*vec2f(360.0,180.0);
 let cell=floor(q);
 let seed=fract(sin(dot(cell,vec2f(127.1,311.7)))*43758.5453);
 let offset=vec2f(fract(seed*91.13),fract(seed*173.17))*0.65+0.175;
 let starD=length(fract(q)-offset);
 let aa=max(length(fwidth(q))*0.55,0.025);
 let point=1.0-smoothstep(0.045,0.045+aa,starD);
 colour+=vec3f(0.77,0.84,1.0)*point*step(0.976,seed)*uniforms.stars*smoothstep(0.0,0.15,dir.y)*(0.4+fract(seed*741.0)*0.6)*(1.0-moonDisc);
 fragmentOutputs.color=vec4f(colour,1.0);
 }`;
export function createDaySky(scene:Scene,camera:Camera){
 const material=new ShaderMaterial('day-sky',scene,{vertex:'daySky',fragment:'daySky'},
  {attributes:['position'],uniforms:['worldViewProjection','zenith','horizon','solar','lunar','stars','starAngle','daylight','skyDepth'],shaderLanguage:ShaderLanguage.WGSL});
 material.setFloat('skyDepth',scene.getEngine().useReverseDepthBuffer?(0.000001):0.999999);
 material.backFaceCulling=false;material.disableDepthWrite=true;material.fogEnabled=false;
 const sky=CreateSphere('day-sky',{diameter:400,segments:12},scene);sky.material=material;
 sky.isPickable=false;sky.alwaysSelectAsActiveMesh=true;sky.metadata={environment:true};
 const top=new Color3(),bottom=new Color3(),solar=new Vector3(),lunar=new Vector3();
 function update(s:Daylight){
  material.setColor3('zenith',top.set(...s.zenith));material.setColor3('horizon',bottom.set(...s.horizon));
  material.setVector3('solar',solar.set(...s.towardSun));material.setVector3('lunar',lunar.set(...s.towardMoon));
  material.setFloat('stars',s.stars);material.setFloat('starAngle',s.hours/24);material.setFloat('daylight',s.daylight);
 }
 scene.onBeforeRenderObservable.add(()=>sky.position.copyFrom(camera.position));
 return {update,mesh:sky};
}
