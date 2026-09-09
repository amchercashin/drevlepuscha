import test from 'node:test';import assert from 'node:assert/strict';
import {assetWarp,warpAssetPoint} from '../src/domain/asset-variation.ts';
test('asset warp has stable seeds and an exact undeformed source variant',()=>{
 assert.deepEqual(assetWarp('oak',2),assetWarp('oak',2));assert.notDeepEqual(assetWarp('oak',1),assetWarp('oak',2));
 assert.deepEqual(warpAssetPoint(1,12,2,17,assetWarp('oak',0),'tree'),[1,12,2]);
});
test('tree roots and collision trunk stay fixed while upper crown changes',()=>{
 const p=assetWarp('oak',2);for(const y of [0,.4,3,6])assert.deepEqual(warpAssetPoint(2,y,-1,17,p,'tree'),[2,y,-1]);
 assert.notDeepEqual(warpAssetPoint(2,15,-1,17,p,'tree'),[2,15,-1]);
});
test('bounded profiles preserve height order and exact shared branch junctions',()=>{
 for(let seed=0;seed<20;seed++){const p=assetWarp('tree-'+seed,1);let previous=-Infinity;
  for(let y=0;y<=18;y+=.1){const point=warpAssetPoint(.5,y,.3,18,p,'tree');assert.ok(point.every(Number.isFinite));assert.ok(point[1]>previous);previous=point[1];assert.deepEqual(point,warpAssetPoint(.5,y,.3,18,p,'tree'));}
 }
});
