import type {PackedFloor} from './floor.worker.ts';
import {CoverFade} from './cover-fade.ts';
import {createCoverField} from './cover-field.ts';
import {COVER} from '../domain/cover-field.ts';
import {showcaseEnabled} from '../domain/showcase.ts';
import {MaterialPluginBase} from '@babylonjs/core/Materials/materialPluginBase.js';
import type {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage.js';
import type {UniformBuffer} from '@babylonjs/core/Materials/uniformBuffer.js';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Material} from '@babylonjs/core/Materials/material.js';
import {Texture} from '@babylonjs/core/Materials/Textures/texture.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {Box,Point3} from '../domain/harness.ts';
import {makeFloorPatch,floorCellDistance,FLOOR_HIDE_M} from '../domain/floor-patch.ts';
import type {FloorGeometry} from '../domain/floor-patch.ts';
import soilURL from '../../assets/floor/soil.png';
import foliageURL from '../../assets/floor/foliage.png';

class GrassDistance extends MaterialPluginBase {
 feet:Point3={x:0,y:0,z:0};
 constructor(material:StandardMaterial){super(material,'GrassDistance',220,{GRASS_DISTANCE:true},true,false);this._enable(true);}
 override isCompatible(_language:ShaderLanguage){return true;}
 override getAttributes(attributes:string[]){attributes.push('bladeHeight');}
 override getUniforms(language:ShaderLanguage){return {ubo:[{name:'grassFeet',size:3,type:'vec3'}],vertex:language===0?'#ifndef UNIFORMBUFFERS\nuniform vec3 grassFeet;\n#endif':''};}
 override bindForSubMesh(ubo:UniformBuffer){ubo.updateFloat3('grassFeet',this.feet.x,this.feet.y,this.feet.z);}
 override getCustomCode(type:string,language:ShaderLanguage){if(type!=='vertex')return null;return {CUSTOM_VERTEX_DEFINITIONS:language===1?'attribute bladeHeight: f32;':'attribute float bladeHeight;',CUSTOM_VERTEX_UPDATE_POSITION:language===1?'positionUpdated.y -= vertexInputs.bladeHeight * smoothstep(14.0,21.0,distance(positionUpdated.xz,uniforms.grassFeet.xz));':'positionUpdated.y -= bladeHeight * smoothstep(14.0,21.0,distance(positionUpdated.xz,grassFeet.xz));'};}
}

