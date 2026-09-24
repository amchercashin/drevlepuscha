import {enableShowcase} from '../domain/showcase.ts';
import {makeFloorPatch} from '../domain/floor-patch.ts';
import {makeCoverTile} from '../domain/cover-field.ts';
import type {Box} from '../domain/harness.ts';

enableShowcase();
let boxes:Box[]=[];
type Source={positions:number[];indices:number[];colors:number[];uvs:number[];normals?:number[];wind?:number[]};
type Collector={vertices:number[];indices:number[]};
function append(out:Collector,source:Source){
 const offset=out.vertices.length/16;
 for(let i=0;i<source.positions.length/3;i++){
  out.vertices.push(source.positions[i*3],source.positions[i*3+1],source.positions[i*3+2],
   source.normals?.[i*3]??0,source.normals?.[i*3+1]??1,source.normals?.[i*3+2]??0,
   source.uvs[i*2]??0,source.uvs[i*2+1]??0,
   source.colors[i*4]??1,source.colors[i*4+1]??1,source.colors[i*4+2]??1,source.colors[i*4+3]??1,
   source.wind?.[i*4]??0,source.wind?.[i*4+1]??0,source.wind?.[i*4+2]??0,source.wind?.[i*4+3]??0);
 }
 for(const index of source.indices)out.indices.push(index+offset);
}
function finish(out:Collector){return {vertices:new Float32Array(out.vertices),indices:new Uint32Array(out.indices)};}
self.onmessage=({data})=>{
 if(data.type==='init'){boxes=data.boxes;return;}
 if(data.type!=='build')return;
 try{
  const grass:Collector={vertices:[],indices:[]},leaves:Collector={vertices:[],indices:[]},cover:Collector={vertices:[],indices:[]};
  const cx=Math.floor(data.e/8),cz=Math.floor(data.n/8);
  for(let z=cz-2;z<=cz+2;z++)for(let x=cx-2;x<=cx+2;x++){
   const patch=makeFloorPatch(x,z,boxes);append(grass,patch.grass);append(leaves,patch.leaves);
  }
  const mx=Math.floor(data.e/32),mz=Math.floor(data.n/32);
  for(let z=mz-2;z<=mz+2;z++)for(let x=mx-2;x<=mx+2;x++)append(cover,makeCoverTile(x,z,'mid',boxes));
  const result={type:'built',id:data.id,center:{e:data.e,n:data.n},grass:finish(grass),leaves:finish(leaves),cover:finish(cover)};
  self.postMessage(result,{transfer:[result.grass.vertices.buffer,result.grass.indices.buffer,result.leaves.vertices.buffer,result.leaves.indices.buffer,result.cover.vertices.buffer,result.cover.indices.buffer]});
 }catch(error){self.postMessage({type:'error',id:data.id,error:String(error)});}
};
