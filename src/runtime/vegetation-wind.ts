import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';
import type {Material} from '@babylonjs/core/Materials/material.js';
import type {MaterialDefines} from '@babylonjs/core/Materials/materialDefines.js';
import type {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {AbstractEngine} from '@babylonjs/core/Engines/abstractEngine.js';
import type {SubMesh} from '@babylonjs/core/Meshes/subMesh.js';
import type {AbstractMesh} from '@babylonjs/core/Meshes/abstractMesh.js';
import {BoundingInfo} from '@babylonjs/core/Culling/boundingInfo.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import type {WindSystem} from './wind.ts';
import {windFieldWGSL,treeWindWGSL,coverWindWGSL} from './wind.wgsl.ts';

export class VegetationWind extends MaterialPluginBase {
 private unsubscribe:()=>void;
 private wind:WindSystem;
 private kind:'tree'|'grass'|'fern'|'far';
 private origin:()=>{e:number;n:number};
 constructor(material:Material,wind:WindSystem,kind:'tree'|'grass'|'fern'|'far',origin:()=>{e:number;n:number}=()=>({e:0,n:0})){
  super(material,'VegetationWind',200,{VEGETATION_WIND:true,WIND_DETAIL:true},true,false);
  this.wind=wind;this.kind=kind;this.origin=origin;
  this.registerForExtraEvents=true;this._enable(true);
  let enabled=wind.enabled,detail=wind.detail;
  this.unsubscribe=wind.onChange(()=>{if(enabled!==wind.enabled||detail!==wind.detail){enabled=wind.enabled;detail=wind.detail;this.markAllDefinesAsDirty();}});
 }
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.WGSL;}
 override prepareDefines(defines:MaterialDefines){if(this.kind==='tree')defines.NORMAL=true;Object.assign(defines,{VEGETATION_WIND:this.wind.enabled,WIND_DETAIL:this.wind.detail&&this.kind!=='far'});}
 override getAttributes(attributes:string[]){if(this.kind!=='tree')attributes.push('plantWind');else if(!attributes.includes('normal'))attributes.push('normal');}
 override getUniforms(){return {ubo:[
  {name:'windDirection',size:2,type:'vec2'},{name:'windWeather',size:4,type:'vec4'},
  {name:'windPhases',size:3,type:'vec3'},{name:'windMotion',size:2,type:'vec2'},
  {name:'windPlant',size:2,type:'vec2'},{name:'windResponse',size:2,type:'vec2'},{name:'windEye',size:3,type:'vec3'},{name:'windOrigin',size:2,type:'vec2'},
 ]};}
 override hardBindForSubMesh(ubo:UniformBuffer,_scene:Scene,_engine:AbstractEngine,subMesh:SubMesh){
  const w=this.wind,s=w.snapshot,p=subMesh.getRenderingMesh().metadata?.windTree??[20,1];
  ubo.updateFloat2('windDirection',...s.directionToXZ);ubo.updateFloat4('windWeather',s.base,s.gust,w.intensity,s.scale);
  ubo.updateFloat3('windPhases',...s.fieldPhases);ubo.updateFloat2('windMotion',...s.motionPhases);
  ubo.updateFloat2('windPlant',this.kind==='tree'?p[0]:this.kind==='grass'?.16:.10,p[1]);
  ubo.updateFloat2('windResponse',w.canopyBend,w.coverBend);
  ubo.updateFloat3('windEye',w.eye.x,w.eye.y,w.eye.z);
  const origin=this.origin();ubo.updateFloat2('windOrigin',origin.e,-origin.n);
 }
 override getCustomCode(type:string):Record<string,string>|null{
  if(type!=='vertex')return null;
  const cover=this.kind!=='tree';
  return {
   CUSTOM_VERTEX_DEFINITIONS:`${cover?'attribute plantWind: vec4f;\nvarying vWindRestW: vec3f;':''}\n#ifdef VEGETATION_WIND\n${windFieldWGSL}\n#endif`,
   CUSTOM_VERTEX_UPDATE_WORLDPOS:`${cover?'vertexOutputs.vWindRestW=worldPos.xyz;':''}\n#ifdef VEGETATION_WIND\n${cover?coverWindWGSL:treeWindWGSL.replace('let windRoot=finalWorld[3].xz;','let windRoot=finalWorld[3].xz+uniforms.windOrigin;')}\n#endif`,
  };
 }
 override dispose(){this.unsubscribe();}
}

/** Call after static/thin bounds refresh, never per frame. Does not touch collision geometry. */
export function expandWindBounds(mesh:AbstractMesh,margin:number){
 const b=mesh.getBoundingInfo().boundingBox,pad=new Vector3(margin,margin,margin);
 mesh.setBoundingInfo(new BoundingInfo(b.minimum.subtract(pad),b.maximum.add(pad),mesh.getWorldMatrix()));
}
