import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import type {Material} from '@babylonjs/core/Materials/material.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import type {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer.js';
import type {DirectionalLight} from '@babylonjs/core/Lights/directionalLight.js';

/** Art-directed backlighting of green canopy surfaces, not alpha transparency.
 * Current atlas has no thickness mask: use its foliage colour and grazing angle.
 * Sun uniforms are read live, so a later lighting clock can drive this same response.
 */
export class LeafTransmission extends MaterialPluginBase {
 constructor(material:Material,private sun:DirectionalLight){super(material,'LeafTransmission',230,{},true,false);this._enable(true);}
 override isCompatible(language: ShaderLanguage) { return language === ShaderLanguage.WGSL; }
 override getUniforms(){return {ubo:[{name:'leafSunDirection',size:3,type:'vec3'},{name:'leafSunColor',size:3,type:'vec3'}]};}
 override bindForSubMesh(ubo:UniformBuffer){const d=this.sun.direction.normalizeToNew(),c=this.sun.diffuse;ubo.updateFloat3('leafSunDirection',-d.x,-d.y,-d.z);ubo.updateFloat3('leafSunColor',c.r*this.sun.intensity,c.g*this.sun.intensity,c.b*this.sun.intensity);}
 override getCustomCode(type: string){
  if(type!=='fragment')return null;
  return {CUSTOM_FRAGMENT_BEFORE_FOG:`
   let foliage=smoothstep(0.025,0.11,baseColor.g-baseColor.r);
   let forwardScatter=pow(max(0.0,dot(-viewDirectionW,uniforms.leafSunDirection)),5.0);
   let thinEdge=pow(1.0-abs(dot(normalW,viewDirectionW)),1.5);
   let backlit=0.25+0.75*max(0.0,dot(-normalW,uniforms.leafSunDirection));
   let transmitted=foliage*forwardScatter*backlit*(0.12+0.55*thinEdge);
   color=vec4f(color.rgb+vec3f(0.68,0.86,0.24)*uniforms.leafSunColor*transmitted,color.a);
  `};
 }
}
