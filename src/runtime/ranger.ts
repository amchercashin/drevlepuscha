import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {GLTFLoaderAnimationStartMode} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import {LoadAssetContainerAsync} from '@babylonjs/core/Loading/sceneLoader.js';
import type {Scene} from '@babylonjs/core/scene.js';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import type {AnimationGroup} from '@babylonjs/core/Animations/animationGroup.js';
import rangerUrl from '../../assets/characters/ranger/meshy.glb?url';

const SOURCES={Idle:'restpose',Walk:'Walking',Run:'Running'} as const;
type Gait=keyof typeof SOURCES;
const GAITS=Object.keys(SOURCES) as Gait[];
// The source mesh is 1.70 m tall, with its soles at y=0. Scale the whole rig.
const HEIGHT=1.78, SOURCE_HEIGHT=1.700000286102295;
// Approximate stride speeds at original playback. These tune cadence only;
// the movement controller retains 1.85 m/s walking and 15 m/s running.
const CYCLE_SPEED={Walk:1.5,Run:4.5};

export async function createRanger(scene:Scene,parent:TransformNode){
 const placeholder=parent.getChildMeshes();
 const asset=await LoadAssetContainerAsync(rangerUrl,scene,{
  pluginOptions:{gltf:{animationStartMode:GLTFLoaderAnimationStartMode.NONE}},
 });
 const clips={} as Record<Gait,AnimationGroup>;
 for(const gait of GAITS){
  const clip=asset.animationGroups.find(group=>group.name===SOURCES[gait]);
  if(!clip){asset.dispose();throw new Error(`Ranger animation missing: ${SOURCES[gait]}`);}
  clips[gait]=clip;
 }
 asset.addAllToScene();
 // Meshy faces +Z; the showcase moves forward along -Z.
 const orientation=new TransformNode('ranger-facing',scene);
 orientation.parent=parent;orientation.rotation.y=Math.PI;
 orientation.scaling.setAll(HEIGHT/SOURCE_HEIGHT);
 for(const node of asset.rootNodes)node.parent=orientation;
 for(const mesh of asset.meshes){mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;}
 for(const mesh of placeholder)mesh.dispose();
 // Only these three clips run. Bow animations stay available in the source GLB.
 for(const gait of GAITS){
  clips[gait].start(true,0,clips[gait].from,clips[gait].to,false);
  clips[gait].setWeightForAllAnimatables(gait==='Idle'?1:0);
 }
 const weights:Record<Gait,number>={Idle:1,Walk:0,Run:0};
 let gait:Gait='Idle',speed=0;
 return {
  update(dt:number,actualSpeed:number,running:boolean){
   if(dt===0){for(const clip of Object.values(clips))clip.speedRatio=0;return;}
   speed+=(actualSpeed-speed)*(1-Math.exp(-dt/.10));
   gait=actualSpeed<.03?'Idle':running?'Run':'Walk';
   const blend=1-Math.exp(-dt/.16);
   for(const name of GAITS){
    weights[name]+=((name===gait?1:0)-weights[name])*blend;
    clips[name].setWeightForAllAnimatables(weights[name]);
   }
   clips.Idle.speedRatio=0; // Supplied static rest pose, not an invented idle cycle.
   clips.Walk.speedRatio=Math.max(.15,speed/CYCLE_SPEED.Walk);
   clips.Run.speedRatio=Math.max(.15,speed/CYCLE_SPEED.Run);
  },
  state:()=>({model:'meshy',gait,speed,height:HEIGHT,weights:{...weights},clips:{...SOURCES},
   playbackRate:clips[gait].speedRatio,frame:clips[gait].getCurrentFrame()}),
 };
}
