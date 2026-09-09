/** Offline, repeatable variants and LOD. Does not call any paid API. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import {readMeshyGLB} from './meshy-glb.mjs';
import {meshyTreeLevels} from './meshy-lod.mjs';
import {assetWarp,warpAssetPoint,validateAssetWarp,ASSET_VARIATION_VERSION} from '../src/domain/asset-variation.ts';
const configPath=process.argv[2];if(!configPath)throw new Error('Provide asset config JSON');
const config=JSON.parse(readFileSync(configPath)),profile=config.runtime,base=config.outputs.a,source=readFileSync(base+'/source.glb');
if(!['tree','prop'].includes(profile.kind)||!Number.isInteger(profile.variationCount)||profile.variationCount<1||profile.variationCount>4)throw new Error('Choose tree/prop and 1–4 reusable variants');
const original=readMeshyGLB(source,profile.heightMeters),sourceHash=createHash('sha256').update(source).digest('hex');
let horizontalPivot=[0,0];
if(profile.kind==='prop'){
 const min=[Infinity,Infinity],max=[-Infinity,-Infinity];for(const p of original.parts)for(let i=0;i<p.positions.length;i+=3)for(const [j,axis] of [0,2].entries()){min[j]=Math.min(min[j],p.positions[i+axis]);max[j]=Math.max(max[j],p.positions[i+axis]);}
 horizontalPivot=min.map((n,i)=>(n+max[i])/2);for(const p of original.parts)for(let i=0;i<p.positions.length;i+=3){p.positions[i]-=horizontalPivot[0];p.positions[i+2]-=horizontalPivot[1];}
}
if(original.parts.length>profile.maxMaterials||original.triangles>profile.maxTriangles[0]||original.textureInfo.some(t=>Math.max(...t.size)>profile.maxTextureSize))throw new Error('Source exceeds asset budget');
const textureFiles={};for(const [name,bytes] of Object.entries(original.textures)){const filename=name+(original.textureMimeTypes[name]==='image/jpeg'?'.jpg':'.png');writeFileSync(base+'/'+filename,bytes);textureFiles[name]=filename;}
const variants=[];
for(let index=0;index<profile.variationCount;index++){
 const parameters=validateAssetWarp(profile.variantParameters?.[index]??assetWarp(config.id,index)),parts=structuredClone(original.parts);
 const tintRGB=profile.kind==='tree'?[1,1,1]:(profile.tintRGBByVariant?.[index]??[[1,1,1],[.96,1.03,1.02],[1.04,.98,.94]][index%3]);
 if(tintRGB.length!==3||tintRGB.some(x=>!Number.isFinite(x)||x<.8||x>1.2))throw new Error('Tint gains must have three channels in .8..1.2');
 for(const part of parts){for(let i=0;i<part.colors.length;i++)if(i%4<3)part.colors[i]*=tintRGB[i%4];for(let i=0;i<part.positions.length;i+=3)part.positions.splice(i,3,...warpAssetPoint(...part.positions.slice(i,i+3),profile.heightMeters,parameters,profile.kind));
  if(index>0)VertexData.ComputeNormals(part.positions,part.indices,part.normals,{useRightHandedSystem:true});
 }
 const prepared=profile.kind==='tree'?await meshyTreeLevels({...original,parts},profile.maxTriangles[1]-10):{levels:[parts],bakedColorFromLevel:undefined};
 const triangles=prepared.levels.map(level=>level.reduce((sum,p)=>sum+p.indices.length/3,0));
 if(triangles.some((count,i)=>count>profile.maxTriangles[i]))throw new Error('LOD budget exceeded: '+triangles);
 let rootRadius=0,trunkRadius=0;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const p of parts)for(let i=0;i<p.positions.length;i+=3){const [x,y,z]=p.positions.slice(i,i+3);if(y<1)rootRadius=Math.max(rootRadius,Math.hypot(x,z));if(y>=3&&y<=6)trunkRadius=Math.max(trunkRadius,Math.hypot(x,z));for(let j=0;j<3;j++){min[j]=Math.min(min[j],p.positions[i+j]);max[j]=Math.max(max[j],p.positions[i+j]);}}
 variants.push({id:config.id+'-'+index,parameters,tintRGB,rootRadius,trunkRadius,bounds:{min,max},triangles,levels:prepared.levels,bakedColorFromLevel:prepared.bakedColorFromLevel});
}
const result={version:ASSET_VARIATION_VERSION,profileHash:createHash('sha256').update(readFileSync(configPath)).digest('hex'),sourceHash,normalization:{...original.normalization,horizontalPivot},sourceId:config.id,kind:profile.kind,heightMeters:profile.heightMeters,textureFiles,textureInfo:original.textureInfo,doubleSided:original.doubleSided,variants};
writeFileSync(base+'/variants.json',JSON.stringify(result));console.log(JSON.stringify({id:config.id,variants:variants.map(v=>({id:v.id,triangles:v.triangles,bounds:v.bounds})),sharedTextures:original.textureInfo}));
