import {enableShowcase} from '../domain/showcase.ts';
import {makeFloorPatch} from '../domain/floor-patch.ts';
import {makeCoverTile} from '../domain/cover-field.ts';
import type {Box} from '../domain/harness.ts';

enableShowcase();
let boxes:Box[]=[];
type Source={positions:number[];indices:number[];colors:number[];uvs:number[];normals?:number[];wind?:number[]};
type Collector={vertices:number[];indices:number[]};
function normalsFor(source:Source):number[]{
 if(source.normals?.length===source.positions.length)return source.normals;
 const normals=new Array<number>(source.positions.length).fill(0);
 for(let i=0;i<source.indices.length;i+=3){
  const a=source.indices[i]*3,b=source.indices[i+1]*3,c=source.indices[i+2]*3,p=source.positions;
  const ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2];
  const vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  for(const vertex of [a,b,c]){normals[vertex]+=nx;normals[vertex+1]+=ny;normals[vertex+2]+=nz;}
 }
 for(let i=0;i<normals.length;i+=3){
  // Thin two-sided leaves receive sky fill while retaining their actual tilt.
  const x=normals[i],y=Math.max(.65,Math.abs(normals[i+1])),z=normals[i+2],length=Math.hypot(x,y,z);
  normals[i]=x/length;normals[i+1]=y/length;normals[i+2]=z/length;
 }
 return normals;
}
function append(out:Collector,source:Source){
 const offset=out.vertices.length/16;
 const normals=normalsFor(source);
 const linear=(value:number)=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
 for(let i=0;i<source.positions.length/3;i++){
  out.vertices.push(source.positions[i*3],source.positions[i*3+1],source.positions[i*3+2],
   normals[i*3],normals[i*3+1],normals[i*3+2],
   source.uvs[i*2]??0,source.uvs[i*2+1]??0,
   linear(source.colors[i*4]??1),linear(source.colors[i*4+1]??1),linear(source.colors[i*4+2]??1),source.colors[i*4+3]??1,
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
