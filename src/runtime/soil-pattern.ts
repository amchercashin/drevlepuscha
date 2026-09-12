import {showcaseEnabled} from '../domain/showcase.ts';
import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import type {Material} from '@babylonjs/core/Materials/material.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import {TRAIL_EDGE_WGSL} from './trail-edge.wgsl.ts';
import {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import type {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer.js';
import patchesURL from '../../assets/floor/trial/patches.png';

/** World-sized colour masses keep a readable path and moss beyond the grass radius. */
export class SoilPattern extends MaterialPluginBase {
 private patches:Texture|null=null;
 constructor(material:Material){super(material,'SoilPattern',215,{SOIL_PATTERN:true},true,false);this._enable(true);
  if(showcaseEnabled){this.patches=new Texture(patchesURL,material.getScene(),false,false);this.patches.gammaSpace=false;this.patches.wrapU=this.patches.wrapV=Texture.CLAMP_ADDRESSMODE;}
 }
 override isCompatible(language: ShaderLanguage) { return language === ShaderLanguage.WGSL; }
 override getSamplers(s:string[]){if(this.patches)s.push('groundPatches');}
 override getActiveTextures(t:Texture[]){if(this.patches)t.push(this.patches);}
 override bindForSubMesh(u:UniformBuffer){if(this.patches)u.setTexture('groundPatches',this.patches);}
 override getCustomCode(type: string){if(type!=='fragment')return null;
  if(showcaseEnabled)return {CUSTOM_FRAGMENT_DEFINITIONS:TRAIL_EDGE_WGSL+'\nvar groundPatchesSampler:sampler;var groundPatches:texture_2d<f32>;',CUSTOM_FRAGMENT_UPDATE_DIFFUSE:`
   let e=fragmentInputs.vPositionW.x;let n=-fragmentInputs.vPositionW.z;
   let groundField=textureSample(groundPatches,groundPatchesSampler,vec2f((e+256.0)/512.0,(n+256.0)/640.0));
   let groundForest=trailForest(vec2f(e,n));
   let groundMoss=groundField.g*groundForest*0.9;
   let groundCover=groundForest*(0.12+0.88*groundField.r)*(1.0-0.65*groundMoss);
   let groundFarSoil=mix(vec3f(0.50,0.435,0.325),vec3f(0.41,0.355,0.25),groundCover);
   let groundFarColour=mix(groundFarSoil,vec3f(0.27,0.36,0.19),groundMoss*(1.0-0.7*groundCover));
   let groundGrain=dot(baseColor.rgb,vec3f(0.30,0.59,0.11));
   baseColor=vec4f(groundFarColour*(0.94+0.12*groundGrain),baseColor.a);
  `};
  return {CUSTOM_FRAGMENT_DEFINITIONS:'',CUSTOM_FRAGMENT_UPDATE_DIFFUSE:`
   let e=fragmentInputs.vPositionW.x;let n=-fragmentInputs.vPositionW.z;
   let moss=0.5+0.25*sin(e*0.38+n*0.23)+0.25*sin(e*0.17-n*0.42);
   let edge=abs(e-${showcaseEnabled?'(17.0*sin(n*0.019)+6.0*sin(n*0.047))':'sin(n*0.075)*1.3'})+0.12*sin(n*3.1+e*1.5);
   let path=${showcaseEnabled?'1.0-trailForest(vec2f(e,n))':'1.0-smoothstep(1.0,2.1,edge)'};
   let soil=mix(vec3f(${showcaseEnabled?'0.22,0.34,0.29':'0.39,0.40,0.30'}),vec3f(${showcaseEnabled?'0.20,0.40,0.32':'0.32,0.46,0.34'}),moss);
   let colour=mix(soil,vec3f(${showcaseEnabled?'0.64,0.56,0.39':'0.65,0.60,0.44'}),path);
   let grain=dot(baseColor.rgb,vec3f(0.30,0.59,0.11));
   baseColor=vec4f(mix(baseColor.rgb*1.4,colour*(0.65+grain),0.65),baseColor.a);
  `};
 }
}
