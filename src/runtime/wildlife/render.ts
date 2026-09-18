import type {Scene} from '@babylonjs/core/scene.js';
import type {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {CreateLines} from '@babylonjs/core/Meshes/Builders/linesBuilder.js';
import type {LinesMesh} from '@babylonjs/core/Meshes/linesMesh.js';
import type {FrameWorkBudget} from '../startup.ts';
import type {ENH,OriginEN,WildlifeFrame,WildlifePackage} from '../../domain/wildlife/types.ts';
import {localXYZ,routeHeading,sampleRoute} from '../../domain/wildlife/routes.ts';
/** Shared renderer takes absolute data and an origin; no showcase bounds or behavior. */
export function createWildlifeRenderer(scene:Scene,data:WildlifePackage,attachMaterial:(material:StandardMaterial)=>void){
 const meshes=new Map<string,Mesh>(),material=new StandardMaterial('wildlife-TEST-material',scene);
 material.diffuseColor=new Color3(1,.05,.7);material.specularColor=Color3.Black();attachMaterial(material);
 let frame:WildlifeFrame|null=null,origin:OriginEN={e:0,n:0},time=0,disposed=false,shadowLimit=1;
 const routes=new Map(data.cells.flatMap(c=>c.routes.map(r=>[`${c.id}/${r.id}`,r])));
 const probes:LinesMesh[]=[];
 function apply(){
  for(const probe of probes)probe.position.set(-origin.e,0,origin.n);
  if(!frame)return;
  const present=new Set(frame.entities.map(e=>e.id));
  for(const [id,mesh] of meshes)if(!present.has(id)){mesh.dispose();meshes.delete(id);}
  for(const e of frame.entities){const mesh=meshes.get(e.id);if(!mesh)continue;
   const route=e.route?routes.get(`${e.route.cellId}/${e.route.routeId}`):undefined;
   const d=e.routeStartDistanceM+Math.max(0,time-e.routeStartMs)*e.speedMps/1000,point=route?sampleRoute(route,d).point:e.point,pos=localXYZ(point,origin);
   mesh.position.set(pos.x,pos.y+.08,pos.z);mesh.rotation.y=-(route?routeHeading(route,d):e.headingDeg)*Math.PI/180;
   mesh.setEnabled(e.state!=='hidden');mesh.metadata={testOnly:true,entityId:e.id,state:e.state,generation:e.generation,absolutePoint:point};
  }
 }
 return {
  update(next:WildlifeFrame|null,presentationMs:number,nextOrigin:OriginEN){if(disposed)return;frame=next;time=presentationMs;origin=nextOrigin;apply();},
  prepare(budget:FrameWorkBudget){if(disposed||!frame)return;const entry=frame.entities.find(e=>e.state!=='hidden'&&!meshes.has(e.id));if(!entry||meshes.size>=data.limits.maxActiveEntities)return;
   budget.run(()=>{if(disposed)return;const mesh=CreateSphere(`TEST-bird:${entry.id}`,{segments:4,diameter:1},scene);mesh.scaling.set(.12,.16,.12);mesh.material=material;mesh.receiveShadows=true;mesh.isPickable=false;meshes.set(entry.id,mesh);apply();});
  },
  setQuality(profile:{wildlifeShadows:number}){shadowLimit=profile.wildlifeShadows;},
  setProbe(enabled:boolean){
   if(disposed)return;for(const probe of probes)probe.dispose();probes.length=0;
   if(enabled)for(const route of routes.values()){
    const line=CreateLines(`TEST-route:${route.id}`,{points:route.samples.map(s=>new Vector3(s.point.e,s.point.h,-s.point.n))},scene);
    line.color=new Color3(0,1,1);line.isPickable=false;line.position.set(-origin.e,0,origin.n);probes.push(line);
   }
  },
  shadowMeshes(feet:ENH){return [...meshes.values()].filter(m=>m.isEnabled()&&Math.hypot(m.position.x+origin.e-feet.e,origin.n-m.position.z-feet.n)<24).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,shadowLimit);},
  stats(){return {testOnly:true,visibleMeshes:[...meshes.values()].filter(m=>m.isEnabled()).length,meshes:meshes.size,debugRoutes:probes.length,detailedSkeletons:0,pending:frame?.entities.filter(e=>e.state!=='hidden'&&!meshes.has(e.id)).length??0,origin:{...origin}};},
  dispose(){if(disposed)return;disposed=true;for(const m of meshes.values())m.dispose();meshes.clear();for(const probe of probes)probe.dispose();probes.length=0;material.dispose();frame=null;},
 };
}
