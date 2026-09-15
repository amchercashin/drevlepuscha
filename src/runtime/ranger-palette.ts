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
   // The single atlas mixes cloth, face, leather and metal. The cloak fabric is
   // a muted olive: red and green stay close while blue sits clearly lower.
   // Selecting on (green - blue) with no red requirement covers every woven
   // patch, so dyeing keeps the baked folds and the fringe detail.
   let rangerCloth=smoothstep(0.06,0.22,(surfaceAlbedo.g-surfaceAlbedo.b)/max(rangerLuma,0.02));
   // Warm skin and leather (red clearly above green) and neutral metal
   // (green ≈ blue) must stay untouched.
   let rangerWarm=smoothstep(0.10,0.26,(surfaceAlbedo.r-surfaceAlbedo.g)/max(rangerLuma,0.02));
   let rangerMask=rangerCloth*(1.0-rangerWarm);
   // Keep luminance (folds, weave shading) and re-tint it with the dye hue.
   // The tone is luma-normalised, so switching dye keeps overall brightness.
   let rangerDyed=rangerLuma*uniforms.rangerCloakTone;
   surfaceAlbedo=mix(surfaceAlbedo,rangerDyed,rangerMask);
  `};
 }
}
