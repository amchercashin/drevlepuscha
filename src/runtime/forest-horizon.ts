import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import type {TreePlacement} from '../domain/forest.ts';
import type {Point3} from '../domain/harness.ts';

/** Spatial batches of the existing lowest LOD; identical transforms make the handoff seamless. */
export function forestHorizon(placements:TreePlacement[],templates:Mesh[]){
 const cells=new Map<string,{e:number;n:number;trees:TreePlacement[];meshes:Mesh[];detailed:boolean}>();
 const membership=new Map<string,string>();
 for(const p of placements){const e=Math.floor(p.e/64)*64,n=Math.floor(p.n/64)*64,key=`${e}:${n}`;let cell=cells.get(key);if(!cell){cell={e,n,trees:[],meshes:[],detailed:false};cells.set(key,cell);}cell.trees.push(p);membership.set(p.id,key);}
 for(const [key,cell] of cells){
  const matrices=new Float32Array(cell.trees.length*16);
  cell.trees.forEach((p,i)=>Matrix.Compose(new Vector3(p.width,p.height,p.width),Quaternion.FromEulerAngles(0,p.yaw,0),new Vector3(p.e,p.y,-p.n)).copyToArray(matrices,i*16));
  cell.meshes=templates.map((source,i)=>{const mesh=new Mesh(`horizon-${key}-${i}`,source.getScene());source.geometry!.copy(`horizon-geometry-${key}-${i}`).applyToMesh(mesh);mesh.material=source.material;mesh.sideOrientation=source.sideOrientation;mesh.isPickable=false;mesh.thinInstanceSetBuffer('matrix',matrices,16,true);mesh.thinInstanceRefreshBoundingInfo();mesh.freezeWorldMatrix();return mesh;});
 }
 function distance(p:Point3,c:{e:number;n:number}){return Math.hypot(Math.max(c.e-p.x,0,p.x-c.e-64),Math.max(c.n+p.z,0,-p.z-c.n-64));}
 return {
  update(camera:Point3,feet:Point3){for(const cell of cells.values()){const d=Math.min(distance(camera,cell),distance(feet,cell));cell.detailed=d<(cell.detailed?125:110);cell.meshes.forEach(m=>m.setEnabled(!cell.detailed));}},
  detailed(id:string){return cells.get(membership.get(id)!)!.detailed;},
  stats(){return {cells:cells.size,distantCells:[...cells.values()].filter(c=>!c.detailed).length,distantTrees:[...cells.values()].filter(c=>!c.detailed).reduce((n,c)=>n+c.trees.length,0)};},
 };
}
