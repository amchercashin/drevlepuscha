import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFloorPatch,floorCellDistance} from '../src/domain/floor-patch.ts';
test('floor is repeatable, bounded and retains local slope contact during disappearance',()=>{
 const height=(e,n)=>e*.2+n*.1;
 const patch=makeFloorPatch(1,1,[],height);
 assert.deepEqual(patch,makeFloorPatch(1,1,[],height));
 let triangles=0;
 for(const g of Object.values(patch)){
  triangles+=g.indices.length/3;assert.equal(g.positions.length/3,g.heights.length);assert.equal(g.uvs.length,g.heights.length*2);
  assert.ok(g.positions.every(Number.isFinite));
  for(let i=0;i<g.heights.length;i++){const [x,y,z]=g.positions.slice(i*3,i*3+3);assert.ok(y-g.heights[i]<height(x,-z));}
 }
 assert.ok(triangles>0&&triangles<1600);
});
test('steep banks and obstacle footprints do not grow plants',()=>{
 for(const p of [makeFloorPatch(1,1,[],e=>e),makeFloorPatch(1,1,[{min:{x:0,y:-100,z:-30},max:{x:30,y:100,z:0}}])]){
  assert.equal(p.grass.indices.length+p.leaves.indices.length,0);
 }
});
test('cell distance conservatively includes overhanging leaves',()=>{
 assert.equal(floorCellDistance(9,4,0,0),0);
 assert.equal(floorCellDistance(30,4,0,0),21);
 assert.ok(floorCellDistance(30,30,0,0)>21);
});
