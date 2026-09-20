import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import type {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {WorldData} from '../world/data.ts';
import type {Library} from '../world/library.ts';
import type {EN} from '../world/schema.ts';
import type {FrameWorkBudget} from '../runtime/startup.ts';

class CanopyDistance extends MaterialPluginBase{
 feet:EN={e:0,n:0};origin:EN={e:0,n:0};
 constructor(m:StandardMaterial){super(m,'CanopyDistance',225,{},true,false);this._enable(true);}
 override isCompatible(l:ShaderLanguage){return l===ShaderLanguage.WGSL;}
 override getUniforms(){return {ubo:[{name:'canopyFeet',size:2,type:'vec2'}]};}
 override bindForSubMesh(u:UniformBuffer){u.updateFloat2('canopyFeet',this.feet.e-this.origin.e,this.origin.n-this.feet.n);}
 override getCustomCode(type:string){return type==='fragment'?{CUSTOM_FRAGMENT_MAIN_BEGIN:`
 let coverage=smoothstep(600.0,800.0,distance(fragmentInputs.vPositionW.xz,uniforms.canopyFeet));
 if(fract(52.9829189*fract(dot(floor(fragmentInputs.position.xy),vec2f(.06711056,.00583715))))>=coverage){discard;}
 `}:null;}
}

/** Reuses actual tree silhouettes, including trunks. Each batch owns its instance buffers. */
export class RegionHorizon {
 origin:EN={e:0,n:0};last='';generation=0;meshes:Mesh[]=[];completed:(()=>void)|undefined;
 canopy:Mesh;cover:CanopyDistance;
 constructor(public scene:Scene,public data:WorldData,public library:Library){
  this.canopy=new Mesh('regional-forest-cover',scene);this.canopy.isPickable=false;
  const m=new StandardMaterial('regional-forest-cover',scene);m.specularColor=Color3.Black();m.backFaceCulling=false;this.canopy.material=m;this.cover=new CanopyDistance(m);
  void data.call('region-canopy',{}).then(g=>{const v=new VertexData(),normals:number[]=[];VertexData.ComputeNormals(g.positions,g.indices,normals,{useRightHandedSystem:true});Object.assign(v,{...g,normals});v.applyToMesh(this.canopy);}).catch(e=>console.error(e));
 }
 update(p:EN,budget?:FrameWorkBudget){
  this.cover.feet=p;this.cover.origin=this.origin;
  if(this.completed){const upload=()=>{const fn=this.completed!;this.completed=undefined;fn();};if(budget)budget.run(upload);else upload();}
  const key=Math.floor(p.e/128)+','+Math.floor(p.n/128);if(key===this.last)return;this.last=key;
  const generation=++this.generation;
  void this.data.call('region-groves',{p,origin:this.origin}).then((groups:Record<string,Float32Array>)=>{
   const apply=()=>{if(generation!==this.generation)return;
    for(const mesh of this.meshes)mesh.dispose();this.meshes=[];
    for(const [id,matrices]of Object.entries(groups)){
     const [family,variant,level]=id.split('/').map(Number),f=this.library.tree(family),v=f.variants[variant%f.variants.length];
     for(const [i,source]of v[Math.min(level,v.length-1)].entries()){
      const mesh=new Mesh('regional-distant-tree-'+id+'-'+i,this.scene);source.geometry!.copy(mesh.name).applyToMesh(mesh);
      mesh.material=source.material;mesh.sideOrientation=source.sideOrientation;mesh.isPickable=false;
      mesh.thinInstanceSetBuffer('matrix',matrices,16,true);mesh.thinInstanceRefreshBoundingInfo();this.meshes.push(mesh);
     }
    }
   };if(budget)this.completed=apply;else apply();
  }).catch(()=>{if(generation===this.generation)this.last='';});
 }
 rebase(o:EN){for(const m of this.meshes){m.position.x+=this.origin.e-o.e;m.position.z+=o.n-this.origin.n;}this.canopy.position.set(-o.e,0,o.n);this.origin=o;this.generation++;this.completed=undefined;this.last='';}
}
