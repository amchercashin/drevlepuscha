import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {GLTFLoaderAnimationStartMode} from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import {LoadAssetContainerAsync} from '@babylonjs/core/Loading/sceneLoader.js';
import type {AssetContainer} from '@babylonjs/core/assetContainer.js';
import type {Scene} from '@babylonjs/core/scene.js';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {Quaternion} from '@babylonjs/core/Maths/math.vector.js';
import type {AnimationGroup} from '@babylonjs/core/Animations/animationGroup.js';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import {RangerPalette} from './ranger-palette.ts';
import rangerUrl from '../../assets/characters/ranger/meshy.glb?url';

const SOURCES={Idle:'restpose',Walk:'Walking',Run:'Running'} as const;
type Gait=keyof typeof SOURCES;
const GAITS=Object.keys(SOURCES) as Gait[];
// The source mesh is 1.70 m tall, with its soles at y=0. Scale the whole rig.
const HEIGHT=1.78, SOURCE_HEIGHT=1.700000286102295;
// Approximate stride speeds at original playback. These tune cadence only;
// the movement controller retains 1.85 m/s walking and 15 m/s running.
const CYCLE_SPEED={Walk:1.5,Run:4.5};

const sources=new WeakMap<Scene,Promise<AssetContainer>>();
async function loadSource(scene:Scene){
 const asset=await LoadAssetContainerAsync(rangerUrl,scene,{
  pluginOptions:{gltf:{animationStartMode:GLTFLoaderAnimationStartMode.NONE}},
 });
 const clips={} as Record<Gait,AnimationGroup>;
 for(const gait of GAITS){
  const clip=asset.animationGroups.find(group=>group.name===SOURCES[gait]);
  if(!clip){asset.dispose();throw new Error(`Ranger animation missing: ${SOURCES[gait]}`);}
  clips[gait]=clip;
 }
 // Keep the standing body/legs from restpose, but relax its spread arms.
 // Averaging the walking rotations removes the arm swing while retaining
 // the authored shoulder, elbow and wrist alignment on this same rig.
 for(const {target,animation} of clips.Idle.targetedAnimations){
  if(animation.targetProperty!=='rotationQuaternion'||! /^(Left|Right)(Shoulder|Arm|ForeArm|Hand)$/.test(target.name))continue;
  const walk=clips.Walk.targetedAnimations.find(track=>track.target===target&&track.animation.targetProperty==='rotationQuaternion');
  if(!walk)continue;
  const rotations=walk.animation.getKeys().map(key=>key.value as Quaternion);
  if(!rotations.length)continue;
  const neutral=new Quaternion(0,0,0,0);
  for(const rotation of rotations){
   // q and -q represent the same rotation; align their signs before averaging.
   const sign=Quaternion.Dot(rotations[0],rotation)<0?-1:1;
   neutral.x+=sign*rotation.x;neutral.y+=sign*rotation.y;
   neutral.z+=sign*rotation.z;neutral.w+=sign*rotation.w;
  }
  neutral.normalize();
  animation.setKeys(animation.getKeys().map(key=>({...key,value:neutral.clone()})));
 }
 // Keep the authored GLB intact, but do not clone unused bow/alternate clips
 // for every participant. These tracks are never played by the showcase.
 const used=new Set(Object.values(clips));
 for(const clip of asset.animationGroups.filter(clip=>!used.has(clip)))clip.dispose();
 asset.animationGroups=asset.animationGroups.filter(clip=>used.has(clip));
 for(const material of asset.materials)if(material instanceof PBRMaterial)new RangerPalette(material);
 return asset;
}

/** Shared geometry/materials, independent skeletons and animation tracks per walker. */
export async function createRanger(scene:Scene,parent:TransformNode,id=''){
 let source=sources.get(scene);
 if(!source){source=loadSource(scene);sources.set(scene,source);}
 const asset=await source;
 const placeholder=parent.getChildMeshes();
 const instance=asset.instantiateModelsToScene(name=>id?`${id}:${name}`:name,false,{doNotInstantiate:true});
 const clips={} as Record<Gait,AnimationGroup>;
 for(const gait of GAITS)clips[gait]=instance.animationGroups.find(g=>g.name===(id?`${id}:${SOURCES[gait]}`:SOURCES[gait]))!;
 // Meshy faces +Z; the showcase moves forward along -Z.
 const orientation=new TransformNode(id?`${id}:ranger-facing`:'ranger-facing',scene);
 orientation.parent=parent;orientation.rotation.y=Math.PI;
 orientation.scaling.setAll(HEIGHT/SOURCE_HEIGHT);
 for(const node of instance.rootNodes)node.parent=orientation;
 for(const mesh of orientation.getChildMeshes()){mesh.isPickable=false;mesh.receiveShadows=true;mesh.alwaysSelectAsActiveMesh=true;}
 for(const mesh of placeholder)mesh.dispose();
 // Only these three clips run. Bow animations stay available in the source GLB.
 for(const gait of GAITS){
  clips[gait].start(true,0,clips[gait].from,clips[gait].to,false);
  clips[gait].setWeightForAllAnimatables(gait==='Idle'?1:0);
 }
 const weights:Record<Gait,number>={Idle:1,Walk:0,Run:0};
 let gait:Gait='Idle',speed=0;
 return {
  dispose(){instance.dispose();orientation.dispose();},
  update(dt:number,actualSpeed:number,running:boolean){
   if(dt===0){for(const clip of Object.values(clips))clip.speedRatio=0;return;}
   speed+=(actualSpeed-speed)*(1-Math.exp(-dt/.10));
   gait=actualSpeed<.03?'Idle':running?'Run':'Walk';
   const blend=1-Math.exp(-dt/.16);
   for(const name of GAITS){
    weights[name]+=((name===gait?1:0)-weights[name])*blend;
    // Exponential blends otherwise leave tiny positive weights forever, so
    // Babylon keeps evaluating all three skeleton poses after walking once.
    if(name!==gait&&weights[name]<.0001)weights[name]=0;
   }
   weights[gait]=1-GAITS.reduce((sum,name)=>sum+(name===gait?0:weights[name]),0);
   for(const name of GAITS){
    clips[name].setWeightForAllAnimatables(weights[name]);
   }
   clips.Idle.speedRatio=0; // Static standing pose with relaxed arms.
   clips.Walk.speedRatio=Math.max(.15,speed/CYCLE_SPEED.Walk);
   clips.Run.speedRatio=Math.max(.15,speed/CYCLE_SPEED.Run);
  },
  state:()=>({model:'meshy',gait,speed,height:HEIGHT,weights:{...weights},clips:{...SOURCES},
   playbackRate:clips[gait].speedRatio,frame:clips[gait].getCurrentFrame()}),
 };
}
