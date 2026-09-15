import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {ambientPhase,ambientWind} from '../src/domain/ambient.ts';

test('wind beds vanish with still vegetation and adjacent crossfades preserve power',()=>{
 assert.ok(Object.values(ambientWind(0)).every(x=>x===0));
 for(const w of [.1,.49,.5,.51,.8,1]){
  const gains=ambientWind(w);
  assert.ok(Object.values(gains).every(x=>Number.isFinite(x)&&x>=0));
  assert.ok(Math.abs(gains.W01**2+gains.W02**2-(.65*w**.7)**2)<1e-12);
  assert.ok(Math.abs(gains.W03**2+gains.W04**2+gains.W05**2-(.9*w)**2)<1e-12);
  assert.ok([gains.W03,gains.W04,gains.W05].filter(x=>x>0).length<=2);
 }
 assert.deepEqual(ambientWind(2),ambientWind(1));
});
test('day phases match lighting presets and wrap continuously across midnight',()=>{
 const weights={night:.9,dawn:1,day:.1,dusk:.6};
 for(const [h,key] of [[0,'night'],[7.5,'dawn'],[12,'day'],[17.5,'dusk'],[24,'night']])assert.equal(ambientPhase(h,weights),weights[key]);
 assert.ok(Math.abs(ambientPhase(23.999,weights)-ambientPhase(.001,weights))<1e-6);
});
test('all 15 shipped sounds match provenance; only four rejected sources were replaced',()=>{
 const bank=JSON.parse(readFileSync(new URL('../config/showcase-audio.json',import.meta.url)));
 assert.equal(bank.assets.length,15);assert.equal(new Set(bank.assets.map(a=>a.id)).size,15);
 assert.deepEqual(bank.assets.filter(a=>a.replacement).map(a=>a.id),['W03','W06','T03','I01']);
 for(const asset of bank.assets){
  const bytes=readFileSync(new URL(`../public/audio/showcase/${asset.file}`,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
  assert.ok(asset.duration>0&&asset.trim>0&&asset.trim<=1);
  if(asset.kind!=='loop')assert.equal(asset.channels,1);
 }
});
