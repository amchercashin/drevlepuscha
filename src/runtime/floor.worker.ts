import {makeCoverTile} from '../domain/cover-field.ts';
import {makeFloorPatch} from '../domain/floor-patch.ts';
import type {FloorGeometry} from '../domain/floor-patch.ts';
import type {Box} from '../domain/harness.ts';
import {enableShowcase} from '../domain/showcase.ts';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
export type PackedFloor={positions:Float32Array;indices:Uint32Array;colors:Float32Array;uvs:Float32Array;heights:Float32Array;normals:Float32Array};
let boxes:Box[]=[];enableShowcase();
function pack(g:FloorGeometry):PackedFloor{
 const normals:number[]=[];VertexData.ComputeNormals(g.positions,g.indices,normals);
 for(let i=0;i<normals.length;i+=3){normals[i+1]=Math.max(.65,Math.abs(normals[i+1]));const l=Math.hypot(normals[i],normals[i+1],normals[i+2]);for(let j=0;j<3;j++)normals[i+j]/=l;}
 return {positions:new Float32Array(g.positions),indices:new Uint32Array(g.indices),colors:new Float32Array(g.colors),uvs:new Float32Array(g.uvs),heights:new Float32Array(g.heights),normals:new Float32Array(normals)};
}
self.onmessage=({data})=>{
 if(data.type==='init'){boxes=data.boxes;return;}
 try{
  const start=performance.now();
  if(data.layer){
   const g=makeCoverTile(data.x,data.z,data.layer,boxes);
   const geometry={positions:new Float32Array(g.positions),indices:new Uint32Array(g.indices),normals:new Float32Array(g.normals),colors:new Float32Array(g.colors),uvs:new Float32Array(g.uvs)};
   self.postMessage({job:data,geometry,buildMs:performance.now()-start},{transfer:Object.values(geometry).map(a=>a.buffer)});return;
  }
  const patch=makeFloorPatch(data.x,data.z,boxes),result={grass:pack(patch.grass),leaves:pack(patch.leaves)};
  const transfer=Object.values(result).flatMap(g=>Object.values(g).map(a=>a.buffer));
  self.postMessage({job:data,data:result,buildMs:performance.now()-start},{transfer});
 }catch(error){self.postMessage({job:data,error:String(error)});}
};
