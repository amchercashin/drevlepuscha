import './height-air.ts';
import {showcaseEnabled,showcasePath,showcaseHeight} from '../domain/showcase.ts';
import {ShaderStore} from '@babylonjs/core/Engines/shaderStore.js';
import {PostProcess} from '@babylonjs/core/PostProcesses/postProcess.js';
import {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {Matrix} from '@babylonjs/core/Maths/math.vector.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {Camera} from '@babylonjs/core/Cameras/camera.js';
import type {ShadowGenerator} from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import type {DirectionalLight} from '@babylonjs/core/Lights/directionalLight.js';

// Integrate illuminated air only up to the visible surface, using the same sun
// shadow map as the ground. No camera-facing light cards or screen-space sun disc.
ShaderStore.ShadersStore.forestAirPixelShader=`
precision highp float;
varying vec2 vUV;
uniform sampler2D sceneDepth;
uniform highp sampler2DShadow sunDepth;
uniform mat4 inverseViewProjection;
uniform mat4 sunMatrix;
uniform vec3 eye;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform float halfZ;
uniform float airDensity;
void main(){
 float depth=texture2D(sceneDepth,vUV).r;
 vec4 endPoint=inverseViewProjection*vec4(vUV*2.0-1.0,mix(depth*2.0-1.0,depth,halfZ),1.0);
 vec3 delta=endPoint.xyz/endPoint.w-eye;
 float distanceToSurface=min(length(delta),32.0);
 vec3 direction=normalize(delta);
 float stepLength=distanceToSurface/16.0;
 float litAir=0.0;
 for(int i=0;i<16;i++){
  float t=(float(i)+0.5)*stepLength;
  vec3 p=eye+direction*t;
  vec4 projected=sunMatrix*vec4(p,1.0);
  vec3 ndc=projected.xyz/projected.w;
  vec3 shadowUV=ndc*0.5+0.5;
  shadowUV.z=mix(shadowUV.z,ndc.z,halfZ)-0.001;
  float inside=step(0.02,shadowUV.x)*step(shadowUV.x,0.98)*step(0.02,shadowUV.y)*step(shadowUV.y,0.98);
  float lit=texture(sunDepth,shadowUV)*inside;
  float density=airDensity*exp(-max(p.y-eye.y,0.0)*0.09);
  litAir+=lit*exp(-airDensity*t)*density*stepLength;
 }
 float phase=0.22+0.78*pow(max(0.0,dot(direction,sunDirection)),5.0);
 gl_FragColor=vec4(sunColor*litAir*phase,exp(-airDensity*distanceToSurface*0.22));
}`;
ShaderStore.ShadersStore.forestAirCompositePixelShader=`
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D sceneColor;
void main(){
 vec4 air=texture2D(textureSampler,vUV);
 vec4 surface=texture2D(sceneColor,vUV);
 gl_FragColor=vec4(surface.rgb*air.a+air.rgb,surface.a);
}`;

ShaderStore.ShadersStoreWGSL.forestAirPixelShader=`
varying vUV: vec2f;
var sceneDepth: texture_depth_2d;
var sunDepth: texture_depth_2d;
var sunDepthSampler: sampler_comparison;
uniform inverseViewProjection: mat4x4f;
uniform sunMatrix: mat4x4f;
uniform eye: vec3f;
uniform sunDirection: vec3f;
uniform sunColor: vec3f;
uniform halfZ: f32;
uniform airDensity: f32;
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
 let depth=textureLoad(sceneDepth,vec2i(input.vUV*vec2f(textureDimensions(sceneDepth))),0);
 let endPoint=uniforms.inverseViewProjection*vec4f(input.vUV*2.0-1.0,depth,1.0);
 let delta=endPoint.xyz/endPoint.w-uniforms.eye;
 let distanceToSurface=min(length(delta),32.0);
 let direction=normalize(delta);
 let stepLength=distanceToSurface/16.0;
 var litAir=0.0;
 for(var i=0;i<16;i++){
  let t=(f32(i)+0.5)*stepLength;
  let p=uniforms.eye+direction*t;
  let projected=uniforms.sunMatrix*vec4f(p,1.0);
  let ndc=projected.xyz/projected.w;
  let uv=ndc.xy*0.5+0.5;
  let inside=step(0.02,uv.x)*step(uv.x,0.98)*step(0.02,uv.y)*step(uv.y,0.98);
  let lit=textureSampleCompareLevel(sunDepth,sunDepthSampler,uv,ndc.z-0.001)*inside;
  let density=uniforms.airDensity*exp(-max(p.y-uniforms.eye.y,0.0)*0.09);
  litAir+=lit*exp(-uniforms.airDensity*t)*density*stepLength;
 }
 let phase=0.22+0.78*pow(max(0.0,dot(direction,uniforms.sunDirection)),5.0);
 fragmentOutputs.color=vec4f(uniforms.sunColor*litAir*phase,exp(-uniforms.airDensity*distanceToSurface*0.22));
}`;
ShaderStore.ShadersStoreWGSL.forestAirCompositePixelShader=`
varying vUV: vec2f;
var textureSampler: texture_2d<f32>;
var textureSamplerSampler: sampler;
var sceneColor: texture_2d<f32>;
var sceneColorSampler: sampler;
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
 let air=textureSample(textureSampler,textureSamplerSampler,input.vUV);
 let surface=textureSample(sceneColor,sceneColorSampler,input.vUV);
 fragmentOutputs.color=vec4f(surface.rgb*air.a+air.rgb,surface.a);
}`;

export function createForestAir(scene:Scene,camera:Camera,shadows:ShadowGenerator,sun:DirectionalLight){
 const engine=scene.getEngine(),shaderLanguage=engine.isWebGPU?1:0;
 const scatter=new PostProcess('forest-air',showcaseEnabled?'heightAir':'forestAir',{uniforms:['inverseViewProjection','sunMatrix','eye','sunDirection','sunColor','halfZ','airDensity','rayPower','rayBases'],samplers:showcaseEnabled?['sceneDepth']:['sceneDepth','sunDepth'],size:1,camera,samplingMode:Texture.BILINEAR_SAMPLINGMODE,shaderLanguage});
 const composite=new PostProcess('forest-air-composite','forestAirComposite',{samplers:['sceneColor'],size:0.5,camera,samplingMode:Texture.BILINEAR_SAMPLINGMODE,shaderLanguage});
 // Post-process sizes describe INPUT targets: full-resolution scene colour/depth
 // enter scatter, whose output goes directly into composite's half-size input.
 scatter.onSizeChangedObservable.add(()=>scatter.inputTexture.createDepthStencilTexture(0,false,false,1));
 const inverse=Matrix.Identity();let rays=false;
 // Fixed authored openings: never repositioned with the camera or the walker.
 const rayBases=[12,42,85,157].flatMap((n,i)=>{const e=showcasePath(n)+(i%2?4:-4);return [e,showcaseHeight(e,n),-n,1.1];});
 const airDensity=()=>scene.fogDensity<=0?0:scene.fogDensity>0.01?0.035:0.018;
 scatter.onApply=effect=>{
  scene.getTransformMatrix().invertToRef(inverse);
  effect.setMatrix('inverseViewProjection',inverse);if(!showcaseEnabled)effect.setMatrix('sunMatrix',shadows.getTransformMatrix());
  effect.setVector3('eye',camera.globalPosition);effect.setVector3('sunDirection',sun.direction.normalizeToNew().negate());
  effect.setFloat3('sunColor',sun.diffuse.r*sun.intensity,sun.diffuse.g*sun.intensity,sun.diffuse.b*sun.intensity);
  effect.setFloat('halfZ',engine.isNDCHalfZRange?1:0);effect.setFloat('airDensity',airDensity());
  if(showcaseEnabled){effect.setArray4('rayBases',rayBases);effect.setFloat('rayPower',rays?.055:0);}
  effect._bindTexture('sceneDepth',scatter.inputTexture.depthStencilTexture);if(!showcaseEnabled)effect.setDepthStencilTexture('sunDepth',shadows.getShadowMap());
 };
 composite.onApply=effect=>effect.setTextureFromPostProcess('sceneColor',scatter);
 return {setRays:(enabled:boolean)=>{rays=enabled;},stats:()=>({raysEnabled:rays,analyticBeams:showcaseEnabled&&rays?4:0,method:showcaseEnabled?'stable-height-haze':'shadowed-air',density:airDensity(),steps:showcaseEnabled?0:16,heightOriginM:showcaseEnabled?4:null,maxDistanceM:32,scale:0.5,extraGeometryPasses:0})};
}
