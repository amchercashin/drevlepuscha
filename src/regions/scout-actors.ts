import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {createRanger} from '../runtime/ranger.ts';
import type {RegionHunt} from '../domain/regions/hunt.ts';
import type {RegionWorld} from './world.ts';
import type {FrameWorkBudget} from '../runtime/startup.ts';

/** Visual adapter for the hunt state. Rules and save data stay in the domain module. */
export function createScoutActors(scene:Scene,world:RegionWorld,hunt:RegionHunt){
 const roots=new Map<string,TransformNode>();
 const models=new Map<string,Awaited<ReturnType<typeof createRanger>>>();
 const loading=new Set<string>(),failed=new Set<string>(),last=new Map<string,{e:number;n:number}>();
 const leather=new StandardMaterial('scout-leather',scene);leather.diffuseColor=new Color3(.27,.23,.16);leather.specularColor=Color3.Black();
 const arrowMaterial=new StandardMaterial('scout-arrow-wood',scene);arrowMaterial.diffuseColor=new Color3(.49,.34,.16);arrowMaterial.specularColor=Color3.Black();
 const prints:Mesh[]=[];
 hunt.clues.forEach((clue,clueIndex)=>{
  const routeId=['east-approach','lookout-access','lookout-hollow'][clueIndex],route=hunt.routes.get(routeId)!;
  const ahead=route.at(-1)!;
  const angle=Math.atan2(ahead[0]-clue.e,ahead[1]-clue.n);
  for(let i=0;i<8;i++){
   const side=i%2?1:-1,advance=(i-3.5)*.48;
   const e=clue.e+Math.sin(angle)*advance+Math.cos(angle)*side*.17,n=clue.n+Math.cos(angle)*advance-Math.sin(angle)*side*.17;
   const mesh=CreateBox('scout-print-'+clue.id+'-'+i,{width:.12,height:.012,depth:.27},scene);
   mesh.material=leather;mesh.rotation.y=-angle;mesh.isPickable=false;mesh.metadata={e,n,clueId:clue.id};mesh.setEnabled(false);prints.push(mesh);
  }
 });
 const arrows:Mesh[]=Array.from({length:12},(_,i)=>{const mesh=CreateBox('ranger-arrow-'+i,{width:.035,height:.035,depth:.7},scene);mesh.material=arrowMaterial;mesh.isPickable=false;mesh.setEnabled(false);return mesh;});
 for(const scout of hunt.state.scouts){const root=new TransformNode(scout.id,scene),body=CreateBox(scout.id+'-proxy',{width:.55,height:1.7,depth:.38},scene);body.parent=root;body.position.y=.85;body.material=leather;body.isPickable=false;root.setEnabled(false);roots.set(scout.id,root);last.set(scout.id,{e:scout.e,n:scout.n});}
 scene.onDisposeObservable.add(()=>{for(const model of models.values())model.dispose();});
 return {
  update(dt:number,player:{e:number;n:number},budget:FrameWorkBudget){
   for(const scout of hunt.state.scouts){
    const root=roots.get(scout.id)!,distance=Math.hypot(scout.e-player.e,scout.n-player.n),near=distance<115;
    if(near&&!models.has(scout.id)&&!loading.has(scout.id)&&!failed.has(scout.id))budget.run(()=>{
     loading.add(scout.id);void createRanger(scene,root,scout.id,'#514937').then(model=>models.set(scout.id,model)).catch(error=>{failed.add(scout.id);console.error(error);}).finally(()=>loading.delete(scout.id));
    });
    root.setEnabled(near);
    root.position.set(scout.e-world.origin.e,world.data.height(scout.e,scout.n)+(scout.mode==='down'?0.65:0),world.origin.n-scout.n);
    root.rotation.y=-scout.heading*Math.PI/180;root.rotation.z=scout.mode==='down'?-Math.PI/2:0;
    const previous=last.get(scout.id)!,speed=dt?Math.hypot(scout.e-previous.e,scout.n-previous.n)/dt:0;
    models.get(scout.id)?.update(near&&scout.mode!=='down'?dt:0,speed,false);
    last.set(scout.id,{e:scout.e,n:scout.n});
   }
   const clue=hunt.nextClue;
   for(const print of prints){const {e,n,clueId}=print.metadata;
    print.setEnabled(clue?.id===clueId&&world.data.ready(e,n)&&Math.hypot(player.e-e,player.n-n)<38);
    if(print.isEnabled())print.position.set(e-world.origin.e,world.data.height(e,n)+.03,world.origin.n-n);
   }
   arrows.forEach((mesh,i)=>{const arrow=hunt.arrowsInFlight[i];mesh.setEnabled(!!arrow);
    if(arrow){mesh.position.set(arrow.e-world.origin.e,arrow.height,world.origin.n-arrow.n);mesh.rotation.y=-Math.atan2(arrow.ve,arrow.vn);mesh.rotation.x=Math.atan2(arrow.vh,Math.hypot(arrow.ve,arrow.vn));}
   });
  },
  shadowMeshes:()=>[...roots.values()].filter(root=>root.isEnabled()).flatMap(root=>root.getChildMeshes()),
  stats:()=>({models:models.size,visible:[...roots.values()].filter(root=>root.isEnabled()).length,failed:[...failed]}),
 };
}
