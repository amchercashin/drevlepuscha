import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import type {Material} from '@babylonjs/core/Materials/material.js';
import type {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {AbstractEngine} from '@babylonjs/core/Engines/abstractEngine.js';
import type {SubMesh} from '@babylonjs/core/Meshes/subMesh.js';
import type {AbstractMesh} from '@babylonjs/core/Meshes/abstractMesh.js';
import type {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';

/** One shared material: instance attributes for batches, a uniform for fading copies. */
export class TreeTone extends MaterialPluginBase {
 strength=1;
 constructor(material:Material){super(material,'TreeTone',210,{},true,false);this.registerForExtraEvents=true;this._enable(true);}
 override isCompatible(_language:ShaderLanguage){return true;}
 override getAttributes(attributes:string[],_scene:Scene,mesh:AbstractMesh){if(mesh.hasThinInstances||mesh.instancedBuffers?.treeTone)attributes.push('treeTone');}
 override getUniforms(language:ShaderLanguage){return {ubo:[{name:'treeToneFallback',size:3,type:'vec3'},{name:'treeToneStrength',size:1,type:'float'}],vertex:language===0?'#ifndef UNIFORMBUFFERS\nuniform vec3 treeToneFallback;\n#endif':'',fragment:language===0?'#ifndef UNIFORMBUFFERS\nuniform float treeToneStrength;\n#endif':''};}
 override hardBindForSubMesh(ubo:UniformBuffer,_scene:Scene,_engine:AbstractEngine,subMesh:SubMesh){const t=subMesh.getRenderingMesh().metadata?.treeTone;ubo.updateFloat3('treeToneFallback',t?.x??0,t?.y??0,t?.z??0);ubo.updateFloat('treeToneStrength',this.strength);}
 override getCustomCode(type:string,language:ShaderLanguage):Record<string,string>|null{
  const wgsl=language===1;
  if(type==='vertex')return {
   CUSTOM_VERTEX_DEFINITIONS:wgsl?'#ifdef INSTANCES\nattribute treeTone: vec3f;\n#endif\nvarying vTreeTone: vec3f;':'#ifdef INSTANCES\nattribute vec3 treeTone;\n#endif\nvarying vec3 vTreeTone;',
   CUSTOM_VERTEX_MAIN_END:wgsl?'#ifdef INSTANCES\nvertexOutputs.vTreeTone=vertexInputs.treeTone;\n#else\nvertexOutputs.vTreeTone=uniforms.treeToneFallback;\n#endif':'#ifdef INSTANCES\nvTreeTone=treeTone;\n#else\nvTreeTone=treeToneFallback;\n#endif',
  };
  if(type!=='fragment')return null;
  return {
   CUSTOM_FRAGMENT_DEFINITIONS:wgsl?'varying vTreeTone: vec3f;':'varying vec3 vTreeTone;',
   CUSTOM_FRAGMENT_UPDATE_DIFFUSE:wgsl?`
    let tone=fragmentInputs.vTreeTone;
    let leaf=smoothstep(0.035,0.12,baseColor.g-baseColor.r);
    let luminance=dot(baseColor.rgb,vec3f(0.2126,0.7152,0.0722));
    let hue=vec3f(1.0+tone.y*0.8,1.0+tone.y*0.15,1.0-tone.y*0.7);
    let tint=mix(vec3f(1.0),hue,leaf)*(1.0+tone.x*mix(0.5,1.0,leaf));
    let varied=mix(vec3f(luminance),baseColor.rgb,1.0+tone.z*leaf)*tint;
    baseColor=vec4f(mix(baseColor.rgb,varied,uniforms.treeToneStrength),baseColor.a);
   `:`
    vec3 tone=vTreeTone;
    float leaf=smoothstep(0.035,0.12,baseColor.g-baseColor.r);
    float luminance=dot(baseColor.rgb,vec3(0.2126,0.7152,0.0722));
    vec3 hue=vec3(1.0+tone.y*0.8,1.0+tone.y*0.15,1.0-tone.y*0.7);
    vec3 tint=mix(vec3(1.0),hue,leaf)*(1.0+tone.x*mix(0.5,1.0,leaf));
    vec3 varied=mix(vec3(luminance),baseColor.rgb,1.0+tone.z*leaf)*tint;
    baseColor.rgb=mix(baseColor.rgb,varied,treeToneStrength);
   `,
  };
 }
}
