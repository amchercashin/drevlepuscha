import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import type {RegionWorld} from './world.ts';
import type {FrameWorkBudget} from '../runtime/startup.ts';
import type {EN} from '../world/schema.ts';
import {hash01} from '../domain/geography.mjs';
import {expandWindBounds} from '../runtime/vegetation-wind.ts';

/** CC0 tufts and flowers: a light middle-distance meadow layer underneath fine blades. */
export function createMeadow(world:RegionWorld){
 const ids=['grass-short','grass-tall','flowers-cream','flowers-blue','fern','hazel','dogrose'];
 const sources=new Map<string,Mesh[]>(),cells=new Map<string,Mesh[]>();let key='',queue:{e:number;n:number;id:string}[]=[];
 for(const id of ids)if(world.assets.index[id])void world.assets.load(id).then(levels=>{sources.set(id,levels[id==='hazel'||id==='dogrose'?Math.min(1,levels.length-1):0]);key='';for(const ms of cells.values())ms.forEach(m=>m.dispose());cells.clear();}).catch(()=>{});
 world.onRebase.push(o=>{for(const ms of cells.values())for(const m of ms){m.unfreezeWorldMatrix();m.position.set(m.metadata.e-o.e,0,o.n-m.metadata.n);m.freezeWorldMatrix();}});
 let water=world.waterState;
 function build(e:number,n:number,id:string){const groups=new Map<string,number[]>();
  for(let i=0;i<120;i++){
   const E=e+hash01(e,n,i+1101)*32,N=n+hash01(e,n,i+1301)*32,forest=world.data.geo.forestAt(E,N),patch=.5+.5*Math.sin(E*.079+Math.sin(N*.033)*2);
   if(world.data.geo.coverExclusion(E,N)||world.terrain.trailAt(E,N).distance<2.2||(world.data.geo.waterAt(E,N,world.waterState)?.depth??0)>.01)continue;
   const h=world.data.geo.surfaceHeight(E,N);if(Math.abs(world.data.geo.surfaceHeight(E+1,N)-h)>.65)continue;
   if(forest&&hash01(e,n,i+1401)>.32)continue;
   const r=hash01(e,n,i+1501),species=forest?(r<.55?'fern':r<.72?'grass-short':r<.96?'hazel':'dogrose'):r<.72?'grass-short':r<.90?'grass-tall':r<.945?'flowers-cream':r<.98?'flowers-blue':patch>.7?'dogrose':'hazel';
   if(!sources.has(species)||((species==='hazel'||species==='dogrose')&&(world.data.geo.exclusion(E,N)||world.terrain.trailAt(E,N).distance<6)))continue;
   const s=.65+hash01(e,n,i+1701)*.7,buffer=groups.get(species)??[];groups.set(species,buffer);
   buffer.push(...Matrix.Compose(new Vector3(s,s,s),Quaternion.RotationYawPitchRoll(hash01(e,n,i+1801)*6.28,0,0),new Vector3(E-e,h-.035,n-N)).m);
  }
  const meshes:Mesh[]=[];for(const [species,matrices]of groups)for(const source of sources.get(species)!){
   const m=new Mesh('regional-meadow-'+species+'-'+id,world.scene);source.geometry!.copy(m.name).applyToMesh(m);m.material=source.material;m.sideOrientation=1;m.receiveShadows=true;m.isPickable=false;m.metadata={e,n,windTree:[world.assets.index[species].dimensions[1],.15]};m.position.set(e-world.origin.e,0,world.origin.n-n);m.thinInstanceSetBuffer('matrix',new Float32Array(matrices),16,true);m.thinInstanceRefreshBoundingInfo();expandWindBounds(m,.25);m.freezeWorldMatrix();meshes.push(m);
  }cells.set(id,meshes);
 }
 return {update(p:EN,budget:FrameWorkBudget){
  if(water!==world.waterState){water=world.waterState;key='';for(const ms of cells.values())ms.forEach(m=>m.dispose());cells.clear();}
  const next=Math.floor(p.e/32)+','+Math.floor(p.n/32);if(next!==key&&sources.size){key=next;queue=[];const wanted=new Set<string>();
   for(let y=-7;y<=7;y++)for(let x=-7;x<=7;x++){const e=Math.floor(p.e/32)*32+x*32,n=Math.floor(p.n/32)*32+y*32,id=e+','+n;if(Math.hypot(e+16-p.e,n+16-p.n)>220)continue;wanted.add(id);if(!cells.has(id))queue.push({e,n,id});}
   queue.sort((a,b)=>Math.hypot(a.e-p.e,a.n-p.n)-Math.hypot(b.e-p.e,b.n-p.n));for(const [id,ms]of cells)if(!wanted.has(id)){ms.forEach(m=>m.dispose());cells.delete(id);}
  }
  if(queue.length)budget.run(()=>{const q=queue.shift()!;build(q.e,q.n,q.id);});
  for(const fade of world.assets.fades)fade.feet={x:p.e-world.origin.e,y:0,z:world.origin.n-p.n};
 }};
}
