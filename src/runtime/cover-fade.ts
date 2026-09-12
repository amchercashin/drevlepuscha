import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import type {Material} from '@babylonjs/core/Materials/material.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import type {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer.js';
import type {Point3} from '../domain/harness.ts';
/** Dissolve small distant detail at its original height; the persistent cover stays underneath. */
export class CoverFade extends MaterialPluginBase {
 feet:Point3={x:0,y:0,z:0};
 constructor(material:Material,private start:number,private end:number){super(material,'CoverFade',220,{COVER_FADE:true},true,false);this._enable(true);}
 override isCompatible(language: ShaderLanguage) { return language === ShaderLanguage.WGSL; }
 override getUniforms(){return {ubo:[{name:'coverFeet',size:3,type:'vec3'},{name:'coverRange',size:2,type:'vec2'}]};}
 override bindForSubMesh(ubo:UniformBuffer){ubo.updateFloat3('coverFeet',this.feet.x,this.feet.y,this.feet.z);ubo.updateFloat2('coverRange',this.start,this.end);}
 override getCustomCode(type: string):Record<string,string>|null{
  if(type!=='fragment')return null;
  return {CUSTOM_FRAGMENT_MAIN_BEGIN:`
   let coverDistance=distance(fragmentInputs.vPositionW.xz,uniforms.coverFeet.xz);
   if(coverDistance>uniforms.coverRange.x){
    let cover=1.0-smoothstep(uniforms.coverRange.x,uniforms.coverRange.y,coverDistance);
    let noise=fract(52.9829189*fract(dot(floor(fragmentInputs.position.xy),vec2f(0.06711056,0.00583715))));
    if(noise>=cover){discard;}
   }
  `};
 }
}
