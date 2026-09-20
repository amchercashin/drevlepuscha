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
import {placedAssets} from './placed-asset.ts';
import type {AssetPlacement} from './placed-asset.ts';
import {hash01} from '../domain/geography.mjs';
export function createStructures(scene:Scene,world:RegionWorld){
 const meshes:Mesh[]=[];const colliders:{e:number;n:number;width:number;depth:number;roof:number}[]=[];
 const placements:AssetPlacement[]=[],piers:{e:number;n:number;yaw:number;width:number}[]=[];
 const material=(name:string,color:string)=>{const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(color);m.specularColor=Color3.Black();return m;};
 const stone=material('bridge-stone','#99927d'),hedge=material('living-hedge','#536739'),wood=material('weathered-wood','#79604c'),wall=material('inn-walls','#cfb897');
 const box=(id:string,e:number,n:number,y:number,width:number,height:number,depth:number,mat:StandardMaterial,yaw=0)=>{const m=CreateBox(id,{width,height,depth},scene);m.position.set(e,y,-n);m.rotation.y=yaw;m.material=mat;m.receiveShadows=true;m.metadata={e,n};meshes.push(m);return m;};
 for(const b of world.data.geo.bridges){
  for(let index=1;index<b.points.length;index++){
  const a=b.points[index-1],z=b.points[index],dx=z[0]-a[0],dn=z[1]-a[1],length=Math.hypot(dx,dn),yaw=-Math.atan2(dx,dn),e=(a[0]+z[0])/2,n=(a[1]+z[1])/2;
  if(b.id==='main-bridge'){
   const count=Math.ceil(length/18),span=length/count;
   for(let j=0;j<count;j++){const t=(j+.5)/count,E=a[0]+dx*t,N=a[1]+dn*t,id='stone-span-'+index+'-'+j;
    const proxy=box(id,E,N,b.deckHeightM-.3,b.widthM,.6,span,stone,yaw);
    placements.push({id:id+'-mesh',asset:'bridge-span',e:E,n:N,y:b.deckHeightM-8,yaw:yaw+Math.PI/2,scale:[span/18,1,b.widthM/6],replace:[proxy.name]});
    for(const side of [-1,1])placements.push({id:id+'-rail-'+side,asset:'bridge-parapet',e:E+dn/length*(b.widthM/2-.2)*side,n:N-dx/length*(b.widthM/2-.2)*side,y:b.deckHeightM,yaw:yaw+Math.PI/2,scale:[span/9,1,1]});
   }
   for(let j=0;j<=count;j++)piers.push({e:a[0]+dx*j/count,n:a[1]+dn*j/count,yaw,width:b.widthM});
   for(const [j,q]of [a,z].entries())if((j===0&&index===1)||(j===1&&index===b.points.length-1))placements.push({id:'bridge-end-'+index+'-'+j,asset:'bridge-abutment',e:q[0],n:q[1],y:b.deckHeightM-6,yaw:yaw+Math.PI/2});
  }else{
   box(b.id,e,n,b.deckHeightM-.3,b.widthM,.6,length,wood,yaw);
   for(const side of [-1,1])box(b.id+'-parapet',e+dn/length*(b.widthM/2+.1)*side,n-dx/length*(b.widthM/2+.1)*side,b.deckHeightM+.55,.18,1.1,length,wood,yaw);
   for(const t of [.33,.67]){const E=a[0]+dx*t,N=a[1]+dn*t,ground=world.data.geo.height(E,N);box(b.id+'-pier',E,N,(ground+b.deckHeightM)/2,b.widthM,b.deckHeightM-ground,2,stone,yaw);piers.push({e:E,n:N,yaw,width:b.widthM});}
  }
  }
 }
 for(const h of world.data.geo.source.hedges)for(let i=1;i<h.points.length;i++){
  const a=h.points[i-1],b=h.points[i],dx=b[0]-a[0],dn=b[1]-a[1],length=Math.hypot(dx,dn),count=Math.ceil(length/6);
  for(let j=0;j<count;j++){const t=(j+.5)/count,e=a[0]+dx*t,n=a[1]+dn*t;if(h.openings.some((o:any)=>Math.hypot(e-o.point[0],n-o.point[1])<o.widthM/2+3))continue;box(h.id,e,n,world.data.geo.height(e,n)+h.heightM/2,h.widthM,h.heightM,length/count+.2,hedge,-Math.atan2(dx,dn));}
 }
 for(const {id,e,n,width:w,depth:d,height:h} of REGION_BUILDINGS){
  const y=world.data.geo.height(e,n);box(id,e,n,y+h/2,w,h,d,wall);box(id+'-roof',e,n,y+h+.3,w+1,.6,d+1,wood);colliders.push({e,n,width:w,depth:d,roof:y+h+.6});
  placements.push({id:id+'-unique',asset:id==='farm'?'inn':id,e,n,y:y-.08,scale:id==='farm'?[12/17,5/6,9/11]:[1,1,1],replace:[id,id+'-roof']});
 }
 // Merge hedge volumes into bounded chunks; the gate remains a separate collider and visual.
 const groups=new Map<string,Mesh[]>();for(const m of meshes.filter(m=>m.name==='high-hay')){const k=Math.floor(m.metadata.e/128)+','+Math.floor(m.metadata.n/128),g=groups.get(k)??[];g.push(m);groups.set(k,g);}
 for(const group of groups.values()){const merged=Mesh.MergeMeshes(group,true,true);if(merged){merged.name='high-hay-chunk';merged.metadata={e:0,n:0};merged.receiveShadows=true;meshes.push(merged);}}
 for(let i=meshes.length-1;i>=0;i--)if(meshes[i].isDisposed())meshes.splice(i,1);
 const gate=box('north-gate',550,-180,world.data.geo.height(550,-180)+1.25,7,2.5,.28,wood);
 for(const side of [-1,1])box('gate-post',550+side*3.7,-180,world.data.geo.height(550+side*3.7,-180)+1.6,.5,3.2,.5,wood);
 placements.push({id:'gate-mesh',asset:'gate-leaf',e:550,n:-180,y:world.data.geo.height(550,-180),replace:['north-gate'],gate:true});
 for(const side of [-1,1])placements.push({id:'post-mesh-'+side,asset:'gate-post',e:550+side*3.7,n:-180,y:world.data.geo.height(550+side*3.7,-180),replace:['gate-post']});
 for(const [id,asset,e,n,yaw]of [['inn-sign','signpost',-221,-127,.5],['fisher-supplies','fishing-kit',-158,-210,1],['inn-supplies','fishing-kit',-254,-149,0],['shelter-supplies','fishing-kit',811,1011,.4]] as const)placements.push({id,asset,e,n,y:world.data.geo.surfaceHeight(e,n),yaw});
 const bounds=world.data.geo.source.playBounds;
 for(let n=bounds.minN+32;n<bounds.maxN;n+=64)for(let e=bounds.minE+32;e<bounds.maxE;e+=64){
  const E=e+(hash01(e,n,299)-.5)*28,N=n+(hash01(e,n,300)-.5)*28;
  if(!world.data.geo.forestAt(E,N)||world.data.geo.exclusion(E,N)||world.terrain.trailAt(E,N).distance<12)continue;
  const h=world.data.geo.surfaceHeight(E,N);if(Math.abs(world.data.geo.surfaceHeight(E+3,N)-h)>1.3)continue;
  const r=hash01(e,n,301),asset=r<.22?'oak':r<.5?'alder':r<.75?'birch':r<.93?'willow':'fallen-willow',s=.75+hash01(e,n,302)*.3;
  placements.push({id:'specimen-'+e+'-'+n,asset,e:E,n:N,y:h-.22,yaw:hash01(e,n,303)*6.28,scale:[s,s,s],solid:true});
 }
 const replaced=new Set<string>(),art=placedAssets(world,placements,meshes,item=>{for(const name of item.replace??[])replaced.add(name);for(const m of meshes)if(replaced.has(m.name))m.setEnabled(false);});
 const failures:string[]=[];
 world.onRebase.push((o:EN)=>{for(const m of meshes)m.position.set(m.metadata.e-o.e,m.position.y,o.n-m.metadata.n);});
 return {meshes,colliders,failures,blocked:(e:number,n:number)=>colliders.some(c=>Math.abs(e-c.e)<c.width/2+.28&&Math.abs(n-c.n)<c.depth/2+.28)||art.blocked(e,n,world.data.height(e,n)),bridgePierAt:(e:number,n:number)=>piers.some(p=>{const x=e-p.e,z=p.n-n,c=Math.cos(p.yaw),s=Math.sin(p.yaw);return Math.abs(x*c-z*s)<p.width/2+.65&&Math.abs(x*s+z*c)<1.8;}),
  update:(p:EN,h:number,eye:Vector3,dt:number,open:boolean,budget:FrameWorkBudget)=>{gate.setEnabled(!open&&!replaced.has('north-gate'));art.update(p,h,eye,dt,open,budget);const feet={x:p.e-world.origin.e,y:h,z:world.origin.n-p.n};
   for(const m of [...meshes,...[...world.props.cells.values()].flatMap(c=>c.meshes)]){if(!m.isEnabled()||m.metadata?.regionalAsset)continue;m.computeWorldMatrix();const b=m.getBoundingInfo().boundingBox,close=Vector3.Distance(b.centerWorld,new Vector3(feet.x,feet.y,feet.z))<b.extendSizeWorld.length()+25;
    const blocked=close&&occludesTraveller(eye,feet,{id:m.id,min:b.minimumWorld,max:b.maximumWorld},m.visibility<.99);m.visibility=fadeOpacity(m.visibility,blocked?.16:1,dt,blocked?.12:.3);
   }
  }};
}
