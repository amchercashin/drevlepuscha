import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';
import {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {RawTexture} from '@babylonjs/core/Materials/Textures/rawTexture.js';
import type {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer.js';
import type {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import type {Scene} from '@babylonjs/core/scene.js';
import {GroundRelief} from '../runtime/ground-trial.ts';
import heights from '../../assets/floor/trial/heights.png';
import normals from '../../assets/floor/trial/normals.png';
import soil from '../../assets/floor/trial/soil.png';
import litter from '../../assets/floor/trial/litter.png';
const shared=new WeakMap<Scene,Texture[]>();
const fields=new WeakMap<Scene,Texture>();
class MeadowFinish extends MaterialPluginBase {
 constructor(m:StandardMaterial){super(m,'MeadowFinish',230,{},true,false);this._enable(true);}
 override isCompatible(l:ShaderLanguage){return l===ShaderLanguage.WGSL;}
 override getCustomCode(type:string){return type==='fragment'?{CUSTOM_FRAGMENT_UPDATE_DIFFUSE:`
 let broad=.5+.25*sin(worldEN.x*.027+sin(worldEN.y*.019)*2.0)+.25*sin(worldEN.y*.046-worldEN.x*.011);
 let grain=textureSample(trialSoil,trialSoilSampler,worldEN/2.3).g;
 let meadow=mix(vec3f(.22,.31,.105),vec3f(.43,.47,.22),broad)*(.78+grain*.55);
 let turf=(1.0-groundCover)*(1.0-regionBare)*smoothstep(.68,.95,normalW.y)*(1.0-regionField.b*.7);
 baseColor=vec4f(mix(baseColor.rgb,meadow,turf*.58),baseColor.a);
 `}:null;}
}
class RegionSoil extends MaterialPluginBase {
 constructor(m:StandardMaterial,private field:Texture){super(m,'RegionSoil',215,{},true,false);this._enable(true);}
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.WGSL;}
 override getSamplers(s:string[]){s.push('regionSoil');}
 override bindForSubMesh(u:UniformBuffer){u.setTexture('regionSoil',this.field);}
 override getCustomCode(type:string){if(type!=='fragment')return null;return {CUSTOM_FRAGMENT_DEFINITIONS:'var regionSoilSampler:sampler;var regionSoil:texture_2d<f32>;',CUSTOM_FRAGMENT_UPDATE_DIFFUSE:`
 let groundField=vec4f(0.45,0.3,0.5+0.3*sin(worldEN.x*0.043+worldEN.y*0.027),0.5+0.3*cos(worldEN.x*0.021-worldEN.y*0.033));
 let regionField=textureSample(regionSoil,regionSoilSampler,(worldEN-vec2f(-2048.0,-1536.0))/vec2f(4608.0,4096.0));
 let groundCover=regionField.r;let groundMoss=regionField.g;let regionBare=clamp((baseColor.r-baseColor.g)*12.0,0.0,1.0);
 `};}
}
export function regionGround(material:StandardMaterial,origin:()=>{e:number;n:number},geo:any){
 const scene=material.getScene();let maps=shared.get(scene);
 if(!maps){maps=[heights,normals,soil,litter].map((url,i)=>{const t=new Texture(url,scene,false,false);t.gammaSpace=i>1;t.anisotropicFilteringLevel=4;return t;});shared.set(scene,maps);}
 let field=fields.get(scene);if(!field){const pixels=new Uint8Array(256*256*4);for(let y=0;y<256;y++)for(let x=0;x<256;x++){const e=-2048+(x+.5)*18,n=-1536+(y+.5)*16,zone=geo.zoneAt(e,n),wet=geo.nearbyWater(e,n).some((q:any)=>q.distance<q.width/2+35);pixels.set([zone.id==='fields'?12:zone.id==='orchard'?48:205,wet?90:35,wet?120:0,255],(y*256+x)*4);}field=RawTexture.CreateRGBATexture(pixels,256,256,scene,false,false,Texture.BILINEAR_SAMPLINGMODE);field.wrapU=field.wrapV=Texture.CLAMP_ADDRESSMODE;fields.set(scene,field);}
 new RegionSoil(material,field);new GroundRelief(material,maps,origin);new MeadowFinish(material);
}
