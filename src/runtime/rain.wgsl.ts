import '@babylonjs/core/ShadersWGSL/ShadersInclude/instancesDeclaration.js';
export const rainVertex=`
attribute position:vec3f;attribute rainColumn:vec4f;attribute rainMotion:vec4f;
#include<instancesDeclaration>
uniform viewProjection:mat4x4f;uniform eye:vec3f;uniform cameraRight:vec3f;
uniform rainTime:f32;uniform precipitation:f32;
varying dropUV:vec2f;varying dropWorld:vec3f;varying dropFloor:f32;varying dropAlpha:f32;
@vertex fn main(input:VertexInputs)->FragmentInputs {
 let column=vertexInputs.rainColumn;let motion=vertexInputs.rainMotion;
 let phase=fract(uniforms.rainTime*motion.y/256.0+motion.x);
 let y=column.z+(1.0-phase)*24.0;
 let world=vec3f(column.x,y,column.y)+uniforms.cameraRight*vertexInputs.position.x*0.035+vec3f(0.0,vertexInputs.position.y*motion.z,0.0);
 let distance=length(world.xz-uniforms.eye.xz);
 let radial=1.0-smoothstep(12.0,16.0,distance);
 let respawn=smoothstep(0.0,0.055,phase)*(1.0-smoothstep(0.92,1.0,phase));
 let amount=smoothstep(motion.w,motion.w+0.08,uniforms.precipitation);
 vertexOutputs.dropUV=vertexInputs.position.xy+0.5;vertexOutputs.dropWorld=world;vertexOutputs.dropFloor=column.w;
 vertexOutputs.dropAlpha=radial*respawn*amount;
 vertexOutputs.position=uniforms.viewProjection*vec4f(world,1.0);
}`;
export const rainFragment=`
varying dropUV:vec2f;varying dropWorld:vec3f;varying dropFloor:f32;varying dropAlpha:f32;
uniform rainColour:vec3f;uniform eye:vec3f;uniform fogDensity:f32;
@fragment fn main(input:FragmentInputs)->FragmentOutputs {
 if(fragmentInputs.dropWorld.y<fragmentInputs.dropFloor){discard;}
 let uv=fragmentInputs.dropUV;
 let width=1.0-smoothstep(0.12,0.5,abs(uv.x-0.5));
 let ends=smoothstep(0.0,0.15,uv.y)*(1.0-smoothstep(0.7,1.0,uv.y));
 let haze=exp(-uniforms.fogDensity*length(fragmentInputs.dropWorld-uniforms.eye));
 fragmentOutputs.color=vec4f(uniforms.rainColour,width*ends*fragmentInputs.dropAlpha*haze*0.52);
}`;
