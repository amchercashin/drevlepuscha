import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {Scene} from '@babylonjs/core/scene.js';
import {createWildlifeRenderer} from '../src/runtime/wildlife/render.ts';
import {WildlifeWorld} from '../src/domain/wildlife/world.ts';
import {FrameWorkBudget} from '../src/runtime/startup.ts';
const data=JSON.parse(readFileSync('public/wildlife/content/showcase/bird.json','utf8'));

test('shared renderer rebases the same entity and debug routes; budget and disposal are bounded',()=>{
 const engine=new NullEngine(),scene=new Scene(engine),home=data.cells[0].sites[0].home;
 const world=new WildlifeWorld({content:data.identity,authorityEpoch:'renderer-test',seed:'test',cells:new Map(data.cells.map(c=>[c.id,c])),limits:data.limits,bird:data.bird});
 const render=createWildlifeRenderer(scene,data,()=>{});
 try{
  world.advance({simMs:0,observers:[{...home,id:'a',e:home.e+50,headingDeg:0,speedMps:0,running:false,observedAtMs:0}],environment:{totalGameHours:12,daylight01:1,precipitation01:0}});
  const frame=world.snapshot();render.update(frame,0,{e:0,n:0});render.prepare(new FrameWorkBudget(100,0));assert.equal(render.stats().meshes,0);
  render.prepare(new FrameWorkBudget(100,1));assert.equal(render.stats().meshes,1);const mesh=scene.getMeshByName(`TEST-bird:${render.stats().instances[0].id}`),before=mesh.position.clone();
  render.setProbe(true);assert.equal(render.stats().debugRoutes,data.cells.reduce((n,c)=>n+c.routes.length,0));
  render.update(frame,0,{e:10000,n:-20000});assert.equal(mesh.position.x,before.x-10000);assert.equal(mesh.position.z,before.z-20000);assert.equal(mesh.position.y,before.y);assert.equal(render.stats().meshes,1);
  assert.deepEqual(mesh.metadata.absolutePoint,frame.entities.find(e=>e.id===mesh.metadata.entityId).point);assert.equal(render.shadowMeshes(frame.entities.find(e=>e.id===mesh.metadata.entityId).point).length,1);
  render.setProbe(false);assert.equal(render.stats().debugRoutes,0);render.setProbe(true);render.dispose();render.dispose();render.prepare(new FrameWorkBudget(100,1));assert.equal(scene.meshes.length,0);assert.equal(scene.materials.length,0);
 }finally{render.dispose();world.dispose();scene.dispose();engine.dispose();}
});
