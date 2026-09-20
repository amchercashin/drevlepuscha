import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import type {Material} from '@babylonjs/core/Materials/material.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import type {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer.js';
import type {ShadowGenerator} from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import type {Texture} from '@babylonjs/core/Materials/Textures/texture.js';

/** Distant canopy shade without a second pass; regions provide their own height/cover field. */
export class CanopyShade extends MaterialPluginBase {
 constructor(material:Material,private shadows:ShadowGenerator,private regional?:{field:Texture;origin:()=>{e:number;n:number}}){super(material,'CanopyShade',240,{},true,false);this._enable(true);}
 override isCompatible(language: ShaderLanguage) { return language === ShaderLanguage.WGSL; }
 override getSamplers(s:string[]){if(this.regional)s.push('canopyField');}
 override getUniforms(){return {ubo:[{name:'canopySunMatrix',size:16,type:'mat4'},...(this.regional?[{name:'canopyOrigin',size:2,type:'vec2'}]:[])]};}
 override bindForSubMesh(ubo:UniformBuffer){ubo.updateMatrix('canopySunMatrix',this.shadows.getTransformMatrix());if(this.regional){const o=this.regional.origin();ubo.updateFloat2('canopyOrigin',o.e,o.n);ubo.setTexture('canopyField',this.regional.field);}}
 override getCustomCode(type: string){
  if(type!=='fragment')return null;
  const code:Record<string,string>={
   CUSTOM_FRAGMENT_DEFINITIONS:'',
   CUSTOM_FRAGMENT_BEFORE_LIGHTS:`
    let canopyPosition=fragmentInputs.vPositionW;
    let canopyDensity=0.68+0.20*sin(canopyPosition.x*0.31+canopyPosition.z*0.19)*sin(canopyPosition.z*0.27-canopyPosition.x*0.13);
    let terrain=3.2*smoothstep(32.0,47.0,-canopyPosition.z)+0.18*sin(canopyPosition.x*0.2)*sin(-canopyPosition.z*0.14);
    let canopyHeight=canopyPosition.y-terrain;
    let canopyVisibility=1.0-0.72*canopyDensity*(1.0-smoothstep(5.0,14.0,canopyHeight));
    let canopyProjected=uniforms.canopySunMatrix*vec4f(canopyPosition,1.0);
    let canopyEdge=max(abs(canopyProjected.x/canopyProjected.w),abs(canopyProjected.y/canopyProjected.w));
    let canopyBlend=smoothstep(0.55,0.90,canopyEdge);
   `,
   // The scene pins high-quality PCF. Replace its visibility, not the surface
   // colour or sky fill, so overlap does not double-darken the near shadows.
   '!shadow=computeShadowWithPCF5\\([^;]+;':'if(canopyBlend<1.0){$0\nshadow=mix(shadow,canopyVisibility,canopyBlend);}else{shadow=canopyVisibility;}',
  };
  if(this.regional){code.CUSTOM_FRAGMENT_DEFINITIONS='var canopyFieldSampler:sampler;var canopyField:texture_2d<f32>;';code.CUSTOM_FRAGMENT_BEFORE_LIGHTS=code.CUSTOM_FRAGMENT_BEFORE_LIGHTS.replace('let canopyDensity=0.68+0.20*sin(canopyPosition.x*0.31+canopyPosition.z*0.19)*sin(canopyPosition.z*0.27-canopyPosition.x*0.13);','let absoluteCanopy=vec2f(canopyPosition.x,-canopyPosition.z)+uniforms.canopyOrigin;let canopySample=textureSample(canopyField,canopyFieldSampler,(absoluteCanopy-vec2f(-2048.0,-1536.0))/vec2f(4608.0,4096.0));let canopyDensity=canopySample.g*(0.68+0.20*sin(absoluteCanopy.x*0.31-absoluteCanopy.y*0.19)*sin(-absoluteCanopy.y*0.27-absoluteCanopy.x*0.13));').replace('let terrain=3.2*smoothstep(32.0,47.0,-canopyPosition.z)+0.18*sin(canopyPosition.x*0.2)*sin(-canopyPosition.z*0.14);','let terrain=canopySample.r*128.0-16.0;');}
  return code;
 }
}
