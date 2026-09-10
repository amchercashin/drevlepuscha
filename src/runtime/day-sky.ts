import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import {ShaderStore} from '@babylonjs/core/Engines/shaderStore.js';
import {ShaderMaterial} from '@babylonjs/core/Materials/shaderMaterial.js';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {Camera} from '@babylonjs/core/Cameras/camera.js';
import type {Daylight} from '../domain/daylight.ts';

ShaderStore.ShadersStore.daySkyVertexShader=`
precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 skyDirection;
void main(){skyDirection=position;gl_Position=worldViewProjection*vec4(position,1.0);gl_Position.z=gl_Position.w*0.999999;}`;
ShaderStore.ShadersStoreWGSL.daySkyVertexShader=`
attribute position:vec3f;uniform worldViewProjection:mat4x4f;varying skyDirection:vec3f;
@vertex fn main(input:VertexInputs)->FragmentInputs {
 vertexOutputs.skyDirection=vertexInputs.position;
 var clip=uniforms.worldViewProjection*vec4f(vertexInputs.position,1.0);
 clip.z=clip.w*0.999999;vertexOutputs.position=clip;
}`;
/** One sky draw: no cube textures, star lights, bloom or atmosphere ray march. */
function fragment(wgsl:boolean){
 const u=wgsl?'uniforms.':'',v2=wgsl?'vec2f':'vec2',v3=wgsl?'vec3f':'vec3';
 const d=(name:string,value:string,type='float',mutable=false)=>wgsl?`${mutable?'var':'let'} ${name}=${value};`:`${type} ${name}=${value};`;
 const declarations=wgsl?`varying skyDirection:vec3f;uniform zenith:vec3f;uniform horizon:vec3f;uniform solar:vec3f;uniform lunar:vec3f;uniform stars:f32;uniform starAngle:f32;uniform daylight:f32;`:`precision highp float;varying vec3 skyDirection;uniform vec3 zenith,horizon,solar,lunar;uniform float stars,starAngle,daylight;`;
 return declarations+(wgsl?'@fragment fn main(input:FragmentInputs)->FragmentOutputs {':'void main(){')+`
 ${d('dir',`normalize(${wgsl?'fragmentInputs.':''}skyDirection)`,'vec3')}
 ${d('up','clamp(dir.y,0.0,1.0)')}
 ${d('colour',`mix(${u}horizon,${u}zenith,pow(up,0.45))`,'vec3',true)}
 ${d('sunD',`length(dir-${u}solar)`)}
 ${d('moonD',`length(dir-${u}lunar)`)}
 ${d('sunAA','max(fwidth(sunD),0.0005)')}
 ${d('moonAA','max(fwidth(moonD),0.0005)')}
 ${d('sunDisc','1.0-smoothstep(0.012-sunAA,0.012+sunAA,sunD)')}
 ${d('moonDisc','1.0-smoothstep(0.015-moonAA,0.015+moonAA,moonD)')}
 ${d('solarVisible',`smoothstep(-0.025,0.01,${u}solar.y)`)}
 ${d('lunarVisible',`smoothstep(-0.025,0.01,${u}lunar.y)`)}
 ${d('sunward',`max(0.0,dot(normalize(${v2}(dir.x,dir.z)),normalize(${v2}(${u}solar.x,${u}solar.z))))`)}
 ${d('opening',`pow(sunward,3.5)*exp(-up*2.6)*solarVisible*${u}daylight`)}
 ${d('pathward','max(0.0,-dir.z)')}
 ${d('clearing',`pow(pathward,5.0)*exp(-up*2.0)*${u}daylight`)}
 colour+=${v3}(1.0,0.88,0.50)*opening*0.30;
 colour+=${v3}(1.0,0.94,0.72)*clearing*0.16;
 colour+=${v3}(1.0,0.78,0.42)*(exp(-sunD*6.5)*0.22+exp(-sunD*20.0)*0.11)*solarVisible;
 colour=mix(colour,${v3}(1.0,0.94,0.72),sunDisc*solarVisible);
 ${d('moonMottle','0.87+0.08*sin(dir.x*910.0+dir.z*230.0)*sin(dir.y*670.0-dir.z*320.0)')}
 colour+=${v3}(0.48,0.60,0.83)*exp(-moonD*45.0)*0.06*lunarVisible;
 colour=mix(colour,${v3}(0.82,0.88,0.91)*moonMottle,moonDisc*lunarVisible);
 ${d('uv',`${v2}(${wgsl?'atan2(dir.z,dir.x)':'atan(dir.z,dir.x)'}/6.2831853+0.5+${u}starAngle,acos(clamp(dir.y,-1.0,1.0))/3.14159265)`,'vec2')}
 ${d('q',`uv*${v2}(360.0,180.0)`,'vec2')}
 ${d('cell','floor(q)','vec2')}
 ${d('seed',`fract(sin(dot(cell,${v2}(127.1,311.7)))*43758.5453)`)}
 ${d('offset',`${v2}(fract(seed*91.13),fract(seed*173.17))*0.65+0.175`,'vec2')}
 ${d('starD','length(fract(q)-offset)')}
 ${d('aa','max(length(fwidth(q))*0.55,0.025)')}
 ${d('point','1.0-smoothstep(0.045,0.045+aa,starD)')}
 colour+=${v3}(0.77,0.84,1.0)*point*step(0.976,seed)*${u}stars*smoothstep(0.0,0.15,dir.y)*(0.4+fract(seed*741.0)*0.6)*(1.0-moonDisc);
 ${wgsl?'fragmentOutputs.color=vec4f(colour,1.0);':'gl_FragColor=vec4(colour,1.0);'}
 }`;
}
ShaderStore.ShadersStore.daySkyPixelShader=fragment(false);
ShaderStore.ShadersStoreWGSL.daySkyPixelShader=fragment(true);
export function createDaySky(scene:Scene,camera:Camera){
 const material=new ShaderMaterial('day-sky',scene,{vertex:'daySky',fragment:'daySky'},
  {attributes:['position'],uniforms:['worldViewProjection','zenith','horizon','solar','lunar','stars','starAngle','daylight'],shaderLanguage:scene.getEngine().isWebGPU?1:0});
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
