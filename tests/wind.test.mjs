import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {WindWeather,angleDelta,gustEnvelope,TAU} from '../src/domain/wind.ts';
import {enableShowcase} from '../src/domain/showcase.ts';
import {makeFloorPatch} from '../src/domain/floor-patch.ts';
import {makeCoverTile} from '../src/domain/cover-field.ts';
const presets=JSON.parse(readFileSync(new URL('../config/wind-presets.json',import.meta.url),'utf8'));

test('weather reproduces at 30/60/144 FPS, is spatial, bounded and does not consume pause time',()=>{
 const runs=[30,60,144].map(fps=>{const w=new WindWeather(presets.forest);for(let i=0;i<fps*120;i++)w.update(1/fps);return w;});
 assert.deepEqual(runs[0].snapshot,runs[1].snapshot);assert.deepEqual(runs[0].snapshot,runs[2].snapshot);
 const w=runs[0],before=structuredClone(w.snapshot),time=w.time;
 for(const dt of [0,0,NaN,-1,60])w.update(dt);
 assert.equal(w.time,time);assert.deepEqual(w.snapshot,before);
 let low=1,high=0;
 for(let i=0;i<60*100;i++){
  w.update(1/60);const s=w.sampleAt(11,0,-24);low=Math.min(low,s.gust01);high=Math.max(high,s.gust01);
  assert.ok(s.strength01>=0&&s.strength01<=1);assert.ok(Math.abs(Math.hypot(...s.directionToXZ)-1)<1e-10);
 }
 assert.ok(low<.001&&high>.1);assert.notEqual(w.sampleAt(11,0,-24).strength01,w.sampleAt(51,0,-4).strength01);
 assert.ok(w.snapshot.fieldPhases.every(p=>p>=0&&p<TAU));
 const previous=structuredClone(w.snapshot);w.setProfile(presets.enchanted);assert.deepEqual(w.snapshot,previous);
});
test('gusts have asymmetric smooth attack/release and directions cross zero by the short arc',()=>{
 assert.ok(Math.abs(angleDelta(359*Math.PI/180,Math.PI/180)-2*Math.PI/180)<1e-12);
 assert.equal(gustEnvelope(-1,2,6),0);assert.equal(gustEnvelope(0,2,6),0);
 assert.equal(gustEnvelope(2,2,6),1);assert.equal(gustEnvelope(8,2,6),0);
 assert.ok(Math.abs(gustEnvelope(2-1e-5,2,6)-gustEnvelope(2+1e-5,2,6))<1e-8);
});
test('wind attributes retain all previous seeded geometry and pin bases along each strip',()=>{
 enableShowcase();
 const expected={grass:'e45046c6e48c75d3817652dc76eac36c72a42945ea0d614ce0f60ae8fd990cf6',leaves:'e3630cc0ec47d47da5ad9f7721cb89032f633e064ad245a17623a1aed4b23516',mid:'49f631435458d85757e4a3becc46444c8bda2efaaab871a800497f44198e3d13',far:'1e56f4b931c3db4ca717271d639f9b6150ee80b7878e472ba83d07f62d778447'};
 for(const [name,g] of Object.entries({...makeFloorPatch(1,1,[]),mid:makeCoverTile(0,0,'mid',[]),far:makeCoverTile(0,0,'far',[])})){
  const {wind,...old}=g;assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'),expected[name]);
  assert.equal(wind.length,g.positions.length/3*4);assert.ok(wind.every(Number.isFinite));
  const weights=wind.filter((_,i)=>i%4===2);assert.ok(weights.includes(0)&&weights.includes(1));assert.ok(weights.every(t=>t>=0&&t<=1));
  if(name==='grass')for(let i=0;i<weights.length;i+=5)assert.deepEqual(weights.slice(i,i+5),[0,0,.6,.6,1]);
  if(name==='leaves')for(let i=0;i<weights.length;i+=10)assert.deepEqual(weights.slice(i,i+10),[0,0,.25,.25,.5,.5,.75,.75,1,1]);
 }
});
