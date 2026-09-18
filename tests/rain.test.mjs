import test from 'node:test';
import assert from 'node:assert/strict';
import {rainDrop,rainTiles,rainHeight,RAIN_PERIOD} from '../src/domain/rain.ts';

test('rain tile overlap retains seeded drop positions when moving across positive and negative boundaries',()=>{
 for(const edge of [-16,0,16]){
  const a=rainTiles(edge-.01,4),b=rainTiles(edge+.01,4),overlap=a.filter(([x,z])=>b.some(([bx,bz])=>bx===x&&bz===z));
  assert.equal(overlap.length,6);
  for(const [x,z] of overlap)for(let i=0;i<64;i++)assert.deepEqual(rainDrop(x,z,i),rainDrop(x,z,i));
 }
 assert.notDeepEqual(rainDrop(0,0,0),rainDrop(1,0,0));
});

test('rain wraps time without changing seed or height and falls between respawns',()=>{
 const d=rainDrop(-2,3,17),ground=4;
 for(const t of [0,.01,18.2,123.1])assert.ok(Math.abs(rainHeight(t,d,ground)-rainHeight(t+RAIN_PERIOD,d,ground))<1e-10);
 assert.ok(rainHeight(.01,d,ground)<rainHeight(0,d,ground));
 for(let t=0;t<300;t+=.7){const y=rainHeight(t,d,ground);assert.ok(y>=ground&&y<=ground+24);}
});
