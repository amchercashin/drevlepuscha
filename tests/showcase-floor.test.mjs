import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFloorPatch} from '../src/domain/floor-patch.ts';

test('showcase undergrowth is repeatable, denser and bounded',()=>{
 const height=()=>0;
 for(const [cx,cz] of [[3,4],[-4,3],[4,8]]){
  const dense=makeFloorPatch(cx,cz,[],height,true),legacy=makeFloorPatch(cx,cz,[],height,false);
  assert.deepEqual(dense,makeFloorPatch(cx,cz,[],height,true));
  const denseIndices=dense.grass.indices.length+dense.leaves.indices.length,legacyIndices=legacy.grass.indices.length+legacy.leaves.indices.length;
  assert.ok(denseIndices>legacyIndices*5);
  assert.ok(dense.leaves.indices.length>denseIndices*.65);
  let triangles=0;
  for(const g of Object.values(dense)){
   triangles+=g.indices.length/3;
   assert.ok(g.positions.every(Number.isFinite));
   assert.equal(g.positions.length/3,g.heights.length);
   assert.equal(g.uvs.length,g.heights.length*2);
   assert.ok(g.indices.every(i=>i>=0&&i<g.heights.length));
  }
  assert.ok(triangles>0&&triangles<=10368);
 }
});
test('dense showcase cover still excludes steep slopes and obstacle footprints',()=>{
 const box={min:{x:0,y:-100,z:-30},max:{x:30,y:100,z:0}};
 for(const p of [makeFloorPatch(1,1,[],e=>e,true),makeFloorPatch(1,1,[box],()=>0,true)]){
  assert.equal(p.grass.indices.length+p.leaves.indices.length,0);
 }
});

test('world reuses showcase foliage at map coordinates and honours placement exclusions',()=>{
 const height=(e,n)=>100+e*.01+n*.02;
 const patch=makeFloorPatch(200,3200,[],height,true,(e,n)=>e>=1603&&n>=25602);
 assert.ok(patch.grass.indices.length>0);assert.ok(patch.leaves.indices.length>0);
 for(const g of Object.values(patch))for(let i=0;i<g.positions.length;i+=3){
  const [e,h,z]=g.positions.slice(i,i+3);assert.ok(e>1602&&-z>25601);assert.ok(h>=height(e,-z)-.05);
 }
 const empty=makeFloorPatch(200,3200,[],height,true,()=>false);
 assert.equal(empty.grass.indices.length+empty.leaves.indices.length,0);
});
