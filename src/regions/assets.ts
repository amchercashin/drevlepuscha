import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import type {RegionWorld} from './world.ts';
import {VegetationWind} from '../runtime/vegetation-wind.ts';
import {CoverFade} from '../runtime/cover-fade.ts';
import {ShrubPassage} from './undergrowth.ts';

export class RegionAssets {
 index:Record<string,{data:string;dimensions:number[];triangles:number[]}>={};
 pending=new Map<string,Promise<Mesh[][]>>();fades:CoverFade[]=[];failures:string[]=[];
 constructor(public world:RegionWorld){}
 async init(){const r=await fetch(import.meta.env.BASE_URL+'regions/brandywine-bridge/assets/index.json');if(!r.ok)throw Error('Regional assets unavailable');this.index=await r.json();return this;}
 load(id:string):Promise<Mesh[][]>{
  const old=this.pending.get(id);if(old)return old;
  const task=(async()=>{
   const spec=this.index[id];if(!spec)throw Error('Missing regional model '+id);
   const base='regions/brandywine-bridge/assets/',data=await this.world.data.json(spec.data,base);
   const plant=['grass-short','grass-tall','flowers-cream','flowers-blue','fern','hazel','dogrose'].includes(id);
   const tree=['oak','alder','willow','birch'].includes(id);
   const materials:StandardMaterial[]=await Promise.all(data.materials.map(async(s:any,i:number)=>{
    const m=new StandardMaterial('regional-'+id+'-'+i,this.world.scene);m.specularColor=Color3.Black();m.backFaceCulling=!s.doubleSided;m.twoSidedLighting=s.doubleSided;
    if(s.texture){let texture!:Texture;await new Promise<void>((resolve,reject)=>{texture=new Texture(import.meta.env.BASE_URL+base+s.texture,this.world.scene,false,false,Texture.TRILINEAR_SAMPLINGMODE,resolve,()=>reject(Error('Texture '+id)));});m.diffuseTexture=texture;texture.anisotropicFilteringLevel=4;if(s.alpha){texture.hasAlpha=true;m.useAlphaFromDiffuseTexture=true;m.transparencyMode=1;m.alphaCutOff=.4;}}
    if(plant){m.diffuseColor=new Color3(.83,.91,.70);this.fades.push(new CoverFade(m,id.startsWith('grass')?150:125,id.startsWith('grass')?195:170));if(id==='hazel'||id==='dogrose')new ShrubPassage(m);}
    if((plant||tree)&&this.world.library.wind)new VegetationWind(m,this.world.library.wind,'tree',()=>this.world.origin);
    return m;
   }));
   return data.levels.map((parts:any[],li:number)=>parts.map((p:any,i:number)=>{const m=new Mesh('regional-source-'+id+'-'+li+'-'+i,this.world.scene),v=new VertexData();Object.assign(v,p);v.applyToMesh(m);m.material=materials[p.material];m.sideOrientation=1;m.isPickable=false;m.receiveShadows=true;m.setEnabled(false);return m;}));
  })();this.pending.set(id,task);void task.catch(e=>this.failures.push(String(e)));return task;
 }
}
