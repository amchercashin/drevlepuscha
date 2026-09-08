import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import type {Material} from '@babylonjs/core/Materials/material.js';
import type {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {AbstractEngine} from '@babylonjs/core/Engines/abstractEngine.js';
import type {SubMesh} from '@babylonjs/core/Meshes/subMesh.js';
import type {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';

/** Complementary pixel coverage avoids the brightness dip of two alpha-blended LODs. */
export class LodDither extends MaterialPluginBase {
 constructor(material:Material){super(material,'LodDither',200,{},true,false);this.registerForExtraEvents=true;this._enable(true);}
 override isCompatible(_language:ShaderLanguage){return true;}
 override getUniforms(language:ShaderLanguage){return {ubo:[{name:'lodCoverage',size:2,type:'vec2'}],fragment:language===0?'#ifndef UNIFORMBUFFERS\nuniform vec2 lodCoverage;\n#endif':''};}
 override hardBindForSubMesh(ubo:UniformBuffer,_scene:Scene,_engine:AbstractEngine,subMesh:SubMesh){
  const coverage=subMesh.getRenderingMesh().metadata?.lodCoverage??[0,1];
  ubo.updateFloat2('lodCoverage',coverage[0],coverage[1]);
 }
 override getCustomCode(type:string,language:ShaderLanguage){
  if(type!=='fragment')return null;
  return {CUSTOM_FRAGMENT_MAIN_BEGIN:language===1?`
   let lodPixel = floor(fragmentInputs.position.xy);
   let lodNoise = fract(52.9829189 * fract(dot(lodPixel, vec2f(0.06711056, 0.00583715))));
   if (lodNoise < uniforms.lodCoverage.x || lodNoise >= uniforms.lodCoverage.y) { discard; }
  `:`
   vec2 lodPixel = floor(gl_FragCoord.xy);
   float lodNoise = fract(52.9829189 * fract(dot(lodPixel, vec2(0.06711056, 0.00583715))));
   if (lodNoise < lodCoverage.x || lodNoise >= lodCoverage.y) { discard; }
  `};
 }
}
