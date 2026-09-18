import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {generateForestPlacements} from '../src/domain/forest-layout.ts';
import {forestPlacements} from '../src/domain/forest.ts';
import {showcaseHeight,enableShowcase} from '../src/domain/showcase.ts';
import {groundHeight} from '../src/domain/harness.ts';
import {compile,sourceHashes} from '../tools/wildlife/build.mjs';
import {readJSON} from '../tools/wildlife/scene-data.mjs';
import {validatePackage} from '../src/domain/wildlife/habitat.ts';
import {transformAnchor} from '../src/domain/wildlife/routes.ts';
import {Matrix,Vector3} from '@babylonjs/core/Maths/math.vector.js';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const golden=readJSON('tests/fixtures/wildlife-forest-golden.json'),main=readJSON('assets/trees/meshy-a/tree.json');
test('pre-refactor golden: all placements and final family seating remain identical',()=>{
 for(const mode of ['legacy-m1','showcase']){
  if(mode==='showcase')enableShowcase();
  for(const variation of [false,true]){
   const expected=golden.cases.find(c=>c.mode===mode&&c.variation===variation),trees=forestPlacements(variation?main.rootRadius:3.8,variation?main.placement:undefined);
   assert.equal(trees.length,expected.count);assert.equal(sha(trees),expected.sha256);
   assert.deepEqual(trees,generateForestPlacements({mode,rootRadiusM:variation?main.rootRadius:3.8,variation:variation?main.placement:undefined,heightAt:mode==='showcase'?showcaseHeight:groundHeight}));
  }
 }
 const {scene}=compile();assert.equal(sha(scene.records.map(r=>r.placement)),golden.finalShowcaseSha256);
 assert.equal(scene.propBoxes.length,18);assert.ok(scene.families.length>3);
 for(const {placement:p,slot} of scene.records){const t=scene.catalog.get(p.id);assert.equal(t.familyId,scene.families[slot].id);assert.equal(t.modelToAbsoluteXYZ[13],Math.fround(p.y));assert.ok(Object.isFrozen(t.modelToAbsoluteXYZ));}
});
test('compiled content is reproducible, clear along the entire smoothed corridor, and rejects corruption',()=>{
 const a=compile().data,b=compile().data;assert.deepEqual(a,b);validatePackage(a);
 const bad=structuredClone(a);bad.cells[0].routes[0].samples[1].distanceM=0;assert.throws(()=>validatePackage(bad),/arc length/);
 const stale=structuredClone(a);stale.cells[0].contentHash='bad';assert.throws(()=>validatePackage(stale),/hash/);
 assert.deepEqual(readJSON('public/wildlife/content/manifest.json').sourceHashes,sourceHashes());
 assert.deepEqual(readJSON('public/wildlife/content/showcase/bird.json'),a);
});
test('anchor normal uses inverse transpose under nonuniform scale and tilt',()=>{
 const {scene}=compile(),tree=[...scene.catalog.all()].find(t=>Math.abs(t.modelToAbsoluteXYZ[1])>.001),m=Matrix.FromArray(tree.modelToAbsoluteXYZ),normal=[.3,.8,.5];
 const actual=transformAnchor([1,2,3],normal,tree.modelToAbsoluteXYZ),expected=Vector3.TransformNormal(Vector3.FromArray(normal),Matrix.Transpose(Matrix.Invert(m))).normalize();
 assert.ok(Math.hypot(actual.normal[0]-expected.x,actual.normal[1]+expected.z,actual.normal[2]-expected.y)<1e-6);
});
