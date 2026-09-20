import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';
import type {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import {Plane} from '@babylonjs/core/Maths/math.plane.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {MirrorTexture} from '@babylonjs/core/Materials/Textures/mirrorTexture.js';
import {FresnelParameters} from '@babylonjs/core/Materials/fresnelParameters.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {WorldData} from '../world/data.ts';
import type {EN} from '../world/schema.ts';
class Shoreline extends MaterialPluginBase {
 level=0;time=0;origin:EN={e:0,n:0};
 constructor(m:StandardMaterial){super(m,'RegionShore',220,{},true,false);this._enable(true);}
 override isCompatible(l:ShaderLanguage){return l===ShaderLanguage.WGSL;}
 override getAttributes(a:string[]){a.push('waterDepth');}
 override getUniforms(){return {ubo:[{name:'waterLevel',size:1,type:'float'},{name:'waterTime',size:1,type:'float'},{name:'waterOrigin',size:2,type:'vec2'}]};}
 override bindForSubMesh(u:UniformBuffer){u.updateFloat('waterLevel',this.level);u.updateFloat('waterTime',this.time);u.updateFloat2('waterOrigin',this.origin.e,-this.origin.n);}
 override getCustomCode(type:string):Record<string,string>{return type==='vertex'?{CUSTOM_VERTEX_DEFINITIONS:'attribute waterDepth:f32;varying riverDepth:f32;',CUSTOM_VERTEX_MAIN_END:'vertexOutputs.riverDepth=vertexInputs.waterDepth;'}:{CUSTOM_FRAGMENT_DEFINITIONS:'varying riverDepth:f32;',CUSTOM_FRAGMENT_MAIN_BEGIN:'if(fragmentInputs.riverDepth+uniforms.waterLevel<0.015){discard;}',CUSTOM_FRAGMENT_UPDATE_DIFFUSE:`
 let waterEN=fragmentInputs.vPositionW.xz+uniforms.waterOrigin;
 let depth=max(0.0,fragmentInputs.riverDepth+uniforms.waterLevel);
 let a=dot(waterEN,vec2f(.72,.38))+uniforms.waterTime*.75;
 let b=dot(waterEN,vec2f(-1.4,2.1))-uniforms.waterTime*1.15;
 let c=dot(waterEN,vec2f(4.3,3.1))+uniforms.waterTime*1.6;
 let waves=vec2f(.72,.38)*cos(a)*.045+vec2f(-1.4,2.1)*cos(b)*.025+vec2f(4.3,3.1)*cos(c)*.006;
 normalW=normalize(vec3f(-waves.x,1.0,-waves.y));
 let bottom=mix(vec3f(.30,.29,.17),vec3f(.035,.12,.105),1.0-exp(-depth*.85));
 let ripple=.96+.04*sin(a)*sin(b);
 baseColor=vec4f(bottom*ripple,1.0);
 `};}
}
export async function createRegionWater(scene:Scene,data:WorldData){
 const records=await data.json('water.json.pack'),mat=new StandardMaterial('regional-river',scene),shader=new Shoreline(mat),meshes:Mesh[]=[];
 mat.diffuseColor=Color3.White();mat.specularColor=new Color3(.55,.61,.65);mat.specularPower=160;mat.backFaceCulling=false;
 // A single bounded reflection target for this nearly level reach. No recursive water draw.
 const mirror=new MirrorTexture('river-reflection',512,scene,true);mirror.mirrorPlane=new Plane(0,-1,0,.035);mirror.refreshRate=2;mirror.level=.65;
 mat.reflectionTexture=mirror;mat.reflectionFresnelParameters=new FresnelParameters({bias:.08,power:4,leftColor:Color3.White(),rightColor:new Color3(.12,.12,.12)});
 for(const r of records){const m=new Mesh('river-'+r.e+','+r.n,scene),v=new VertexData();v.positions=r.positions;v.indices=r.indices;v.normals=Array.from({length:r.positions.length},(_,i)=>i%3===1?1:0);v.applyToMesh(m);m.setVerticesData('waterDepth',r.depths,false,1);m.material=mat;m.metadata={e:r.e,n:r.n};m.position.set(r.e,0,-r.n);m.isPickable=false;m.freezeWorldMatrix();meshes.push(m);}
 let origin:EN={e:0,n:0};
 let refresh=0;
 const apply=()=>{shader.origin=origin;mirror.mirrorPlane.d=shader.level+.035;for(const m of meshes){m.unfreezeWorldMatrix();m.position.set(m.metadata.e-origin.e,shader.level,origin.n-m.metadata.n);m.freezeWorldMatrix();}};
 scene.onDisposeObservable.add(()=>mirror.dispose());
 return {meshes,update:(dt:number)=>{shader.time=(shader.time+dt)%10000;if(++refresh%30===1){const eye=scene.activeCamera!.position;mirror.renderList=scene.meshes.filter(m=>m.isEnabled()&&m.material!==mat&&!m.name.startsWith('understory')&&!m.name.startsWith('rain')&&(m.metadata?.environment||Vector3.Distance(m.getBoundingInfo().boundingSphere.centerWorld,eye)<450));}},setLevel:(level:number)=>{shader.level=level;apply();},rebase:(o:EN)=>{origin=o;apply();}};
}
