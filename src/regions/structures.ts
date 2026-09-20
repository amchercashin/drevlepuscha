import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import type {Scene} from '@babylonjs/core/scene.js';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {fadeOpacity,occludesTraveller} from '../domain/harness.ts';
import type {FrameWorkBudget} from '../runtime/startup.ts';
import {REGION_BUILDINGS} from '../domain/regions/objects.mjs';
import type {RegionWorld} from './world.ts';
import type {EN} from '../world/schema.ts';
export function createStructures(scene:Scene,world:RegionWorld){
 const meshes:Mesh[]=[];const colliders:{e:number;n:number;width:number;depth:number;roof:number}[]=[];
 const material=(name:string,color:string)=>{const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor=Color3.Black();return m;};
 const stone=material('bridge-stone','#99927d'),hedge=material('living-hedge','#536739'),wood=material('weathered-wood','#79604c'),wall=material('inn-walls','#cfb897');
 const box=(id:string,e:number,n:number,y:number,width:number,height:number,depth:number,mat:StandardMaterial,yaw=0)=>{const m=CreateBox(id,{width,height,depth},scene);m.position.set(e,y,-n);m.rotation.y=yaw;m.material=mat;m.receiveShadows=true;m.metadata={e,n};meshes.push(m);return m;};
 for(const b of world.data.geo.bridges){
  for(let index=1;index<b.points.length;index++){
  const a=b.points[index-1],z=b.points[index],dx=z[0]-a[0],dn=z[1]-a[1],length=Math.hypot(dx,dn),yaw=-Math.atan2(dx,dn),e=(a[0]+z[0])/2,n=(a[1]+z[1])/2;
  box(b.id,e,n,b.deckHeightM-.3,b.widthM,.6,length,stone,yaw);
  for(const side of [-1,1])box(b.id+'-parapet',e+dn/length*(b.widthM/2+.1)*side,n-dx/length*(b.widthM/2+.1)*side,b.deckHeightM+.55,.35,1.1,length,stone,yaw);
  for(const t of [.33,.67]){const E=a[0]+dx*t,N=a[1]+dn*t,ground=world.data.geo.height(E,N);box(b.id+'-pier',E,N,(ground+b.deckHeightM)/2,b.widthM,b.deckHeightM-ground,2,stone,yaw);}
  }
 }
 for(const h of world.data.geo.source.hedges)for(let i=1;i<h.points.length;i++){
  const a=h.points[i-1],b=h.points[i],dx=b[0]-a[0],dn=b[1]-a[1],length=Math.hypot(dx,dn),count=Math.ceil(length/6);
  for(let j=0;j<count;j++){const t=(j+.5)/count,e=a[0]+dx*t,n=a[1]+dn*t;if(h.openings.some((o:any)=>Math.hypot(e-o.point[0],n-o.point[1])<o.widthM/2+3))continue;box(h.id,e,n,world.data.geo.height(e,n)+h.heightM/2,h.widthM,h.heightM,length/count+.2,hedge,-Math.atan2(dx,dn));}
 }
 for(const {id,e,n,width:w,depth:d,height:h} of REGION_BUILDINGS){
  const y=world.data.geo.height(e,n);box(id,e,n,y+h/2,w,h,d,wall);box(id+'-roof',e,n,y+h+.3,w+1,.6,d+1,wood);colliders.push({e,n,width:w,depth:d,roof:y+h+.6});
 }
 // Merge hedge volumes into bounded chunks; the gate remains a separate collider and visual.
 const groups=new Map<string,Mesh[]>();for(const m of meshes.filter(m=>m.name==='high-hay')){const k=Math.floor(m.metadata.e/128)+','+Math.floor(m.metadata.n/128),g=groups.get(k)??[];g.push(m);groups.set(k,g);}
 for(const group of groups.values()){const merged=Mesh.MergeMeshes(group,true,true);if(merged){merged.name='high-hay-chunk';merged.metadata={e:0,n:0};merged.receiveShadows=true;meshes.push(merged);}}
 for(let i=meshes.length-1;i>=0;i--)if(meshes[i].isDisposed())meshes.splice(i,1);
 const gate=box('north-gate',550,-180,world.data.geo.height(550,-180)+1.25,7,2.5,.28,wood);
 for(const side of [-1,1])box('gate-post',550+side*3.7,-180,world.data.geo.height(550+side*3.7,-180)+1.6,.5,3.2,.5,wood);
 const requests=new Set<string>(),jobs:(()=>void)[]=[],failures:string[]=[];
 function cottages(p:EN){for(const [id,e,n] of [['inn',-242,-140],['farm',-950,-625]] as const){if(requests.has(id)||Math.hypot(p.e-e,p.n-n)>180)continue;requests.add(id);void world.library.load('cottage').then(f=>jobs.push(()=>{
   for(const m of meshes.filter(m=>m.name===id||m.name===id+'-roof'))m.setEnabled(false);
   for(const offset of [-3.4,3.4])for(const [i,s] of f.variants[0][0].entries()){const m=new Mesh(id+'-cottage-'+offset+'-'+i,scene);s.geometry!.applyToMesh(m);m.material=s.material;m.sideOrientation=1;m.scaling.set(.95,1,.95);m.position.set(e+offset-world.origin.e,world.data.geo.height(e,n)-.08,world.origin.n-n);m.metadata={e:e+offset,n};m.receiveShadows=true;meshes.push(m);}
  })).catch(e=>failures.push(String(e)));}}
 world.onRebase.push((o:EN)=>{for(const m of meshes)m.position.set(m.metadata.e-o.e,m.position.y,o.n-m.metadata.n);});
 return {meshes,colliders,failures,blocked:(e:number,n:number)=>colliders.some(c=>Math.abs(e-c.e)<c.width/2+.28&&Math.abs(n-c.n)<c.depth/2+.28),bridgePierAt:(e:number,n:number)=>meshes.some(m=>m.name.endsWith('-pier')&&Math.hypot(e-m.metadata.e,n-m.metadata.n)<3.6),
  update:(p:EN,h:number,eye:Vector3,dt:number,open:boolean,budget:FrameWorkBudget)=>{gate.setEnabled(!open);cottages(p);if(jobs.length)budget.run(()=>jobs.shift()!());const feet={x:p.e-world.origin.e,y:h,z:world.origin.n-p.n};
   for(const m of [...meshes,...[...world.props.cells.values()].flatMap(c=>c.meshes)]){if(!m.isEnabled())continue;m.computeWorldMatrix();const b=m.getBoundingInfo().boundingBox,close=Vector3.Distance(b.centerWorld,new Vector3(feet.x,feet.y,feet.z))<b.extendSizeWorld.length()+25;
    const blocked=close&&occludesTraveller(eye,feet,{id:m.id,min:b.minimumWorld,max:b.maximumWorld},m.visibility<.99);m.visibility=fadeOpacity(m.visibility,blocked?.16:1,dt,blocked?.12:.3);
   }
  }};
}
