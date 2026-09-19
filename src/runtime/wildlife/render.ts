import type {Scene} from '@babylonjs/core/scene.js';
import type {AbstractMesh} from '@babylonjs/core/Meshes/abstractMesh.js';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {CreateSphere} from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import type {Material} from '@babylonjs/core/Materials/material.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import {Vector3,Matrix,Quaternion} from '@babylonjs/core/Maths/math.vector.js';
import {CreateLines} from '@babylonjs/core/Meshes/Builders/linesBuilder.js';
import type {LinesMesh} from '@babylonjs/core/Meshes/linesMesh.js';
import type {FrameWorkBudget} from '../startup.ts';
import type {ENH,OriginEN,WildlifeFrame,WildlifePackage,SpeciesId} from '../../domain/wildlife/types.ts';
import {localXYZ,routeHeading,sampleRoute,routeMetres,routeBasis} from '../../domain/wildlife/routes.ts';
import {createAnimalLibrary,type AnimalArt,type RenderArt} from './assets.ts';
import {createBirdAnimator} from './animation.ts';
type Visual={root:TransformNode;meshes:AbstractMesh[];lod:number;rotationAt?:number;animator?:ReturnType<typeof createBirdAnimator>;dispose:()=>void};
/** Shared renderer consumes absolute coordinates; the adapter supplies origin and observer. */
export function createWildlifeRenderer(scene:Scene,data:WildlifePackage,attachMaterial:(material:Material)=>void,art:AnimalArt[]|null=null,decorative:RenderArt[]=[]){
 const visuals=new Map<string,Visual>(),material=new StandardMaterial('wildlife-TEST-material',scene);
 material.diffuseColor=new Color3(1,.05,.7);material.specularColor=Color3.Black();attachMaterial(material);
 const library=art?createAnimalLibrary(scene,[...art,...decorative],attachMaterial):null;
 let frame:WildlifeFrame|null=null,origin:OriginEN={e:0,n:0},time=0,disposed=false,shadowLimit=1,detailLimit=4,detailDistance=15,observer:ENH={e:0,n:0,h:0};
 const routes=new Map(data.cells.flatMap(c=>c.routes.map(r=>[`${c.id}/${r.id}`,r]))),desired=new Map<string,number>();
 const sites=new Map(data.cells.flatMap(c=>c.sites.map(s=>[s.id,s] as const)));
 const probes:LinesMesh[]=[];
 function point(e:WildlifeFrame['entities'][number]){const route=e.route?routes.get(`${e.route.cellId}/${e.route.routeId}`):undefined,site=sites.get(e.siteId)!,support=route??routes.get(`${site.cellId}/${site.allowedRoutes[0]}`),d=route?routeMetres(route,e,time):0,sample=route?sampleRoute(route,d):null;return {p:sample?.point??e.point,basis:support?routeBasis(support,d,e.species==='roe-deer'?.65:.02):null,heading:route?routeHeading(route,d):e.headingDeg};}

 function apply(){
  for(const probe of probes)probe.position.set(-origin.e,0,origin.n);
  if(!frame)return;
  const present=new Set(frame.entities.filter(e=>e.state!=='hidden').map(e=>e.id));
  for(const [id,v] of visuals)if(!present.has(id)){v.dispose();visuals.delete(id);}
  desired.clear();let detailed=0;
  const entries=frame.entities.filter(e=>e.state!=='hidden').map(e=>({e,...point(e)})).sort((a,b)=>Math.hypot(a.p.e-observer.e,a.p.n-observer.n)-Math.hypot(b.p.e-observer.e,b.p.n-observer.n)||a.e.id.localeCompare(b.e.id));
  for(const {e,p,heading,basis} of entries){
   const distance=Math.hypot(p.e-observer.e,p.n-observer.n),old=visuals.get(e.id),near=distance<detailDistance+(old?.lod===0?2:0);
   const lod=library?(near&&detailed<detailLimit?(detailed++,0):distance<50+(old?.lod===1?4:0)?1:2):-1;desired.set(e.id,lod);if(library)library.request(e.species,lod);
   if(!old)continue;const pos=localXYZ(p,origin);old.root.position.set(pos.x,pos.y+(old.lod<0?.08:0),pos.z);if(e.species==='woodland-bird'||old.lod<0){old.root.rotationQuaternion=null;old.root.rotation.y=(old.lod<0?0:Math.PI)-heading*Math.PI/180;}
   else {
    const vector=(p:readonly number[])=>new Vector3(p[0],p[2],-p[1]),up=vector(basis!.up),f=vector(basis!.forward),right=vector(basis!.right),corrected=Vector3.Cross(f,right).normalize();
    const m=Matrix.Identity();Matrix.FromXYZAxesToRef(right,corrected,f,m);const rotation=Quaternion.FromRotationMatrix(m),previous=old.root.rotationQuaternion,delta=Math.max(0,time-(old.rotationAt??time));
    old.root.rotationQuaternion=e.species==='roe-deer'&&previous?Quaternion.Slerp(previous,rotation,1-Math.exp(-delta/120)):rotation;old.rotationAt=time;
    const offset=art?.find(a=>a.id===e.species)?.footOffsetM??0;old.root.position.addInPlace(up.scale(offset));
   }
   old.root.metadata={testOnly:old.lod<0,entityId:e.id,state:e.state,generation:e.generation,absolutePoint:p,lod:old.lod};
   old.animator?.update(e,time,old.lod===0?60:old.lod===1?12:6);
  }
 }
 function make(id:string,lod:number,species:SpeciesId):Visual{
  if(lod<0){const root=CreateSphere(`TEST-bird:${id}`,{segments:4,diameter:1},scene);root.scaling.set(.12,.16,.12);root.material=material;root.receiveShadows=true;root.isPickable=false;return {root,meshes:[root],lod,dispose:()=>root.dispose()};}
  const instance=library!.get(species,lod)!.instantiateModelsToScene(name=>`${id}:${name}`,false,{doNotInstantiate:true}),root=new TransformNode(`bird:${id}`,scene);
  for(const node of instance.rootNodes)node.parent=root;
  const meshes=root.getChildMeshes();for(const m of meshes){m.isPickable=false;m.receiveShadows=true;}
  return {root,meshes,lod,animator:createBirdAnimator(instance.animationGroups,data.bird.takeoffMs,art?.find(a=>a.id===species)),dispose(){instance.dispose();root.dispose();}};
 }
 return {
  library,
  update(next:WildlifeFrame|null,presentationMs:number,nextOrigin:OriginEN,nextObserver?:ENH){if(disposed)return;frame=next;time=presentationMs;origin=nextOrigin;if(nextObserver)observer=nextObserver;apply();},
  prepare(budget:FrameWorkBudget){if(disposed||!frame)return;
   for(const [id,lod] of desired){const species=frame.entities.find(e=>e.id===id)!.species,previous=visuals.get(id);if(previous?.lod===lod)continue;if(lod>=0&&!library!.get(species,lod)){if(!library!.failed(species,lod)||previous)continue;}
    if(!previous&&visuals.size>=data.limits.maxActiveEntities)continue;
    budget.run(()=>{if(disposed||!desired.has(id))return;const next=make(id,lod>=0&&!library!.get(species,lod)?-1:lod,species);previous?.dispose();visuals.set(id,next);apply();});break;
   }
  },
  setQuality(profile:{wildlifeShadows:number;wildlifeDetails?:number;wildlifeDistance?:number}){shadowLimit=profile.wildlifeShadows;detailLimit=profile.wildlifeDetails??4;detailDistance=profile.wildlifeDistance??15;},
  setProbe(enabled:boolean){if(disposed)return;for(const probe of probes)probe.dispose();probes.length=0;if(enabled)for(const route of routes.values()){const line=CreateLines(`TEST-route:${route.id}`,{points:route.samples.map(s=>new Vector3(s.point.e,s.point.h,-s.point.n))},scene);line.color=new Color3(0,1,1);line.isPickable=false;line.position.set(-origin.e,0,origin.n);probes.push(line);}},
  shadowMeshes(feet:ENH){return [...visuals.values()].filter(v=>Math.hypot(v.root.position.x+origin.e-feet.e,origin.n-v.root.position.z-feet.n)<24).sort((a,b)=>a.root.name.localeCompare(b.root.name)).slice(0,shadowLimit).flatMap(v=>v.meshes.filter(m=>m.getTotalVertices()>0));},
  stats(){return {testOnly:!art,artStatus:art?'candidate':'test-only',visibleMeshes:visuals.size,meshes:visuals.size,debugRoutes:probes.length,detailedSkeletons:[...visuals.values()].filter(v=>v.lod===0).length,pending:[...desired].filter(([id,lod])=>visuals.get(id)?.lod!==lod).length,origin:{...origin},instances:[...visuals].map(([id,v])=>({id,lod:v.lod,...v.animator?.stats()})),...library?.stats()};},
  dispose(){if(disposed)return;disposed=true;for(const v of visuals.values())v.dispose();visuals.clear();desired.clear();library?.dispose();for(const probe of probes)probe.dispose();probes.length=0;material.dispose();frame=null;},
 };
}
