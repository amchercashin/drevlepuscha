import test from 'node:test';
import assert from 'node:assert/strict';
import {collisionGrid} from '../src/domain/collision-grid.ts';
import {moveWalker,walkerIsClear} from '../src/domain/harness.ts';
import {forestPlacements,treeCollider,FOREST_BOUNDS} from '../src/domain/forest.ts';
import {createRandom} from '../src/domain/seed.ts';
test('grid broad phase preserves full-list walking and fast diagonal collision results',()=>{
 const boxes=forestPlacements().map(p=>treeCollider(p)),query=collisionGrid(boxes),r=createRandom(947);
 for(let i=0;i<3000;i++){
  const p={e:r()*450-225,n:r()*580-230};if(!walkerIsClear(p,boxes))continue;
  const de=(r()-.5)*1.5,dn=(r()-.5)*1.5;
  assert.deepEqual(moveWalker(p,de,dn,query(p,de,dn),FOREST_BOUNDS),moveWalker(p,de,dn,boxes,FOREST_BOUNDS));
 }
});
test('grid includes large obstacles and hulls crossing negative cell boundaries',()=>{
 const b={id:'wide',min:{x:-40,y:0,z:-32},max:{x:32,y:9,z:32}},query=collisionGrid([b]);
 assert.deepEqual(query({e:-40.2,n:16},0,0),[b]);
 assert.deepEqual(query({e:0,n:0},0,0),[b]);
 assert.deepEqual(query({e:64,n:64},.1,.1),[]);
});
