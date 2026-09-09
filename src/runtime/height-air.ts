import {rayDeclarations,rayContribution} from './day-rays.ts';
import {ShaderStore} from '@babylonjs/core/Engines/shaderStore.js';
// Analytic, stationary height fog. No moving shadow-map samples, wind or screen-space noise.
ShaderStore.ShadersStore.heightAirPixelShader=`
precision highp float;
varying vec2 vUV;
uniform sampler2D sceneDepth;
uniform mat4 inverseViewProjection;
uniform vec3 eye;uniform vec3 sunDirection;uniform vec3 sunColor;
uniform float halfZ;uniform float airDensity;
${rayDeclarations(false)}
void main(){
 float depth=texture2D(sceneDepth,vUV).r;
 vec4 endPoint=inverseViewProjection*vec4(vUV*2.0-1.0,mix(depth*2.0-1.0,depth,halfZ),1.0);
 vec3 delta=endPoint.xyz/endPoint.w-eye;
 float rayLength=min(length(delta),32.0);vec3 direction=normalize(delta);
 float lo=min(eye.y,eye.y+direction.y*rayLength),hi=max(eye.y,eye.y+direction.y*rayLength);
 float span=hi-lo;
 float meanDensity=exp(-max((lo+hi)*0.5-4.0,0.0)*0.09);
 if(span>0.001){
  float below=max(0.0,min(hi,4.0)-lo);
  float above=(exp(-max(lo-4.0,0.0)*0.09)-exp(-max(hi-4.0,0.0)*0.09))/0.09;
  meanDensity=(below+above)/span;
 }
 float optical=airDensity*rayLength*meanDensity;
 float phase=0.22+0.78*pow(max(0.0,dot(direction,sunDirection)),5.0);
 ${rayContribution(false)}
 gl_FragColor=vec4(shaftColour+sunColor*(1.0-exp(-optical))*0.28*phase,exp(-optical*0.22));
}`;
ShaderStore.ShadersStoreWGSL.heightAirPixelShader=`
varying vUV: vec2f;var sceneDepth: texture_depth_2d;
uniform inverseViewProjection: mat4x4f;
uniform eye: vec3f;uniform sunDirection: vec3f;uniform sunColor: vec3f;
uniform halfZ: f32;uniform airDensity: f32;
${rayDeclarations(true)}
@fragment
fn main(input: FragmentInputs)->FragmentOutputs {
 let pixel=clamp(vec2i(input.vUV*vec2f(textureDimensions(sceneDepth))),vec2i(0),vec2i(textureDimensions(sceneDepth))-vec2i(1));
 let depth=textureLoad(sceneDepth,pixel,0);
 let endPoint=uniforms.inverseViewProjection*vec4f(input.vUV*2.0-1.0,depth,1.0);
 let delta=endPoint.xyz/endPoint.w-uniforms.eye;
 let rayLength=min(length(delta),32.0);let direction=normalize(delta);
 let lo=min(uniforms.eye.y,uniforms.eye.y+direction.y*rayLength);let hi=max(uniforms.eye.y,uniforms.eye.y+direction.y*rayLength);
 let span=hi-lo;
 var meanDensity=exp(-max((lo+hi)*0.5-4.0,0.0)*0.09);
 if(span>0.001){
  let below=max(0.0,min(hi,4.0)-lo);
  let above=(exp(-max(lo-4.0,0.0)*0.09)-exp(-max(hi-4.0,0.0)*0.09))/0.09;
  meanDensity=(below+above)/span;
 }
 let optical=uniforms.airDensity*rayLength*meanDensity;
 let phase=0.22+0.78*pow(max(0.0,dot(direction,uniforms.sunDirection)),5.0);
 ${rayContribution(true)}
 fragmentOutputs.color=vec4f(shaftColour+uniforms.sunColor*(1.0-exp(-optical))*0.28*phase,exp(-optical*0.22));
}`;
