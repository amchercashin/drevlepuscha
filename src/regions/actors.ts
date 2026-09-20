import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {Color3} from '@babylonjs/core/Maths/math.color.js';
import type {Scene} from '@babylonjs/core/scene.js';
import type {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {createRanger} from '../runtime/ranger.ts';
import type {RegionSession} from '../domain/regions/session.ts';
import {alongRoute} from '../domain/regions/session.ts';
import type {RegionWorld} from './world.ts';
import type {FrameWorkBudget} from '../runtime/startup.ts';
export function createRegionalActors(scene:Scene,world:RegionWorld,session:RegionSession){
 const wood=new StandardMaterial('boat-oak',scene);wood.diffuseColor=new Color3(.32,.23,.14);wood.specularColor=Color3.Black();
 const boats=new Map<string,TransformNode>();
 const moorings:Mesh[]=[];
 for(const id of ['lower-boat','upper-boat'])for(const side of [0,1]){const {shore}=session.dock(id,side,'high');for(const delta of [-2,2]){const post=CreateBox(id+'-mooring-'+side+'-'+delta,{width:.18,height:1.2,depth:.18},scene);post.material=wood;post.metadata={e:shore.e,n:shore.n+delta};post.receiveShadows=true;moorings.push(post);}}
 for(const b of session.state.boats){const root=new TransformNode(b.id,scene);boats.set(b.id,root);
  for(const [name,x,y,z,w,h,d] of [['keel',0,-.02,0,1.1,.18,3.4],['port',-.58,.22,0,.12,.5,3.4],['starboard',.58,.22,0,.12,.5,3.4],['bow',0,.19,1.7,1.1,.45,.13],['stern',0,.19,-1.7,1.1,.45,.13],['seat',0,.3,-.75,1.1,.13,.4],['oar',0,.48,0,2.6,.06,.11]] as const){const m=CreateBox(b.id+'-'+name,{width:w,height:h,depth:d},scene);m.parent=root;m.position.set(x,y,z);m.material=wood;m.receiveShadows=true;}
 }
 const npcRoot=new TransformNode('traveller',scene);npcRoot.setEnabled(false);let npc:Awaited<ReturnType<typeof createRanger>>|undefined,loading=false,failed=false,last=session.actor();
 const prints:Mesh[]=[],ink=new StandardMaterial('footprints',scene);ink.diffuseColor=new Color3(.16,.13,.085);ink.specularColor=Color3.Black();
 for(let i=0;i<10;i++){const p=alongRoute(session.state.encounter.route,26+i*.7),ahead=alongRoute(session.state.encounter.route,27+i*.7),m=CreateBox('traveller-track-'+i,{width:.13,height:.013,depth:.3},scene),angle=Math.atan2(ahead.e-p.e,ahead.n-p.n);m.material=ink;m.metadata={e:p.e+Math.cos(angle)*(i%2?.14:-.14),n:p.n-Math.sin(angle)*(i%2?.14:-.14)};m.rotation.y=-angle;prints.push(m);}
 scene.onDisposeObservable.add(()=>npc?.dispose());
 return {
  update(dt:number,budget:FrameWorkBudget){const player=session.state.player;for(const b of session.state.boats){const root=boats.get(b.id)!;root.position.set(b.e-world.origin.e,(world.data.geo.waterAt(b.e,b.n,player.water)?.level??0)+.06,world.origin.n-b.n);root.rotation.y=-b.heading*Math.PI/180;root.setEnabled(Math.hypot(player.e-b.e,player.n-b.n)<500);}
   for(const m of moorings){const {e,n}=m.metadata;m.position.set(e-world.origin.e,world.data.geo.height(e,n)+.5,world.origin.n-n);}
   const p=session.actor(),near=Math.hypot(p.e-player.e,p.n-player.n)<90;
   if(near&&!npc&&!loading&&!failed)budget.run(()=>{loading=true;void createRanger(scene,npcRoot,'regional-traveller','#88764f').then(r=>{npc=r;}).catch(e=>{failed=true;console.error(e);}).finally(()=>loading=false);});
   npcRoot.setEnabled(near&&!!npc);const moving=Math.hypot(p.e-last.e,p.n-last.n);if(moving>.0001)npcRoot.rotation.y=-Math.atan2(p.e-last.e,p.n-last.n);npcRoot.position.set(p.e-world.origin.e,world.data.ready(p.e,p.n)?world.data.height(p.e,p.n):p.height,world.origin.n-p.n);npc?.update(near?dt:0,dt?moving/dt:0,false);last=p;
   for(const m of prints){const {e,n}=m.metadata;m.position.set(e-world.origin.e,world.data.height(e,n)+.025,world.origin.n-n);m.setEnabled(world.data.ready(e,n)&&Math.hypot(e-player.e,n-player.n)<65);}
  },shadowMeshes:()=>npcRoot.isEnabled()?npcRoot.getChildMeshes():[],stats:()=>({npcReady:!!npc,npcVisible:npcRoot.isEnabled(),npcFailed:failed,boats:boats.size}),
 };
}
