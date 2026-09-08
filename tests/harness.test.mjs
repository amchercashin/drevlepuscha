import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentBoxFraction, occludesTraveller, terrainOccludesTraveller, fadeOpacity, moveWalker, groundHeight, walkerIsClear } from '../src/domain/harness.ts';

const wall = { id:'wall', min:{x:1,y:0,z:-4}, max:{x:1.2,y:4,z:4} };
test('padded occlusion catches an obstacle near the edge of the traveller silhouette', () => {
  const t = segmentBoxFraction({x:0,y:2,z:4.1},{x:3,y:2,z:4.1},wall,0.25);
  assert.ok(t !== null && t < 1 / 3);
});
test('occlusion includes camera inside a blocker but excludes geometry behind the traveller', () => {
  assert.ok(occludesTraveller({x:1.1,y:2,z:0},{x:3,y:0,z:0},wall,.35));
  assert.equal(occludesTraveller({x:3,y:2,z:0},{x:2,y:0,z:0},wall,.35),false);
});
test('fade is gradual, reversible, and independent of frame subdivision', () => {
  const first=fadeOpacity(1,.18,1/60,.08);assert.ok(first>.18&&first<1);
  assert.ok(fadeOpacity(first,1,1/60,.25)>first);
  assert.ok(Math.abs(fadeOpacity(first,.18,1/60,.08)-fadeOpacity(1,.18,2/60,.08))<1e-10);
});
test('terrain occlusion detects low camera without displacing it', () => {
  assert.ok(terrainOccludesTraveller({x:0,y:-.5,z:4},{x:0,y:0,z:0}));
  assert.equal(terrainOccludesTraveller({x:0,y:2,z:4},{x:0,y:0,z:0}),false);
});
test('fast player movement cannot tunnel through a thin obstacle', () => {
  const p=moveWalker({e:0,n:0},10,0,[wall]);assert.ok(p.e<0.77);assert.ok(walkerIsClear(p,[wall]));
});
test('player slides along obstacle instead of sticking during diagonal movement', () => {
  const p=moveWalker({e:0,n:0},2,2,[wall]);assert.ok(p.e<0.77);assert.ok(p.n>1.9);
});
test('low lintel occludes the view but permits a 1.1 metre traveller', () => {
  const lintel={id:'lintel',min:{x:-2,y:1.65,z:-1},max:{x:2,y:2.1,z:1}};
  assert.ok(walkerIsClear({e:0,n:0},[lintel]));
  assert.ok(segmentBoxFraction({x:0,y:1.2,z:2},{x:0,y:2.4,z:-2},lintel,0.25)<1);
});
test('slope is continuous and climbable without a vertical step', () => {
  let maxDelta=0;
  for(let n=31;n<48;n+=0.1) maxDelta=Math.max(maxDelta,Math.abs(groundHeight(0,n+0.1)-groundHeight(0,n)));
  assert.ok(maxDelta<0.04);assert.ok(groundHeight(0,48)>3);
});
