import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentBoxFraction, safeCameraFraction, cameraIsClear, moveWalker, groundHeight, walkerIsClear } from '../src/domain/harness.ts';

const wall = { id:'wall', min:{x:1,y:0,z:-4}, max:{x:1.2,y:4,z:4} };
test('camera volume stops before a wall even when its central ray misses the edge', () => {
  const t = segmentBoxFraction({x:0,y:2,z:4.1},{x:3,y:2,z:4.1},wall,0.25);
  assert.ok(t !== null && t < 1 / 3);
});
test('camera returns unoccluded full distance and retracts below user zoom minimum', () => {
  const a={x:0,y:1.2,z:0},b={x:5,y:1.2,z:0};
  assert.equal(safeCameraFraction(a,b,[],0.25),1);
  const t=safeCameraFraction(a,b,[wall],0.25);
  assert.ok(t*5 < 1);
  assert.ok(cameraIsClear({x:5*t,y:1.2,z:0},[wall],0.25));
});
test('look-up ground collision keeps near plane above terrain', () => {
  const a={x:0,y:1.2,z:0},b={x:0,y:-2,z:5},t=safeCameraFraction(a,b,[],0.25);
  assert.ok(t>0 && t<1);
  assert.ok(cameraIsClear({x:0,y:a.y+(b.y-a.y)*t,z:5*t},[],0.25));
});
test('fast player movement cannot tunnel through a thin obstacle', () => {
  const p=moveWalker({e:0,n:0},10,0,[wall]);assert.ok(p.e<0.77);assert.ok(walkerIsClear(p,[wall]));
});
test('player slides along obstacle instead of sticking during diagonal movement', () => {
  const p=moveWalker({e:0,n:0},2,2,[wall]);assert.ok(p.e<0.77);assert.ok(p.n>1.9);
});
test('low lintel blocks camera but permits a 1.1 metre traveller', () => {
  const lintel={id:'lintel',min:{x:-2,y:1.65,z:-1},max:{x:2,y:2.1,z:1}};
  assert.ok(walkerIsClear({e:0,n:0},[lintel]));
  assert.ok(segmentBoxFraction({x:0,y:1.2,z:2},{x:0,y:2.4,z:-2},lintel,0.25)<1);
});
test('slope is continuous and climbable without a vertical step', () => {
  let maxDelta=0;
  for(let n=31;n<48;n+=0.1) maxDelta=Math.max(maxDelta,Math.abs(groundHeight(0,n+0.1)-groundHeight(0,n)));
  assert.ok(maxDelta<0.04);assert.ok(groundHeight(0,48)>3);
});
