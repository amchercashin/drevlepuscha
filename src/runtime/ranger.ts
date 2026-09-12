import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {LoadAssetContainerAsync} from '@babylonjs/core/Loading/sceneLoader.js';
import type {Scene} from '@babylonjs/core/scene.js';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import type {AnimationGroup} from '@babylonjs/core/Animations/animationGroup.js';
import rangerUrl from '../../assets/characters/ranger/ranger.glb?url';

// Quiet walking and a controlled trail run. Playback follows actual movement,
// including collision stops, rather than simply checking whether a key is held.
export const RANGER_WALK_SPEED=1.15;
export const RANGER_RUN_SPEED=3.3;
const WALK_CYCLE_SPEED=1.09;
const RUN_CYCLE_SPEED=3.22;
type Gait='Idle'|'Walk'|'Run';

export async function createRanger(scene:Scene,parent:TransformNode){
 const placeholder=parent.getChildMeshes();
 const asset=await LoadAssetContainerAsync(rangerUrl,scene);
 const clips=Object.fromEntries(['Idle','Walk','Run'].map(name=>{
  const clip=asset.animationGroups.find(group=>group.name===name);
  if(!clip)throw new Error(`Ranger animation missing: ${name}`);
  return [name,clip];
 })) as Record<Gait,AnimationGroup>;
 asset.addAllToScene();
 // glTF's +Z-facing character follows the showcase's -Z travel convention.
 const orientation=new TransformNode('ranger-facing',scene);
 orientation.parent=parent;orientation.rotation.y=Math.PI;
 for(const node of asset.rootNodes)node.parent=orientation;
 for(const mesh of asset.meshes){mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;}
 for(const mesh of placeholder)mesh.dispose();
 for(const name of ['Idle','Walk','Run'] as const){
  clips[name].stop();clips[name].start(true,1,clips[name].from,clips[name].to,false);
  clips[name].setWeightForAllAnimatables(name==='Idle'?1:0);
 }
 const weights:Record<Gait,number>={Idle:1,Walk:0,Run:0};
 let gait:Gait='Idle',speed=0;
 return {
  update(dt:number,actualSpeed:number,running:boolean){
   // Freeze animation clocks with the scene's pause state, without changing pose.
   if(dt===0){for(const clip of Object.values(clips))clip.speedRatio=0;return;}
   speed+=(actualSpeed-speed)*(1-Math.exp(-dt/.10));
   gait=actualSpeed<.03?'Idle':running?'Run':'Walk';
   const blend=1-Math.exp(-dt/.16);
   for(const name of ['Idle','Walk','Run'] as const){
    weights[name]+=((name===gait?1:0)-weights[name])*blend;
    clips[name].setWeightForAllAnimatables(weights[name]);
   }
   clips.Idle.speedRatio=1;
   clips.Walk.speedRatio=Math.max(.15,speed/WALK_CYCLE_SPEED);
   clips.Run.speedRatio=Math.max(.15,speed/RUN_CYCLE_SPEED);
  },
  state:()=>({model:'ranger',gait,speed,weights:{...weights},clips:Object.keys(clips),frame:clips[gait].getCurrentFrame()}),
 };
}
