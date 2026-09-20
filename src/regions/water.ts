import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';
import type {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {WorldData} from '../world/data.ts';
import type {EN} from '../world/schema.ts';
class Shoreline extends MaterialPluginBase {
 level=0;time=0;
 constructor(m:StandardMaterial){super(m,'RegionShore',220,{},true,false);this._enable(true);}
 override isCompatible(l:ShaderLanguage){return l===ShaderLanguage.WGSL;}
 override getAttributes(a:string[]){a.push('waterDepth');}
 override getUniforms(){return {ubo:[{name:'waterLevel',size:1,type:'float'},{name:'waterTime',size:1,type:'float'}]};}
 override bindForSubMesh(u:UniformBuffer){u.updateFloat('waterLevel',this.level);u.updateFloat('waterTime',this.time);}
 override getCustomCode(type:string):Record<string,string>{return type==='vertex'?{CUSTOM_VERTEX_DEFINITIONS:'attribute waterDepth:f32;varying riverDepth:f32;',CUSTOM_VERTEX_MAIN_END:'vertexOutputs.riverDepth=vertexInputs.waterDepth;'}:{CUSTOM_FRAGMENT_DEFINITIONS:'varying riverDepth:f32;',CUSTOM_FRAGMENT_MAIN_BEGIN:'if(fragmentInputs.riverDepth+uniforms.waterLevel<0.015){discard;}',CUSTOM_FRAGMENT_UPDATE_DIFFUSE:`let ripple=sin(fragmentInputs.vPositionW.x*2.0+fragmentInputs.vPositionW.z*1.7+uniforms.waterTime*0.8)*sin(fragmentInputs.vPositionW.z*3.2-uniforms.waterTime);baseColor=vec4f(baseColor.rgb*(0.93+0.07*ripple),baseColor.a);`};}
}
export async function createRegionWater(scene:Scene,data:WorldData){
 const records=await data.json('water.json.pack'),mat=new StandardMaterial('regional-river',scene),shader=new Shoreline(mat),meshes:Mesh[]=[];
 mat.diffuseColor=new Color3(.25,.39,.35);mat.specularColor=new Color3(.38,.43,.36);mat.specularPower=80;mat.alpha=.9;mat.backFaceCulling=false;
 for(const r of records){const m=new Mesh('river-'+r.e+','+r.n,scene),v=new VertexData();v.positions=r.positions;v.indices=r.indices;v.normals=Array.from({length:r.positions.length},(_,i)=>i%3===1?1:0);v.applyToMesh(m);m.setVerticesData('waterDepth',r.depths,false,1);m.material=mat;m.metadata={e:r.e,n:r.n};m.position.set(r.e,0,-r.n);m.isPickable=false;m.freezeWorldMatrix();meshes.push(m);}
 let origin:EN={e:0,n:0};
 const apply=()=>{for(const m of meshes){m.unfreezeWorldMatrix();m.position.set(m.metadata.e-origin.e,shader.level,origin.n-m.metadata.n);m.freezeWorldMatrix();}};
 return {meshes,update:(dt:number)=>{shader.time=(shader.time+dt)%10000;},setLevel:(level:number)=>{shader.level=level;apply();},rebase:(o:EN)=>{origin=o;apply();}};
}
