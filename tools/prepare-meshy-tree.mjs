import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {meshyTreeLevels} from './meshy-lod.mjs';
import {readMeshyGLB} from './meshy-glb.mjs';
import {treeGLB} from '../src/domain/tree-glb.ts';

const route=process.argv[2];if(!['a','b'].includes(route))throw new Error('Expected a or b');
const config=JSON.parse(readFileSync(process.argv[3]||'config/meshy-tree-trial.json'));
const base=config.outputs?.[route]??('assets/trees/meshy-'+route),source=readFileSync(base+'/source.glb');
const data=readMeshyGLB(source,config.runtime.heightMeters);
if(data.parts.length>config.runtime.maxMaterials||data.triangles>config.runtime.maxTriangles[0]||data.textureInfo.some(t=>Math.max(...t.size)>config.runtime.maxTextureSize))throw new Error('Meshy source exceeds runtime budget: '+JSON.stringify({triangles:data.triangles,textures:data.textureInfo}));
const count=parts=>parts.reduce((n,p)=>n+p.indices.length/3,0);
{
 const {levels,bakedColorFromLevel,segmentation}=await meshyTreeLevels(data);
 const triangles=levels.map(count);if(triangles.some((n,i)=>n>config.runtime.maxTriangles[i]))throw new Error('Derived LOD exceeds budget: '+triangles);
 const textureFiles={};
 for(const [name,bytes] of Object.entries(data.textures)){const filename=name+(data.textureMimeTypes[name]==='image/jpeg'?'.jpg':'.png');writeFileSync(base+'/'+filename,bytes);textureFiles[name]=filename;}
 const sourceHash=createHash('sha256').update(source).digest('hex');
 let rootRadius=0,trunkRadius=0;for(const p of data.parts)for(let i=0;i<p.positions.length;i+=3){const [x,y,z]=p.positions.slice(i,i+3),radius=Math.hypot(x,z);if(y<1)rootRadius=Math.max(rootRadius,radius);if(y>=3&&y<=6)trunkRadius=Math.max(trunkRadius,radius);}
 const cache={rootRadius,trunkRadius,bakedColorFromLevel,segmentation,placement:config.runtime.placement,version:'meshy-'+route+'-v3',algorithm:'meshy-static-glb-v3-color-bake-closed-canopy-meshoptimizer-1.2.0',sourceHash,triangles,normalization:data.normalization,textureInfo:data.textureInfo,textureFiles,doubleSided:data.doubleSided,levels};
 writeFileSync(base+'/tree.json',JSON.stringify(cache));
 writeFileSync(base+'/tree.glb',new Uint8Array(treeGLB(data.parts,data.textures,cache.version,{textureMimeTypes:data.textureMimeTypes,doubleSided:data.doubleSided,source:'Meshy Smart Topology T2; normalized in metres; source and parameters in generation.json'})));
 console.log(JSON.stringify({route,triangles,materials:data.parts.length,textures:data.textureInfo,normalization:data.normalization}));
}
