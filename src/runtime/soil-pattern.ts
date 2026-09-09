import {showcaseEnabled} from '../domain/showcase.ts';
import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import type {Material} from '@babylonjs/core/Materials/material.js';
import type {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';

/** World-sized colour masses keep a readable path and moss beyond the grass radius. */
export class SoilPattern extends MaterialPluginBase {
 constructor(material:Material){super(material,'SoilPattern',215,{SOIL_PATTERN:true},true,false);this._enable(true);}
 override isCompatible(_language:ShaderLanguage){return true;}
 override getCustomCode(type:string,language:ShaderLanguage){if(type!=='fragment')return null;
  return {CUSTOM_FRAGMENT_UPDATE_DIFFUSE:language===1?`
   let e=fragmentInputs.vPositionW.x;let n=-fragmentInputs.vPositionW.z;
   let moss=0.5+0.25*sin(e*0.38+n*0.23)+0.25*sin(e*0.17-n*0.42);
   let edge=abs(e-${showcaseEnabled?'(17.0*sin(n*0.019)+6.0*sin(n*0.047))':'sin(n*0.075)*1.3'})+0.12*sin(n*3.1+e*1.5);
   let path=1.0-smoothstep(1.0,2.1,edge);
   let soil=mix(vec3f(${showcaseEnabled?'0.28,0.34,0.22':'0.39,0.40,0.30'}),vec3f(${showcaseEnabled?'0.23,0.39,0.24':'0.32,0.46,0.34'}),moss);
   let colour=mix(soil,vec3f(${showcaseEnabled?'0.53,0.50,0.37':'0.65,0.60,0.44'}),path);
   let grain=dot(baseColor.rgb,vec3f(0.30,0.59,0.11));
   baseColor=vec4f(mix(baseColor.rgb*1.4,colour*(0.65+grain),0.65),baseColor.a);
  `:`
   float e=vPositionW.x;float n=-vPositionW.z;
   float moss=0.5+0.25*sin(e*0.38+n*0.23)+0.25*sin(e*0.17-n*0.42);
   float edge=abs(e-${showcaseEnabled?'(17.0*sin(n*0.019)+6.0*sin(n*0.047))':'sin(n*0.075)*1.3'})+0.12*sin(n*3.1+e*1.5);
   float path=1.0-smoothstep(1.0,2.1,edge);
   vec3 soil=mix(vec3(${showcaseEnabled?'0.28,0.34,0.22':'0.39,0.40,0.30'}),vec3(${showcaseEnabled?'0.23,0.39,0.24':'0.32,0.46,0.34'}),moss);
   vec3 colour=mix(soil,vec3(${showcaseEnabled?'0.53,0.50,0.37':'0.65,0.60,0.44'}),path);
   float grain=dot(baseColor.rgb,vec3(0.30,0.59,0.11));
   baseColor.rgb=mix(baseColor.rgb*1.4,colour*(0.65+grain),0.65);
  `};
 }
}
