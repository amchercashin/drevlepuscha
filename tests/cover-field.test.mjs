import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeCoverTile,COVER,coverWeight} from '../src/domain/cover-field.ts';

test('coarse and middle cover are deterministic, bounded and rooted in the terrain',()=>{
 for(const layer of ['far','mid']){
  const h=(e,n)=>.1*e+.1*n,g=makeCoverTile(2,1,layer,[],h);
  assert.deepEqual(g,makeCoverTile(2,1,layer,[],h));
  assert.ok(g.indices.length>0&&g.indices.length/3<=4000);
  assert.equal(g.positions.length,g.normals.length);assert.equal(g.uvs.length,g.positions.length/3*2);
  assert.equal(g.colors.length,g.positions.length/3*4);assert.ok(g.positions.every(Number.isFinite));
  assert.ok(g.indices.every(i=>i>=0&&i<g.positions.length/3));
  for(let i=0;i<g.positions.length;i+=3){const [x,y,z]=g.positions.slice(i,i+3);assert.ok(y>=h(x,-z)-.13);}
 }
});
test('cover respects steep banks, world bounds and obstacles',()=>{
 const box={min:{x:-1000,y:-1000,z:-1000},max:{x:1000,y:1000,z:1000}};
 for(const layer of ['far','mid']){
  assert.equal(makeCoverTile(1,1,layer,[],e=>e*2).indices.length,0);
  assert.equal(makeCoverTile(1,1,layer,[box],()=>0).indices.length,0);
  assert.equal(makeCoverTile(100,100,layer,[],()=>0).indices.length,0);
 }
});
test('detail fade has smooth endpoints and the cache leads a 15 m/s run at 30 FPS',()=>{
 assert.equal(coverWeight(COVER.nearStart,COVER.nearStart,COVER.nearEnd),1);
 assert.equal(coverWeight(COVER.nearEnd,COVER.nearStart,COVER.nearEnd),0);
 assert.equal(coverWeight(18,12,24),.5);
 const lead=(COVER.nearRadius*8-1-COVER.nearEnd)/15;
 assert.ok(lead>(COVER.nearRadius*2+1)/30);
});
test('showcase haze has no moving shadow sampler or eye-relative density field',()=>{
 const air=readFileSync(new URL('../src/runtime/height-air.ts',import.meta.url),'utf8');
 assert.doesNotMatch(air,/sunDepth|sunMatrix|floorTime|for\s*\(/);
 assert.match(air,/lo-4\.0/);assert.match(air,/hi-4\.0/);assert.match(air,/optical/);
 const fade=readFileSync(new URL('../src/runtime/cover-fade.ts',import.meta.url),'utf8');
 assert.doesNotMatch(fade,/CUSTOM_VERTEX|positionUpdated|bladeHeight/);
});
