import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import type {Scene} from '@babylonjs/core/scene.js';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {fadeOpacity,occludesTraveller} from '../domain/harness.ts';
import type {FrameWorkBudget} from '../runtime/startup.ts';
import {brandywineStructureLayout,regionPierAt} from '../domain/regions/structure-layout.ts';
import type {RegionWorld} from './world.ts';
import type {EN} from '../world/schema.ts';
import {placedAssets} from './placed-asset.ts';
export function createStructures(scene:Scene,world:RegionWorld){
 const meshes:Mesh[]=[],layout=brandywineStructureLayout(world.data.geo,world.terrain.trailAt);
 const {placements,colliders}=layout;
 const material=(name:string,color:string)=>{const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor=Color3.Black();return m;};
 const stone=material('bridge-stone','#99927d'),hedge=material('living-hedge','#536739'),wood=material('weathered-wood','#79604c'),wall=material('inn-walls','#cfb897');
 const box=(id:string,e:number,n:number,y:number,width:number,height:number,depth:number,mat:StandardMaterial,yaw=0)=>{const m=CreateBox(id,{width,height,depth},scene);m.position.set(e,y,-n);m.rotation.y=yaw;m.material=mat;m.receiveShadows=true;m.metadata={e,n};meshes.push(m);return m;};
 const materials={stone,hedge,wood,wall};
 for(const item of layout.boxes)box(item.id,item.e,item.n,item.y,item.width,item.height,item.depth,materials[item.material],item.yaw);
 // Merge hedge volumes into bounded chunks; the gate remains a separate collider and visual.
 const groups=new Map<string,Mesh[]>();for(const m of meshes.filter(m=>m.name==='high-hay')){const k=Math.floor(m.metadata.e/128)+','+Math.floor(m.metadata.n/128),g=groups.get(k)??[];g.push(m);groups.set(k,g);}
 for(const group of groups.values()){const merged=Mesh.MergeMeshes(group,true,true);if(merged){merged.name='high-hay-chunk';merged.metadata={e:0,n:0};merged.receiveShadows=true;meshes.push(merged);}}
 for(let i=meshes.length-1;i>=0;i--)if(meshes[i].isDisposed())meshes.splice(i,1);
 const gate=meshes.find(m=>m.name==='north-gate')!;
 const replaced=new Set<string>(),art=placedAssets(world,placements,meshes,item=>{for(const name of item.replace??[])replaced.add(name);for(const m of meshes)if(replaced.has(m.name))m.setEnabled(false);});
 const failures:string[]=[];
 world.onRebase.push((o:EN)=>{for(const m of meshes)m.position.set(m.metadata.e-o.e,m.position.y,o.n-m.metadata.n);});
 return {meshes,colliders,failures,blocked:(e:number,n:number)=>colliders.some(c=>Math.abs(e-c.e)<c.width/2+.28&&Math.abs(n-c.n)<c.depth/2+.28)||art.blocked(e,n,world.data.height(e,n)),bridgePierAt:(e:number,n:number)=>regionPierAt(layout,e,n),
  update:(p:EN,h:number,eye:Vector3,dt:number,open:boolean,budget:FrameWorkBudget)=>{gate.setEnabled(!open&&!replaced.has('north-gate'));art.update(p,h,eye,dt,open,budget);const feet={x:p.e-world.origin.e,y:h,z:world.origin.n-p.n};
   for(const m of [...meshes,...[...world.props.cells.values()].flatMap(c=>c.meshes)]){if(!m.isEnabled()||m.metadata?.regionalAsset)continue;m.computeWorldMatrix();const b=m.getBoundingInfo().boundingBox,close=Vector3.Distance(b.centerWorld,new Vector3(feet.x,feet.y,feet.z))<b.extendSizeWorld.length()+25;
    const blocked=close&&occludesTraveller(eye,feet,{id:m.id,min:b.minimumWorld,max:b.maximumWorld},m.visibility<.99);m.visibility=fadeOpacity(m.visibility,blocked?.16:1,dt,blocked?.12:.3);
   }
  }};
}
