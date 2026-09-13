import test from 'node:test';
import assert from 'node:assert/strict';
import {showcaseResolution,recommendedQuality,AutoQuality} from '../src/runtime/showcase-quality.ts';
test('phone presets actually decrease pixels in both orientations, including DPR 1',()=>{
 for(const [w,h] of [[390,844],[844,390],[1280,720]])for(const dpr of [1,2,3]){
  const sizes=['performance','balanced','high'].map(q=>showcaseResolution(w,h,dpr,q));
  const pixels=sizes.map(s=>s.width*s.height);
  assert.ok(pixels[0]<=pixels[1]&&pixels[1]<=pixels[2]);
  if(dpr>=2)assert.ok(pixels[0]<pixels[1]&&pixels[1]<pixels[2]);
  assert.ok(pixels[0]<=960*540+2000);
 }
 assert.equal(recommendedQuality(true),'balanced');assert.equal(recommendedQuality(false),'high');
 assert.equal(recommendedQuality(true,4),'performance');
 assert.ok(showcaseResolution(10000,6000,3,'native',4096).width<=4096);
});
test('automatic quality ignores a hitch, needs sustained slow frames, and has a floor',()=>{
 const q=new AutoQuality('high');
 for(let i=0;i<360;i++)assert.equal(q.sample(i===60?80:16.7),false);
 assert.equal(q.effective,'high');
 for(let i=0;i<359;i++)assert.equal(q.sample(30),false);
 assert.equal(q.sample(30),true);assert.equal(q.effective,'balanced');
 for(let i=0;i<100;i++)q.sample(30);q.reset();
 for(let i=0;i<359;i++)assert.equal(q.sample(30),false);
 assert.equal(q.sample(30),true);assert.equal(q.effective,'performance');
 for(let i=0;i<720;i++)assert.equal(q.sample(30),false);
});

test('auto steps down for sustained 50-55 FPS, aiming for 60 rather than 48',()=>{
 const q=new AutoQuality('balanced');
 for(let i=0;i<360;i++)q.sample(17);
 assert.equal(q.effective,'balanced');
 for(let i=0;i<360;i++)q.sample(19);
 assert.equal(q.effective,'performance');
});
