import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import type {Material} from '@babylonjs/core/Materials/material.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import type {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer.js';
import type {ShadowGenerator} from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';

/** Cheap world-anchored distant shade, not a map or a second render pass.
 * Terrain height matches the current M1 groundHeight; future terrain must supply its own height.
 */
export class CanopyShade extends MaterialPluginBase {
 constructor(material:Material,private shadows:ShadowGenerator){super(material,'CanopyShade',240,{},true,false);this._enable(true);}
 override isCompatible(language: ShaderLanguage) { return language === ShaderLanguage.WGSL; }
 override getUniforms(){return {ubo:[{name:'canopySunMatrix',size:16,type:'mat4'}]};}
 override bindForSubMesh(ubo:UniformBuffer){ubo.updateMatrix('canopySunMatrix',this.shadows.getTransformMatrix());}
 override getCustomCode(type: string){
  if(type!=='fragment')return null;
  return {
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
 }
}
