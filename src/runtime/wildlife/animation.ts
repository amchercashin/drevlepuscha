import type {AnimationGroup} from '@babylonjs/core/Animations/animationGroup.js';
import {Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import type {WildlifePose} from '../../domain/wildlife/types.ts';
/** Explicit sampling: no Babylon animatables continue advancing offscreen or in a pause. */
export function createBirdAnimator(groups:AnimationGroup[],takeoffMs=400){
 const clips=new Map(groups.map(g=>[g.name.split(':').at(-1)!,g]));let previous='',switchedAt=-Infinity,old=new Map<object,Map<string,Vector3|Quaternion>>(),lastSample=-Infinity,evaluations=0;
 for(const group of groups)group.stop();
 return {
  update(pose:WildlifePose,simMs:number,hz:number){
   const name=pose.state==='perched'?'perch_idle':pose.state==='alert'?'alert':pose.state==='takeoff'?'takeoff':'fly_loop',group=clips.get(name);if(!group)return;
   if(name!==previous){old=new Map();const blend=!!previous&&(name==='alert'||name==='perch_idle');if(blend)for(const {target,animation} of group.targetedAnimations){const value=target[animation.targetProperty];if(value?.clone){if(!old.has(target))old.set(target,new Map());old.get(target)!.set(animation.targetProperty,value.clone());}}switchedAt=blend?simMs:-Infinity;previous=name;lastSample=-Infinity;}
   const quantized=hz?Math.floor(simMs*hz/1000)*1000/hz:simMs;if(quantized===lastSample)return;lastSample=quantized;evaluations++;
   const elapsed=Math.max(0,(quantized-(name==='fly_loop'?pose.routeStartMs+takeoffMs:pose.stateSinceMs))/1000),loop=name==='perch_idle'||name==='fly_loop';
   const fps=group.targetedAnimations[0]?.animation.framePerSecond??60,span=group.to-group.from;
   const at=group.from+(loop?((elapsed+(name==='perch_idle'?pose.animationVariant*.4:0))*fps)%span:Math.min(span,elapsed*fps)),blend=Math.min(1,Math.max(0,(simMs-switchedAt)/120));
   for(const {target,animation} of group.targetedAnimations){const property=animation.targetProperty,value=animation.evaluate(at),before=old.get(target)?.get(property);
    const next=before&&blend<1?(value instanceof Quaternion?Quaternion.Slerp(before as Quaternion,value,blend):Vector3.Lerp(before as Vector3,value,blend)):value;
    if(target[property]?.copyFrom)target[property].copyFrom(next);else target[property]=next.clone?.()??next;
   }
   if(blend===1)old.clear();
  },stats:()=>({clip:previous,evaluations,automaticAnimatables:groups.reduce((n,g)=>n+g.animatables.length,0)})
 };
}
