import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {Vector3,Matrix,Quaternion} from '@babylonjs/core/Maths/math.vector.js';
import {collisionGeometry,meshCollider,meshBlocksCylinder} from '../domain/mesh-collision.ts';
import type {CollisionGeometry,MeshCollider} from '../domain/mesh-collision.ts';
import {fadeOpacity,occludesTraveller} from '../domain/harness.ts';
import type {RegionWorld} from './world.ts';
import type {FrameWorkBudget} from '../runtime/startup.ts';
import type {EN} from '../world/schema.ts';
export type AssetPlacement={id:string;asset:string;e:number;n:number;y:number;yaw?:number;scale?:[number,number,number];replace?:string[];gate?:boolean;solid?:boolean};
export function placedAssets(world:RegionWorld,placements:AssetPlacement[],meshes:Mesh[],onReady:(p:AssetPlacement)=>void){
 const requested=new Set<string>(),loaded=new Map<string,Mesh[][]>(),queue:(()=>void)[]=[];
 const shapes=new Map<string,CollisionGeometry>(),colliders:MeshCollider[]=[];
 world.onRebase.push(o=>{for(const levels of loaded.values())for(const level of levels)for(const m of level)m.position.set(m.metadata.e-o.e,m.position.y,o.n-m.metadata.n);});
 return {blocked:(e:number,n:number,h:number)=>colliders.some(c=>meshBlocksCylinder(c,{x:e,y:h,z:-n},.28,1.78)),update(p:EN,h:number,eye:Vector3,dt:number,open:boolean,budget:FrameWorkBudget){
  for(const item of placements){const distance=Math.hypot(item.e-p.e,item.n-p.n);
   if(distance<850&&!requested.has(item.id)&&world.assets.index[item.asset]){requested.add(item.id);void world.assets.load(item.asset).then(levels=>queue.push(()=>{
    const copies=levels.map((parts,li)=>parts.map((s,i)=>{const m=new Mesh(item.id+'-'+li+'-'+i,world.scene);s.geometry!.applyToMesh(m);m.material=s.material;m.sideOrientation=s.sideOrientation;m.isPickable=false;m.receiveShadows=true;m.metadata={e:item.e,n:item.n,regionalAsset:true};m.position.set(item.e-world.origin.e,item.y,world.origin.n-item.n);m.rotation.y=item.yaw??0;m.scaling.copyFromFloats(...(item.scale??[1,1,1]));m.setEnabled(false);meshes.push(m);return m;}));loaded.set(item.id,copies);onReady(item);
    if(item.solid){let shape=shapes.get(item.asset);if(!shape){shape=collisionGeometry(levels[0].map(m=>({positions:m.getVerticesData('position')!,indices:m.getIndices()!})));shapes.set(item.asset,shape);}const matrix=Matrix.Compose(new Vector3(...(item.scale??[1,1,1])),Quaternion.RotationYawPitchRoll(item.yaw??0,0,0),new Vector3(item.e,item.y,-item.n));colliders.push(meshCollider(shape,matrix.m,Matrix.Invert(matrix).m));}
   })).catch(()=>{});}
   const levels=loaded.get(item.id);if(!levels)continue;const lod=distance<95?0:distance<300?1:2;
   for(const [i,level]of levels.entries())for(const m of level){m.setEnabled(distance<1300&&i===Math.min(lod,levels.length-1)&&!(item.gate&&open));if(!m.isEnabled())continue;
    const feet={x:p.e-world.origin.e,y:h,z:world.origin.n-p.n};m.computeWorldMatrix();const box=m.getBoundingInfo().boundingBox;
    const blocked=distance<45&&occludesTraveller(eye,feet,{id:m.id,min:box.minimumWorld,max:box.maximumWorld},m.visibility<.99);m.visibility=fadeOpacity(m.visibility,blocked?.16:1,dt,blocked?.12:.3);
   }
  }
  if(queue.length)budget.run(()=>queue.shift()!());
 }};
}
