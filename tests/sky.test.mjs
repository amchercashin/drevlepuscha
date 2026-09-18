import test from 'node:test';
import assert from 'node:assert/strict';
import {SKY_DEFAULTS,skySettings,modulo,cloudOffsets,advanceSkyTime,starHash,starRotation,moonBasis,sampleCloudChannel,cloudTransmissionAt,sourceTransmission} from '../src/domain/sky.ts';
import {createCloudPixels,CLOUD_TEXTURE_SIZE} from '../src/domain/sky-textures.ts';

test('nested sky patches preserve independent controls and do not share mutable defaults',()=>{
 const original=skySettings(),changed=skySettings(original,{low:{coverage:.9},moon:{halo:0}});
 assert.equal(changed.low.coverage,.9);assert.equal(changed.low.opticalDepth,original.low.opticalDepth);
 assert.deepEqual(changed.high,original.high);assert.equal(changed.moon.halo,0);assert.equal(changed.moon.sizeScale,1);
 changed.low.scale[0]=8;assert.equal(SKY_DEFAULTS.low.scale[0],.65);assert.equal(original.low.scale[0],.65);
 assert.equal(skySettings(original,{motionScale:20,low:{coverage:-1,opticalDepth:100}}).motionScale,4);
 assert.equal(skySettings(original,{low:{coverage:-1}}).low.coverage,0);
 for(const value of [NaN,Infinity,-Infinity])for(const patch of [{motionScale:value},{high:{velocity:[value,0]}},{moon:{halo:value}},{stars:{brightness:value}}])assert.throws(()=>skySettings(original,patch),/finite/);
});

test('cloud motion freezes, rejects invalid deltas and wraps each sample in its own period',()=>{
 const s=skySettings();assert.equal(advanceSkyTime(20,.04,0),20);
 for(const dt of [NaN,Infinity,-1])assert.equal(advanceSkyTime(20,dt,1),20);
 const t=advanceSkyTime(20,.04,2);assert.equal(t,20.08);
 // The new speed advances from the accumulated time, never newSpeed * oldTime.
 assert.ok(Math.abs(advanceSkyTime(t,.04,.5)-20.10)<1e-12);
 const before=cloudOffsets(1/s.low.velocity[0]-.0001,s),after=cloudOffsets(1/s.low.velocity[0]+.0001,s);
 for(const key of Object.keys(before))for(let i=0;i<2;i++)assert.ok(Math.abs(modulo(after[key][i]-before[key][i]+.5,1)-.5)<1e-6);
 for(const pair of Object.values(cloudOffsets(1e9,s)))for(const v of pair)assert.ok(v>=0&&v<1);
});

test('star identity wraps for negative seam neighbours, preserves seed and midnight orientation',()=>{
 assert.equal(modulo(-1,360),359);
 for(let x=-1;x<=360;x+=13)for(let y=0;y<180;y+=19)for(let salt=0;salt<6;salt++){
  assert.equal(starHash(x,y,salt),starHash(x+360,y,salt));assert.equal(starHash(x,y,salt),starHash(x-360,y,salt));
 }
 assert.deepEqual(starRotation(0),starRotation(24));
 const a=starRotation(23.999),b=starRotation(.001);assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<.001);
 assert.notEqual(starHash(12,35),starHash(12,36));
});

test('moon basis is finite and orthonormal at both poles and ordinary directions',()=>{
 for(const direction of [[0,1,0],[0,-1,0],[0,0,1],[.2,.82,-.54]]){
  const {right,up}=moonBasis(direction);
  assert.ok([...right,...up].every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(...right)-1)<1e-12);assert.ok(Math.abs(Math.hypot(...up)-1)<1e-12);
  assert.ok(Math.abs(right.reduce((sum,v,i)=>sum+v*up[i],0))<1e-12);
 }
 assert.throws(()=>moonBasis([0,0,0]));assert.throws(()=>moonBasis([NaN,0,1]));
});

test('CPU cloud sampler uses texel centres, repeat and the GPU density endpoints',()=>{
 const pixels=new Uint8Array([0,0,0,0,255,0,0,0,128,0,0,0,64,0,0,0]);
 assert.equal(sampleCloudChannel(pixels,2,.25,.25,0),0);assert.equal(sampleCloudChannel(pixels,2,.75,.25,0),1);
 assert.equal(sampleCloudChannel(pixels,2,-.25,.25,0),1);assert.equal(sampleCloudChannel(pixels,2,0,.25,0),.5);
 const clouds=createCloudPixels(),settings=skySettings(),offset=cloudOffsets(12,settings);
 for(const direction of [[0,1,0],[1,0,0],[0,.82,-Math.sqrt(1-.82**2)]]){
  const clear=skySettings(settings,{low:{opticalDepth:0},high:{opticalDepth:0}});
  const dense=skySettings(settings,{low:{coverage:1,opticalDepth:16}});
  assert.equal(cloudTransmissionAt(clouds,CLOUD_TEXTURE_SIZE,direction,clear,offset),1);
  assert.equal(sourceTransmission(clouds,CLOUD_TEXTURE_SIZE,direction,dense,offset),0);
 }
});
