import type {MaterialPlugin,StandardMaterialProps} from '@babylonjs/lite';
import type {Point3} from '../domain/harness.ts';
import {showcasePath} from '../domain/showcase.ts';

function f32(data:Float32Array,offsets:ReadonlyMap<string,number>,name:string,values:number[]){
 const base=(offsets.get(name)??0)/4;
 for(let i=0;i<values.length;i++)data[base+i]=values[i];
}

/** World-sized soil/moss masses and the trail. Applied after lighting (Lite has no BJS UPDATE_DIFFUSE slot after albedo). */
export function soilPatternPlugin():MaterialPlugin{
 return {
  name:'SoilPattern',priority:215,
  getCustomCode(type){if(type!=='fragment')return null;return {CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR:`
   let e=input.vp.x;let n=-input.vp.z;
   let moss=0.5+0.25*sin(e*0.38+n*0.23)+0.25*sin(e*0.17-n*0.42);
   let edge=abs(e-(17.0*sin(n*0.019)+6.0*sin(n*0.047)))+0.12*sin(n*3.1+e*1.5);
   let path=1.0-smoothstep(1.0,2.1,edge);
   let soil=mix(vec3<f32>(0.22,0.34,0.29),vec3<f32>(0.20,0.40,0.32),moss);
   let dirt=mix(soil,vec3<f32>(0.64,0.56,0.39),path);
   let grain=dot(color.rgb,vec3<f32>(0.30,0.59,0.11));
   color=vec4<f32>(mix(color.rgb*1.4,dirt*(0.65+grain),0.65),color.a);
  `};},
 };
}

/** Per-instance RGB stores 0.5+tone; Standard also multiplies instance color, so undo that multiply. */
export function treeTonePlugin():MaterialPlugin{
 return {
  name:'TreeTone',priority:210,
  getCustomCode(type){if(type!=='fragment')return null;return {CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR:`
   let inst=input.vInstanceColor;
   let tone=inst.rgb-vec3<f32>(0.5);
   let leaf=smoothstep(0.035,0.12,color.g-color.r);
   let luminance=dot(color.rgb,vec3<f32>(0.2126,0.7152,0.0722));
   let hue=vec3<f32>(1.0+tone.y*1.0,1.0+tone.y*0.22,1.0-tone.y*0.9);
   let tint=mix(vec3<f32>(1.0),hue,leaf)*(1.0+tone.x*mix(0.45,1.0,leaf));
   let varied=mix(vec3<f32>(luminance),color.rgb,1.0+tone.z*leaf)*tint;
   let undone=color.rgb/max(inst.rgb,vec3<f32>(0.08));
   color=vec4<f32>(mix(undone,varied,1.0),color.a);
  `};},
 };
}

export function leafTransmissionPlugin(sun:{direction:{x:number;y:number;z:number};diffuse:[number,number,number];intensity:number}):MaterialPlugin{
 return {
  name:'LeafTransmission',priority:230,dynamic:true,
  getUniforms(){return {ubo:[{name:'leafSunDirection',type:'vec3<f32>'},{name:'leafSunColor',type:'vec3<f32>'}]};},
  writeUbo(data,offsets){
   const l=Math.hypot(sun.direction.x,sun.direction.y,sun.direction.z)||1;
   f32(data,offsets,'leafSunDirection',[-sun.direction.x/l,-sun.direction.y/l,-sun.direction.z/l]);
   f32(data,offsets,'leafSunColor',[sun.diffuse[0]*sun.intensity,sun.diffuse[1]*sun.intensity,sun.diffuse[2]*sun.intensity]);
  },
  getCustomCode(type){if(type!=='fragment')return null;return {CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR:`
   let foliage=smoothstep(0.025,0.11,color.g-color.r);
   let forwardScatter=pow(max(0.0,dot(-viewDirectionW,pluginUbo.leafSunDirection)),5.0);
   let thinEdge=pow(1.0-abs(dot(normalW,viewDirectionW)),1.5);
   let backlit=0.25+0.75*max(0.0,dot(-normalW,pluginUbo.leafSunDirection));
   let transmitted=foliage*forwardScatter*backlit*(0.12+0.55*thinEdge);
   color=vec4<f32>(color.rgb+vec3<f32>(0.68,0.86,0.24)*pluginUbo.leafSunColor*transmitted,color.a);
  `};},
 };
}

/** Distant procedural shade, applied only outside the shadow-map footprint. */
export function canopyShadePlugin(matrix:Float32Array):MaterialPlugin{
 return {
  name:'CanopyShade',priority:240,dynamic:true,
  getUniforms(){return {ubo:[{name:'canopySunMatrix',type:'mat4x4<f32>'}]};},
  writeUbo(data,offsets){f32(data,offsets,'canopySunMatrix',[...matrix]);},
  getCustomCode(type){if(type!=='fragment')return null;return {CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR:`
   let canopyPosition=input.vp;
   let canopyDensity=0.68+0.20*sin(canopyPosition.x*0.31+canopyPosition.z*0.19)*sin(canopyPosition.z*0.27-canopyPosition.x*0.13);
   let terrain=3.2*smoothstep(32.0,47.0,-canopyPosition.z)+0.18*sin(canopyPosition.x*0.2)*sin(-canopyPosition.z*0.14);
   let canopyHeight=canopyPosition.y-terrain;
   let canopyVisibility=1.0-0.72*canopyDensity*(1.0-smoothstep(5.0,14.0,canopyHeight));
   let canopyProjected=pluginUbo.canopySunMatrix*vec4<f32>(canopyPosition,1.0);
   let canopyEdge=max(abs(canopyProjected.x/canopyProjected.w),abs(canopyProjected.y/canopyProjected.w));
   let canopyBlend=smoothstep(0.55,0.90,canopyEdge);
   color=vec4<f32>(color.rgb*mix(1.0,canopyVisibility,canopyBlend),color.a);
  `};},
 };
}

export function coverFadePlugin(feet:Point3,start:number,end:number):MaterialPlugin{
 return {
  name:'CoverFade',priority:220,dynamic:true,
  getUniforms(){return {ubo:[{name:'coverFeet',type:'vec3<f32>'},{name:'coverRange',type:'vec2<f32>'}]};},
  writeUbo(data,offsets){
   f32(data,offsets,'coverFeet',[feet.x,feet.y,feet.z]);
   f32(data,offsets,'coverRange',[start,end]);
  },
  getCustomCode(type){if(type!=='fragment')return null;return {CUSTOM_FRAGMENT_MAIN_BEGIN:`
   let coverDistance=distance(input.vp.xz,pluginUbo.coverFeet.xz);
   if(coverDistance>pluginUbo.coverRange.x){
    let cover=1.0-smoothstep(pluginUbo.coverRange.x,pluginUbo.coverRange.y,coverDistance);
    let noise=fract(52.9829189*fract(dot(floor(input.clipPos.xy),vec2<f32>(0.06711056,0.00583715))));
    if(noise>=cover){discard;}
   }
  `};},
 };
}

export function unlit(mat:StandardMaterialProps,rgb:[number,number,number]){
 mat.diffuseColor=rgb;mat.specularColor=[0,0,0];mat.emissiveColor=[0,0,0];return mat;
}

export {showcasePath};
