import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudPixels,createMoonPixels,noise,CLOUD_TEXTURE_SIZE,MOON_TEXTURE_SIZE} from '../src/domain/sky-textures.ts';
import {cloudTransmission} from '../src/domain/sky.ts';

test('cloud and lunar maps are deterministic independently sized RGBA data',()=>{
 const clouds=createCloudPixels(),moon=createMoonPixels();
 assert.equal(clouds.length,CLOUD_TEXTURE_SIZE**2*4);assert.equal(moon.length,MOON_TEXTURE_SIZE**2*4);
 assert.deepEqual(clouds,createCloudPixels());assert.deepEqual(moon,createMoonPixels());
 for(let c=0;c<4;c++){const values=clouds.filter((_,i)=>i%4===c);assert.ok(Math.min(...values)<100);assert.ok(Math.max(...values)>150);}
 for(let i=3;i<moon.length;i+=4)assert.equal(moon[i],255);
 assert.ok(clouds.some((v,i)=>i%4===3&&v!==255),'A is warp data, not alpha');
});

test('continuous noise tiles at +1 including negative coordinates, not equal edge texels',()=>{
 for(const u of [-1.23,-.001,0,.37,.999])for(const v of [-.75,0,.22])for(const freq of [4,8,16,64]){
  assert.ok(Math.abs(noise(u,v,freq,37)-noise(u+1,v,freq,37))<1e-12);
  assert.ok(Math.abs(noise(u,v,freq,37)-noise(u,v+1,freq,37))<1e-12);
 }
});

test('coverage and thickness have independent transparent and completely opaque endpoints',()=>{
 for(let i=0;i<=100;i++){
  const density=i/100;
  assert.equal(cloudTransmission(density,0,16),1);
  assert.equal(cloudTransmission(density,.8,0),1);
  assert.equal(cloudTransmission(density,1,16),0);
  const thin=cloudTransmission(density,.5,1),thick=cloudTransmission(density,.5,8);
  assert.ok(thick<=thin&&thick>=0&&thin<=1);
 }
});
