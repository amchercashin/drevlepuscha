import test from 'node:test';
import assert from 'node:assert/strict';
import {computeNormals,hexRgb} from '../src/lite/geometry.ts';

test('computeNormals makes a unit upward face in left-handed winding',()=>{
 const n=computeNormals([0,0,0, 0,0,1, 1,0,0],[0,1,2]);
 assert.ok(n[1]>0.9);
});

test('right-handed winding flips the normal',()=>{
 const lh=computeNormals([0,0,0, 1,0,0, 0,0,1],[0,1,2],false);
 const rh=computeNormals([0,0,0, 1,0,0, 0,0,1],[0,1,2],true);
 assert.ok(lh[1]*rh[1]<0);
});

test('hexRgb converts sRGB bytes',()=>{
 assert.deepEqual(hexRgb('#FF0000'),[1,0,0]);
});
