import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import type {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';
import type {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {AbstractEngine} from '@babylonjs/core/Engines/abstractEngine.js';
import type {SubMesh} from '@babylonjs/core/Meshes/subMesh.js';

/** Subtle albedo grading before scene lighting; no extra texture or render pass. */
export class RangerPalette extends MaterialPluginBase {
 constructor(material:PBRMaterial){super(material,'RangerPalette',220,{},true,false);this.registerForExtraEvents=true;this._enable(true);}
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.WGSL;}
 override getUniforms(){return {ubo:[{name:'rangerCloakTone',size:3,type:'vec3'}]};}
 // Hard binding runs for each walker even when Babylon reuses the same material.
 override hardBindForSubMesh(ubo:UniformBuffer,_scene:Scene,_engine:AbstractEngine,subMesh:SubMesh){
  const tone=subMesh.getRenderingMesh().metadata?.rangerCloakTone;
  ubo.updateFloat3('rangerCloakTone',tone?.r??1,tone?.g??1,tone?.b??1);
 }
 override getCustomCode(type:string){
  if(type!=='fragment')return null;
  return {CUSTOM_FRAGMENT_BEFORE_LIGHTS:`
   let rangerLuma=dot(surfaceAlbedo,vec3f(0.2126,0.7152,0.0722));
   // The single atlas mixes cloth, face, leather and metal. Select the original
   // green fabric before grading, preserving its woven detail and baked shading.
   let rangerCloth=smoothstep(0.015,0.09,(surfaceAlbedo.g-surfaceAlbedo.r)/max(rangerLuma,0.02))
    *smoothstep(0.03,0.16,(surfaceAlbedo.g-surfaceAlbedo.b)/max(rangerLuma,0.02));
   // A colour-based falloff protects warm skin/leather in the shared atlas.
   let rangerWarm=smoothstep(0.08,0.28,(surfaceAlbedo.r-surfaceAlbedo.g)/max(rangerLuma,0.02));
   let rangerMuted=mix(vec3f(rangerLuma),surfaceAlbedo,0.90);
   let rangerForest=rangerMuted*vec3f(0.92,1.03,0.96);
   surfaceAlbedo=mix(surfaceAlbedo,rangerForest,1.0-rangerWarm);
   surfaceAlbedo=mix(surfaceAlbedo,rangerLuma*uniforms.rangerCloakTone,rangerCloth);
  `};
 }
}
