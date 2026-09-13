import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import type {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';

/** Subtle albedo grading before scene lighting; no extra texture or render pass. */
export class RangerPalette extends MaterialPluginBase {
 constructor(material:PBRMaterial){super(material,'RangerPalette',220,{},true,false);this._enable(true);}
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.WGSL;}
 override getCustomCode(type:string){
  if(type!=='fragment')return null;
  return {CUSTOM_FRAGMENT_BEFORE_LIGHTS:`
   let rangerLuma=dot(surfaceAlbedo,vec3f(0.2126,0.7152,0.0722));
   // A colour-based falloff protects warm skin/leather in the shared atlas.
   let rangerWarm=smoothstep(0.08,0.28,(surfaceAlbedo.r-surfaceAlbedo.g)/max(rangerLuma,0.02));
   let rangerMuted=mix(vec3f(rangerLuma),surfaceAlbedo,0.90);
   let rangerForest=rangerMuted*vec3f(0.92,1.03,0.96);
   surfaceAlbedo=mix(surfaceAlbedo,rangerForest,1.0-rangerWarm);
  `};
 }
}
