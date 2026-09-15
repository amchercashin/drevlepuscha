import {expandWindBounds} from './vegetation-wind.ts';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import '@babylonjs/core/Meshes/thinInstanceMesh.js';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import type {TreePlacement} from '../domain/forest.ts';
import type {Point3} from '../domain/harness.ts';

/** Spatial batches of the existing lowest LOD; identical transforms make the handoff seamless. */
export function forestHorizon(placements:TreePlacement[],templates:Mesh[]|((p:TreePlacement)=>Mesh[]),tones?:ReadonlyMap<string,Vector3>,wind=false){
 const cells=new Map<string,{e:number;n:number;trees:TreePlacement[];meshes:Mesh[];detailed:boolean;min?:Vector3;max?:Vector3;fogHidden?:boolean}>();
 const membership=new Map<string,string>();
 const crownMargin=placements.reduce((r,p)=>Math.max(r,6*Math.max(p.width,p.depth)+8),0);
 let detailedEntry=Math.max(72,53+crownMargin);
 for(const p of placements){const e=Math.floor(p.e/64)*64,n=Math.floor(p.n/64)*64,key=`${e}:${n}`;let cell=cells.get(key);if(!cell){cell={e,n,trees:[],meshes:[],detailed:false};cells.set(key,cell);}cell.trees.push(p);membership.set(p.id,key);}
 for(const [key,cell] of cells){
  const groups=new Map<string,{trees:TreePlacement[];sources:Mesh[]}>();
  for(const p of cell.trees){const sources=typeof templates==='function'?templates(p):templates,key=sources[0].id;let group=groups.get(key);if(!group){group={trees:[],sources};groups.set(key,group);}group.trees.push(p);}
  for(const [groupId,group] of groups){
   const matrices=new Float32Array(group.trees.length*16);
   group.trees.forEach((p,i)=>Matrix.Compose(new Vector3(p.width,p.height,p.depth),Quaternion.FromEulerAngles(p.leanX,p.yaw,p.leanZ),new Vector3(p.e,p.y,-p.n)).copyToArray(matrices,i*16));
   const colors=tones?new Float32Array(group.trees.flatMap(p=>tones.get(p.id)!.asArray())):undefined;
   cell.meshes.push(...group.sources.map((source,i)=>{const mesh=new Mesh(`horizon-${key}-${groupId}-${i}`,source.getScene());source.geometry!.copy(`horizon-geometry-${key}-${groupId}-${i}`).applyToMesh(mesh);mesh.material=source.material;if(wind)mesh.metadata={windTree:source.metadata.windTree};mesh.sideOrientation=source.sideOrientation;mesh.isPickable=false;mesh.receiveShadows=true;mesh.thinInstanceSetBuffer('matrix',matrices,16,true);if(colors)mesh.thinInstanceSetBuffer('treeTone',colors,3,true);mesh.thinInstanceRefreshBoundingInfo();if(wind)expandWindBounds(mesh,group.trees.reduce((r,p)=>Math.max(r,p.height*source.metadata.windTree[0]*.36),0));mesh.freezeWorldMatrix();return mesh;}));
  }
  cell.min=new Vector3(Infinity,Infinity,Infinity);cell.max=new Vector3(-Infinity,-Infinity,-Infinity);
  for(const mesh of cell.meshes){const box=mesh.getBoundingInfo().boundingBox;cell.min.minimizeInPlace(box.minimumWorld);cell.max.maximizeInPlace(box.maximumWorld);}
 }
 function distance(p:Point3,c:{e:number;n:number}){return Math.hypot(Math.max(c.e-p.x,0,p.x-c.e-64),Math.max(c.n+p.z,0,-p.z-c.n-64));}
 let active:TreePlacement[]=[];
 return {
  activePlacements:()=>active,
  setDetail:(scale:number)=>{detailedEntry=Math.max(72*scale,53*scale+crownMargin);},
  update(camera:Point3,feet:Point3){
   const scene=cells.values().next().value?.meshes[0]?.getScene();
   // EXP2 transmittance below 1/1024 is already visually opaque. Test full
   // transformed tree bounds, so crowns are not clipped at their cell edge.
   const fogLimit=scene?.fogEnabled&&scene.fogMode===2&&scene.fogDensity>0?Math.sqrt(Math.log(1024))/scene.fogDensity:Infinity;
   let changed=false;
   for(const cell of cells.values()){
    const d=Math.min(distance(camera,cell),distance(feet,cell));
    // Past this distance every individual is already LOD2. Hand off to the
    // identical LOD2 batches earlier, with ample crown margin and hysteresis.
    const detailed=d<(cell.detailed?detailedEntry+16:detailedEntry);
    const min=cell.min!,max=cell.max!;
    const fogHidden=Math.hypot(Math.max(min.x-camera.x,0,camera.x-max.x),Math.max(min.y-camera.y,0,camera.y-max.y),Math.max(min.z-camera.z,0,camera.z-max.z))>fogLimit;
    if(detailed!==cell.detailed){changed=true;cell.detailed=detailed;}
    cell.fogHidden=fogHidden;for(const mesh of cell.meshes){const enabled=!detailed&&!fogHidden;if(mesh.isEnabled()!==enabled)mesh.setEnabled(enabled);}
   }
   if(changed)active=[...cells.values()].filter(c=>c.detailed).flatMap(c=>c.trees);
  },
  detailed(id:string){return cells.get(membership.get(id)!)!.detailed;},
  stats(){return {cells:cells.size,geometryBuffers:[...cells.values()].reduce((n,c)=>n+c.meshes.length,0),fogHiddenCells:[...cells.values()].filter(c=>!c.detailed&&c.fogHidden).length,distantCells:[...cells.values()].filter(c=>!c.detailed).length,distantTrees:[...cells.values()].filter(c=>!c.detailed).reduce((n,c)=>n+c.trees.length,0)};},
 };
}
