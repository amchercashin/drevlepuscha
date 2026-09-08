import jpeg from './meshy/node_modules/jpeg-js/index.js';
import {MeshoptSimplifier} from './meshy/node_modules/meshoptimizer/meshopt_simplifier.js';
import {canopyProxy} from './canopy-proxy.mjs';

const empty=name=>({name,positions:[],normals:[],uvs:[],colors:[],indices:[]});
/** This tree's atlas puts bark and foliage in separate islands. Bake sampled colour before
 * simplification: new triangles cannot span unrelated atlas islands. Keep the original LOD 0. */
export async function meshyTreeLevels(data){
 if(data.parts.length!==1)throw new Error('This tree LOD profile expects one Meshy mesh and atlas');
 await MeshoptSimplifier.ready;
 const bark=empty('bark'),foliage=empty('canopy'),maps=[new Map(),new Map()];
 for(const p of data.parts){
  if(data.textureMimeTypes[p.name]!=='image/jpeg')throw new Error('Tree colour baking currently expects the Meshy JPEG base-colour atlas');
  const {width,height,data:pixels}=jpeg.decode(data.textures[p.name],{useTArray:true,maxMemoryUsageInMB:64});
  function sample(u,v){const x=Math.max(0,Math.min(width-1,Math.floor(u*width))),y=Math.max(0,Math.min(height-1,Math.floor(v*height))),i=(y*width+x)*4;return Array.from(pixels.slice(i,i+3),x=>x/255);}
  for(let i=0;i<p.indices.length;i+=3){
   const ids=p.indices.slice(i,i+3),uv=[0,0];for(const j of ids){uv[0]+=p.uvs[j*2]/3;uv[1]+=p.uvs[j*2+1]/3;}
   const color=sample(...uv),leaf=color[1]-color[0]>.055;
   const target=leaf?foliage:bark,map=maps[leaf?1:0];
   for(const j of ids){
    // Weld position seams after removing atlas coordinates; preserve the bark/foliage boundary.
    const pos=p.positions.slice(j*3,j*3+3),key=pos.map(x=>Math.round(x*10000)).join(',');
    if(!map.has(key)){map.set(key,target.positions.length/3);target.positions.push(...pos);target.normals.push(...p.normals.slice(j*3,j*3+3));target.uvs.push(0,0);target.colors.push(...color,1);}
    target.indices.push(map.get(key));
   }
  }
 }
 if(!bark.indices.length||!foliage.indices.length)throw new Error('Tree palette segmentation failed; inspect atlas colours');
 function simplifyPart(source,target){
  const [indices]=MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(source.indices),new Float32Array(source.positions),3,new Float32Array(source.colors),4,[.3,.3,.3,0],null,target*3,1,['Permissive','Prune']);
  const result=empty(source.name),remap=new Map();
  for(const index of indices){if(!remap.has(index)){remap.set(index,remap.size);for(const [name,stride] of [['positions',3],['normals',3],['uvs',2],['colors',4]])result[name].push(...source[name].slice(index*stride,(index+1)*stride));}result.indices.push(remap.get(index));}
  return result;
 }
 function merge(parts){const out=empty(data.parts[0].name);for(const p of parts){const offset=out.positions.length/3;for(const key of ['positions','normals','uvs','colors'])out[key].push(...p[key]);out.indices.push(...p.indices.map(i=>i+offset));}return [out];}
 // Closed crown envelopes retain volume at a distance; decimating leaf surfaces made holes.
 const mid=merge([simplifyPart(bark,430),simplifyPart(foliage,1000)]);
 const far=merge([simplifyPart(bark,100),canopyProxy(foliage,8,4,3)]);
 return {levels:[data.parts,mid,far],bakedColorFromLevel:1,segmentation:{barkTriangles:bark.indices.length/3,foliageTriangles:foliage.indices.length/3}};
}
