import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {ambientPhase,ambientWind} from '../src/domain/ambient.ts';

const power=(gains,ids)=>ids.reduce((sum,id)=>sum+gains[id]**2,0);
const canopyIds=['W03','W04','W05'];
test('wind beds vanish with still vegetation and adjacent gust crossfades stay continuous',()=>{
 assert.ok(Object.values(ambientWind(0,1)).every(x=>x===0));
 for(const g of [.1,.49,.5,.51,.8,1]){
  const gains=ambientWind(1,g);
  assert.ok(Object.values(gains).every(x=>Number.isFinite(x)&&x>=0));
  const before=ambientWind(1,g-1e-5);
  assert.ok(Math.abs(power(gains,canopyIds)-power(before,canopyIds))<1e-5);
  assert.ok([gains.W03,gains.W04,gains.W05].filter(x=>x>0).length<=2);
 }
 assert.deepEqual(ambientWind(2,2),ambientWind(1,1));
});
test('saturated overall wind still has quiet lulls and audible gust contrast',()=>{
 const lull=ambientWind(1,0),gust=ambientWind(1,1),middle=ambientWind(1,.5);
 // Even at maximum overall strength, a lull must not select loud rustling textures.
 assert.equal(lull.W04,0);assert.equal(lull.W05,0);
 assert.ok(power(lull,canopyIds)<power(gust,canopyIds)/100);
 assert.ok(power(middle,canopyIds)>power(lull,canopyIds));
 assert.ok(power(middle,canopyIds)<power(gust,canopyIds));
 // Air peak is at least 12 dB below the previous 0.65 bus gain; lulls quieter still.
 assert.ok(power(gust,['W01','W02'])<.65**2/16);
 assert.ok(power(lull,['W01','W02'])<power(gust,['W01','W02'])/4);
 assert.ok(lull.W06<gust.W06/20);
 const still=ambientWind(1,1,0,0);
 assert.equal(power(still,canopyIds),0);assert.equal(still.W06,0);assert.ok(still.W02>0);
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
