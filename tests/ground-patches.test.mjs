import test from 'node:test';
import assert from 'node:assert/strict';
import {groundPatch,groundWarp} from '../src/domain/ground-patches.ts';

test('ground has sparse, dense, mossy and bare patches on both sides of the origin',()=>{
 const leaves=[],moss=[];
 for(let n=-250;n<380;n+=7)for(let e=-250;e<250;e+=11){
  const p=groundPatch(e,n);leaves.push(p.leaves);moss.push(p.moss);
  assert.deepEqual(p,groundPatch(e,n));
  for(const v of [...Object.values(p),...groundWarp(e,n)])assert.ok(Number.isFinite(v)&&v>=0&&v<=1);
 }
 for(const values of [leaves,moss]){
  assert.ok(values.filter(v=>v<.15).length>values.length*.1);
  assert.ok(values.filter(v=>v>.85).length>values.length*.1);
 }
});
test('warp is continuous across old texture repeats and streaming tile edges',()=>{
 for(let n=-200;n<300;n+=8){
  const a=groundWarp(8-.001,n),b=groundWarp(8+.001,n);
  assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<.001);
  const c=groundWarp(8+3.2*.8660254,n-3.2*.5);
  assert.ok(Math.hypot(a[0]-c[0],a[1]-c[1])>.0001);
 }
});
