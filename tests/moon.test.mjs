import test from 'node:test';
import assert from 'node:assert/strict';
import {moonAt,moonAtTotalHours,moonSettings,gameHourOnDay,gameDayAtHour} from '../src/domain/moon.ts';
import {daylightAt} from '../src/domain/daylight.ts';
import {clockElapsedSeconds,clockHour} from '../src/network/persistent-protocol.ts';

test('lunar quarters agree with orbit and first quarter culminates at sunset',()=>{
 for(const [p,lit] of [[0,0],[.25,.5],[.5,1],[.75,.5]])for(let hour=0;hour<24;hour+=.25){
  const moon=moonAt(hour,p),sun=daylightAt(hour).towardSun;
  assert.ok(Math.abs(moon.illuminatedFraction-lit)<1e-12);assert.ok(Math.abs(Math.hypot(...moon.direction)-1)<1e-12);
  assert.ok(Math.abs((1-moon.direction.reduce((s,v,i)=>s+v*sun[i],0))/2-lit)<1e-12);
  if(p===.5)moon.direction.forEach((v,i)=>assert.ok(Math.abs(v+sun[i])<1e-12));
 }
 assert.ok(moonAt(18,.25).direction[1]>.8);
});

test('phase crosses midnight continuously, wraps a whole month and hour scrubbing preserves day',()=>{
 const before=moonAtTotalHours(23.999),after=moonAtTotalHours(24.001);
 assert.ok(Math.abs(before.phase-after.phase)<.00001);
 assert.ok(Math.abs(moonAtTotalHours(12).phase-moonAtTotalHours(12+28*24).phase)<1e-12);
 assert.equal(gameHourOnDay(7*24+23,0),7*24);assert.equal(gameHourOnDay(7*24,23),7*24+23);
 assert.equal(gameDayAtHour(12,7.5),12*24+7.5);
 assert.equal(moonAtTotalHours(1999,moonSettings(undefined,{mode:'full'})).phase,.5);
 assert.throws(()=>moonAtTotalHours(NaN));assert.throws(()=>moonSettings(undefined,{periodDays:0}));
});

test('quarter moons fade in after sunset and out before the sun switches direction',()=>{
 for(const phase of [.25,.75])for(const hour of [6,18]){
  const a=daylightAt(hour-.0001,moonAt(hour-.0001,phase)),b=daylightAt(hour+.0001,moonAt(hour+.0001,phase));
  assert.ok(Math.abs(a.mainIntensity-b.mainIntensity)<1e-6);
  assert.ok([...a.direction,...b.direction].every(Number.isFinite));
 }
 assert.equal(daylightAt(0,moonAt(0,0)).mainIntensity,0);
 assert.equal(daylightAt(0).mainIntensity,.30);
 assert.ok(daylightAt(0,moonAt(0,.5)).mainIntensity>.299);
});

test('shared elapsed time preserves noon epoch, whole days and receipt-time independence',()=>{
 const a={epochMs:1000000,serverMs:2800000,receivedAt:100,cycleSeconds:1200};
 const b={...a,serverMs:2801000,receivedAt:1100};
 assert.equal(clockElapsedSeconds(a,2100),1802);assert.equal(clockElapsedSeconds(a,2100),clockElapsedSeconds(b,2100));
 const total=12+24*clockElapsedSeconds(a,2100)/1200;
 assert.equal(clockHour(a,2100),((total%24)+24)%24);
 assert.deepEqual(moonAtTotalHours(total),moonAtTotalHours(12+24*clockElapsedSeconds(b,2100)/1200));
});
