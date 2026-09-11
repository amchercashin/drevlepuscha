import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Material} from '@babylonjs/core/Materials/material.js';
import {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {EN} from './schema.ts';
import type {WorldData} from './data.ts';
import type {Terrain} from './terrain.ts';
import {tileKey} from './math.ts';
import {CoverFade} from '../runtime/cover-fade.ts';
import foliageURL from '../../assets/floor/foliage.png';
type Job={e:number;n:number;id:string};
/** Showcase foliage, prepared by the existing world worker on the streamed height surface. */
export class Floor {
 cells=new Map<string,Mesh[]>();queue:Job[]=[];last='';origin:EN={e:0,n:0};
 wanted=new Set<string>();inflight:Job|undefined;completed:{job:Job;geometry:any}|undefined;
 materials:StandardMaterial[];fades:CoverFade[];failures=0;
 constructor(public scene:Scene,public data:WorldData,public terrain:Terrain,public blocked:(e:number,n:number)=>boolean){
  const grass=new StandardMaterial('grass',scene),leaves=new StandardMaterial('floor-leaves',scene);
  this.materials=[grass,leaves];for(const m of this.materials){m.diffuseColor=Color3.White();m.specularColor=Color3.Black();m.backFaceCulling=false;m.twoSidedLighting=true;}
  grass.emissiveColor=new Color3(.045,.075,.025);leaves.emissiveColor=new Color3(.12,.17,.065);
  const texture=new Texture(foliageURL,scene);texture.hasAlpha=true;texture.wrapU=texture.wrapV=Texture.CLAMP_ADDRESSMODE;
  leaves.diffuseTexture=texture;leaves.useAlphaFromDiffuseTexture=true;leaves.transparencyMode=Material.MATERIAL_ALPHATEST;leaves.alphaCutOff=.45;
  this.fades=this.materials.map(m=>new CoverFade(m,19,26));
 }
 request(job:Job){
  const {e,n}=job,values=new Float32Array(13*13),blocked=new Uint8Array(17*17);
  // One-metre samples retain the existing 2 m triangle diagonals and cover leaf overhang.
  for(let y=0;y<13;y++)for(let x=0;x<13;x++)values[y*13+x]=this.data.height(e-2+x,n-2+y);
  const zone=this.data.geo.zoneAt(e+4,n+4),cover=zone?.rules.understoryCover??0;
  for(let y=0;y<17;y++)for(let x=0;x<17;x++){
   const E=e+x*.5,N=n+y*.5;
   blocked[y*17+x]=Number(!zone||cover<.05||this.blocked(E,N)||this.data.waterDepth(E,N)>.03);
  }
  this.inflight=job;
  void this.data.call('floor',{e,n,grid:{origin:[e-2,n-2],stepM:1,columns:13,rows:13,values},blocked},[values.buffer,blocked.buffer],1).then(geometry=>{
   if(this.wanted.has(job.id))this.completed={job,geometry};
  }).catch(()=>{this.failures++;if(this.wanted.has(job.id))this.queue.push(job);}).finally(()=>{this.inflight=undefined;});
 }
 build(job:Job,geometry:any){
  const meshes:Mesh[]=[];
  for(const [i,key]of ['grass','leaves'].entries()){
   const g=geometry[key];if(!g.indices.length)continue;
   const m=new Mesh('understory-'+key+'-'+job.id,this.scene),v=new VertexData();Object.assign(v,g);v.applyToMesh(m);m.material=this.materials[i];
   m.position.set(job.e-this.origin.e,0,this.origin.n-job.n);m.metadata={e:job.e,n:job.n};m.isPickable=false;m.receiveShadows=true;m.freezeWorldMatrix();meshes.push(m);
  }
  this.cells.set(job.id,meshes);
 }
 update(p:EN){
  const key=tileKey(p.e,p.n,8);
  if(key!==this.last){
   this.last=key;this.queue=[];this.wanted.clear();const e=Math.floor(p.e/8)*8,n=Math.floor(p.n/8)*8;
   for(let y=-3;y<=3;y++)for(let x=-3;x<=3;x++){
    const ee=e+x*8,nn=n+y*8,id=tileKey(ee,nn,8);this.wanted.add(id);
    if(!this.cells.has(id)&&this.inflight?.id!==id&&this.completed?.job.id!==id)this.queue.push({e:ee,n:nn,id});
   }
   this.queue.sort((a,b)=>Math.hypot(a.e+4-p.e,a.n+4-p.n)-Math.hypot(b.e+4-p.e,b.n+4-p.n));
   for(const [id,meshes]of this.cells)if(!this.wanted.has(id)){for(const m of meshes)m.dispose();this.cells.delete(id);}
  }
  if(this.completed){const {job,geometry}=this.completed;this.completed=undefined;if(this.wanted.has(job.id))this.build(job,geometry);}
  if(!this.inflight){const next=this.queue[0];if(next&&this.data.ready(next.e,next.n)&&this.data.ready(next.e+8,next.n+8)){this.queue.shift();this.request(next);}}
  for(const fade of this.fades)fade.feet={x:p.e-this.origin.e,y:0,z:this.origin.n-p.n};
  for(const meshes of this.cells.values())for(const m of meshes)m.setEnabled(Math.hypot(m.metadata.e+4-p.e,m.metadata.n+4-p.n)<32);
 }
 rebase(origin:EN){this.origin=origin;for(const meshes of this.cells.values())for(const m of meshes){m.unfreezeWorldMatrix();m.position.x=m.metadata.e-origin.e;m.position.z=origin.n-m.metadata.n;m.freezeWorldMatrix();}}
}
