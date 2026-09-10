import test from 'node:test';
import assert from 'node:assert/strict';
import {daylightAt,normalizeHour,DAY_PRESETS} from '../src/domain/daylight.ts';

test('daylight wraps midnight and rejects non-finite clock values',()=>{
 assert.deepEqual(daylightAt(0),daylightAt(24));assert.deepEqual(daylightAt(-1),daylightAt(23));
 for(const value of [NaN,Infinity,-Infinity])assert.throws(()=>normalizeHour(value));
});
test('sun and full moon remain opposed, normalized and independent of the camera',()=>{
 for(let h=0;h<24;h+=.125){
  const s=daylightAt(h);
  assert.ok(Math.abs(Math.hypot(...s.direction)-1)<1e-12);
  assert.ok(Math.abs(Math.hypot(...s.towardSun)-1)<1e-12);
  assert.ok(s.direction[1]<=1e-12);
  for(let i=0;i<3;i++)assert.equal(s.towardMoon[i],-s.towardSun[i]);
  assert.ok(s.mainIntensity>=0&&s.mainIntensity<=1.18);
  assert.ok(s.stars>=0&&s.stars<=1);
  for(const color of [s.mainColor,s.zenith,s.horizon,s.fogColor])assert.ok(color.every(c=>Number.isFinite(c)&&c>=0&&c<=1));
 }
});
test('night has dim moonlight, stars and reduced plant emission; sunrise has no light jump',()=>{
 const day=daylightAt(DAY_PRESETS.day),night=daylightAt(DAY_PRESETS.night);
 assert.equal(day.source,'sun');assert.equal(night.source,'moon');assert.equal(day.stars,0);assert.equal(night.stars,1);
 assert.ok(night.mainIntensity<day.mainIntensity*.4);assert.ok(night.emissionScale<day.emissionScale*.1);
 for(const boundary of [6,18]){
  const a=daylightAt(boundary-.0001),b=daylightAt(boundary+.0001);
  assert.ok(a.mainIntensity<1e-6&&b.mainIntensity<1e-6);
  for(let i=0;i<3;i++)assert.ok(Math.abs(a.fogColor[i]-b.fogColor[i])<.001);
 }
});