/** Painted litter with mipmaps; mirrored wrap makes unmatched tile edges continuous. */
export function soilTexture(scene:Scene){
 const texture=new Texture(soilURL,scene);texture.wrapU=Texture.MIRROR_ADDRESSMODE;texture.wrapV=Texture.MIRROR_ADDRESSMODE;texture.anisotropicFilteringLevel=4;return texture;
}
export function createForestFloor(scene:Scene,boxes:Box[]){
 const grass=new StandardMaterial('grass',scene),leaves=new StandardMaterial('floor-leaves',scene);
 for(const m of [grass,leaves]){m.diffuseColor=Color3.White();m.specularColor=Color3.Black();m.backFaceCulling=false;m.twoSidedLighting=true;}
 if(showcaseEnabled){leaves.emissiveColor=new Color3(.12,.17,.065);grass.emissiveColor=new Color3(.045,.075,.025);}
 leaves.diffuseTexture=new Texture(foliageURL,scene);leaves.diffuseTexture.hasAlpha=true;leaves.useAlphaFromDiffuseTexture=true;leaves.transparencyMode=Material.MATERIAL_ALPHATEST;leaves.alphaCutOff=.45;
 leaves.diffuseTexture.wrapU=Texture.CLAMP_ADDRESSMODE;leaves.diffuseTexture.wrapV=Texture.CLAMP_ADDRESSMODE;
 const distances=showcaseEnabled?[new CoverFade(grass,COVER.nearStart,COVER.nearEnd),new CoverFade(leaves,COVER.nearStart,COVER.nearEnd)]:[new GrassDistance(grass),new GrassDistance(leaves)];
 const field=showcaseEnabled?createCoverField(scene,boxes,leaves.diffuseTexture):null;
 const radius=showcaseEnabled?COVER.nearRadius:3,hideM=showcaseEnabled?COVER.nearEnd:FLOOR_HIDE_M;
 let lastBuildMs=0,maxBuildMs=0,preparationMaxBuildMs=0;
 let anchor:Point3={x:0,y:0,z:0};
 const cells=new Map<string,{x:number;z:number;meshes:Mesh[]}>();
 let lastE=Infinity,lastN=Infinity,pending:{x:number;z:number;key:string}[]=[];
 function mesh(g:FloorGeometry|PackedFloor,name:string,material:StandardMaterial){
  if(!g.indices.length)return [];
  const normals='normals' in g?g.normals:[];if(!('normals' in g)){VertexData.ComputeNormals(g.positions,g.indices,normals);
  // Bent foliage normals favour the sky fill instead of black vertical cards.
  for(let i=0;i<normals.length;i+=3){normals[i+1]=Math.max(.65,Math.abs(normals[i+1]));const l=Math.hypot(normals[i],normals[i+1],normals[i+2]);for(let j=0;j<3;j++)normals[i+j]/=l;}}
  const data=new VertexData();Object.assign(data,{positions:g.positions,indices:g.indices,colors:g.colors,uvs:g.uvs,normals});
  const m=new Mesh(name,scene);data.applyToMesh(m);if(!showcaseEnabled)m.setVerticesData('bladeHeight',g.heights,false,1);m.material=material;m.isPickable=false;m.receiveShadows=true;m.freezeWorldMatrix();return [m];
 }
 type Job={x:number;z:number;key:string};
 const worker=showcaseEnabled?new Worker(new URL('./floor.worker.ts',import.meta.url),{type:'module'}):null;
 let workerJob:Job|null=null,prepared:{job:Job;data:{grass:PackedFloor;leaves:PackedFloor}}|null=null,workerError='',workerMaxBuildMs=0;
 if(worker){
  worker.postMessage({type:'init',boxes});
  worker.onmessage=({data})=>{workerJob=null;if(data.error)workerError=data.error;else{prepared=data;workerMaxBuildMs=Math.max(workerMaxBuildMs,data.buildMs);}};
  worker.onerror=e=>{workerError=e.message||'Не удалось подготовить растительность';};
  scene.onDisposeObservable.add(()=>worker.terminate());
 }
 const queued=()=>[...pending,...(workerJob?[workerJob]:[]),...(prepared?[prepared.job]:[])];
 function activate(next:Job,data:{grass:FloorGeometry|PackedFloor;leaves:FloorGeometry|PackedFloor}){
  if(Math.abs(next.x-lastE)>radius||Math.abs(next.z-lastN)>radius)return;
  const started=performance.now();cells.set(next.key,{x:next.x,z:next.z,meshes:[...mesh(data.grass,'grass-'+next.key,grass),...mesh(data.leaves,'leaves-'+next.key,leaves)]});
  lastBuildMs=performance.now()-started;maxBuildMs=Math.max(maxBuildMs,lastBuildMs);
 }
 function update(feet:Point3){
  if(workerError)throw new Error(workerError);
  anchor=feet;for(const d of distances)d.feet=feet;
  const cx=Math.floor(feet.x/8),cz=Math.floor(-feet.z/8);
  if(cx!==lastE||cz!==lastN){
   lastE=cx;lastN=cz;const wanted=new Set<string>();pending=[];
   for(let z=cz-radius;z<=cz+radius;z++)for(let x=cx-radius;x<=cx+radius;x++){
    const key=`${x}:${z}`;wanted.add(key);if(!cells.has(key)&&key!==workerJob?.key&&key!==prepared?.job.key)pending.push({x,z,key});
   }
   pending.sort((a,b)=>Math.hypot(a.x-cx,a.z-cz)-Math.hypot(b.x-cx,b.z-cz));
   for(const [key,c] of cells)if(!wanted.has(key)){for(const m of c.meshes)m.dispose();cells.delete(key);}
  }
  // One GPU activation per frame; the showcase geometry and normals are prepared off-thread.
  lastBuildMs=0;let activated=false;
  if(prepared){activate(prepared.job,prepared.data);prepared=null;activated=true;}
  if(!workerJob&&!prepared){const next=pending.shift();if(next){if(worker){workerJob=next;worker.postMessage(next);}else{activate(next,makeFloorPatch(next.x,next.z,boxes));activated=true;}}}
  field?.update(feet,!activated);
  for(const c of cells.values()){
   const visible=floorCellDistance(feet.x,-feet.z,c.x,c.z)<hideM;
   for(const m of c.meshes)m.setEnabled(visible);
  }
 }
 async function prepare(feet:Point3,progress:(ready:number)=>void){
  do{update(feet);const f=field?.stats();progress(cells.size+(f?.farTiles??0)+(f?.midTiles??0));await new Promise(resolve=>setTimeout(resolve,0));}while(queued().length||field?.hasPending());
  preparationMaxBuildMs=maxBuildMs;maxBuildMs=0;
 }
 return {update,prepare,stats:()=>({cells:cells.size,pending:queued().length,pendingNear:queued().filter(c=>floorCellDistance(anchor.x,-anchor.z,c.x,c.z)<COVER.nearStart).length,cacheLimit:(radius*2+1)**2,hideM,lastBuildMs,maxBuildMs,workerMaxBuildMs,preparationMaxBuildMs,field:field?.stats()??null,triangles:[...cells.values()].reduce((sum,c)=>sum+c.meshes.reduce((s,m)=>s+m.getTotalIndices()/3,0),0)})};
}
