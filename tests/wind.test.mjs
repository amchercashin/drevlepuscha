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
 // Compare geometry to a micrometre; native trigonometry can differ below that across CPUs.
 const expected={"grass":"70aff940c3d6af8e5a64ef00eaa8306cb188dedbfead03afdc3697a8281ae545","leaves":"6cffd9c62826322cdeee6fd02ef4eaeb37a022216b808293689cc03f60fdddc6","mid":"61f3b91f5538056e7bbb570eac4ee661fec85ebb9b2e4d710a1dadf35d0a5104","far":"55ece9037dc0e9a6cd7a4feab69024616de80ae5e131fb66324dc3e05ec5fa66"};
 for(const [name,g] of Object.entries({...makeFloorPatch(1,1,[]),mid:makeCoverTile(0,0,'mid',[]),far:makeCoverTile(0,0,'far',[])})){
  const {wind,...old}=g;assert.equal(createHash('sha256').update(JSON.stringify(old,(_,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v)).digest('hex'),expected[name]);
  assert.equal(wind.length,g.positions.length/3*4);assert.ok(wind.every(Number.isFinite));
  const weights=wind.filter((_,i)=>i%4===2);assert.ok(weights.includes(0)&&weights.includes(1));assert.ok(weights.every(t=>t>=0&&t<=1));
  if(name==='grass')for(let i=0;i<weights.length;i+=5)assert.deepEqual(weights.slice(i,i+5),[0,0,.6,.6,1]);
  if(name==='leaves')for(let i=0;i<weights.length;i+=10)assert.deepEqual(weights.slice(i,i+10),[0,0,.25,.25,.5,.5,.75,.75,1,1]);
 }
});


test('expanded preferences clamp extremes, preserve legacy saves and allow separate canopy/cover response',async()=>{
 const {DEFAULT_WIND,updateWindSettings}=await import('../src/domain/wind-settings.ts');
 const saved=updateWindSettings(DEFAULT_WIND,{intensity:1.5,preset:'enchanted'});
 assert.equal(saved.canopyBend,1.25);assert.equal(saved.coverBend,1.5);assert.equal(saved.intensity,1.5);
 const wide=updateWindSettings(saved,{intensity:9,canopyBend:9,coverBend:0,gustStrength:NaN,motionSpeed:-1,gustFrequency:Infinity});
 assert.equal(wide.intensity,6);assert.equal(wide.canopyBend,4);assert.equal(wide.coverBend,0);assert.equal(wide.gustStrength,2);assert.equal(wide.motionSpeed,.25);assert.equal(wide.gustFrequency,1);
 assert.equal(DEFAULT_WIND.intensity,3.5);
});
test('manual gust and extended strength preserve normalized audio samples and continuous phases',()=>{
 const mild=new WindWeather(presets.forest),strong=new WindWeather(presets.forest);
 strong.setTuning(4,3,2.5);strong.triggerGust();
 let mildPeak=0,strongPeak=0;
 for(let i=0;i<60*12;i++){
  mild.update(1/60);strong.update(1/60);
  const a=mild.sampleAt(0,0,0),b=strong.sampleAt(0,0,0);
  mildPeak=Math.max(mildPeak,a.gust01);strongPeak=Math.max(strongPeak,b.gust01);
  for(const value of [b.strength01,b.gust01,b.turbulence01])assert.ok(value>=0&&value<=1);
 }
 assert.ok(strongPeak>mildPeak*2);
 const phase=[...strong.snapshot.motionPhases];strong.setTuning(0,.25,.25);assert.deepEqual(strong.snapshot.motionPhases,phase);
});
