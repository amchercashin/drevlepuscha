import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateAssets} from '../tools/wildlife/validate-assets.mjs';
import {readGlb} from '../tools/wildlife/glb.mjs';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {Scene} from '@babylonjs/core/scene.js';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode.js';
import {Animation} from '@babylonjs/core/Animations/animation.js';
import {AnimationGroup} from '@babylonjs/core/Animations/animationGroup.js';
import {Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {createBirdAnimator} from '../src/runtime/wildlife/animation.ts';
const manifest=JSON.parse(readFileSync('public/wildlife/assets.json'));
test('candidate assets satisfy measured budgets, clips and hashes, but cannot pass production acceptance',()=>{
 assert.equal(validateAssets(manifest).length,3);assert.throws(()=>validateAssets(manifest,true),/No accepted/);
 const bad=structuredClone(manifest);bad.species[0].lods[0].triangles=12;assert.throws(()=>validateAssets(bad),/Stale asset metric/);
 const hash=structuredClone(manifest);hash.species[0].lods[1].sha256='0'.repeat(64);assert.throws(()=>validateAssets(hash),/hash mismatch/);
 const path=structuredClone(manifest);path.species[0].lods[0].file='../other.glb';assert.throws(()=>validateAssets(path),/Invalid asset path/);
});
test('exported animation tracks sample the same phase on late join, freeze in pause and allocate no animatables',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),g=readGlb('public/wildlife/woodland-bird/lod0.glb');
 function fixture(){const nodes=g.json.nodes.map((n,i)=>{const node=new TransformNode(`test-${i}`,scene);node.rotationQuaternion=Quaternion.FromArray(n.rotation??[0,0,0,1]);node.position=Vector3.FromArray(n.translation??[0,0,0]);node.scaling=Vector3.FromArray(n.scale??[1,1,1]);return node;});
 const groups=g.json.animations.map(clip=>{const group=new AnimationGroup(clip.name,scene);for(const channel of clip.channels){const sampler=clip.samplers[channel.sampler],times=g.accessor(sampler.input).flat(),values=g.accessor(sampler.output),rotation=channel.target.path==='rotation',property={rotation:'rotationQuaternion',translation:'position',scale:'scaling'}[channel.target.path];const animation=new Animation('track',property,50,rotation?Animation.ANIMATIONTYPE_QUATERNION:Animation.ANIMATIONTYPE_VECTOR3);animation.setKeys(times.map((t,i)=>({frame:t*50,value:rotation?Quaternion.FromArray(values[i]):Vector3.FromArray(values[i])})));group.addTargetedAnimation(animation,nodes[channel.target.node]);}return group;});return {nodes,groups,animator:createBirdAnimator(groups)};}
 try{const a=fixture(),b=fixture(),pose={state:'flying',routeStartMs:0,stateSinceMs:400,animationVariant:0};
 a.animator.update(pose,450,60);a.animator.update(pose,1500,60);b.animator.update(pose,1500,60);
 assert.deepEqual(a.nodes.map(n=>n.rotationQuaternion.asArray()),b.nodes.map(n=>n.rotationQuaternion.asArray()));
 const before=a.animator.stats().evaluations;a.animator.update(pose,1500,60);assert.equal(a.animator.stats().evaluations,before);assert.equal(a.animator.stats().automaticAnimatables,0);
 const old=a.nodes.map(n=>n.rotationQuaternion.asArray());a.animator.update(pose,1560,60);assert.notDeepEqual(a.nodes.map(n=>n.rotationQuaternion.asArray()),old);
 assert.equal(scene.animatables.length,0);
 }finally{scene.dispose();engine.dispose();}
});
