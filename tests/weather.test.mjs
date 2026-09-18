import test from 'node:test';
import assert from 'node:assert/strict';
import {WEATHER_PRESETS,startWeatherTransition,evaluateTransition,automaticWeather,WEATHER_PERIOD_SECONDS,WEATHER_SEGMENTS} from '../src/domain/weather.ts';

test('weather transitions handle endpoints and delay rain behind cloud cover',()=>{
 const t=startWeatherTransition(WEATHER_PRESETS.clear,WEATHER_PRESETS.downpour,10,20);
 assert.deepEqual(evaluateTransition(t,0),WEATHER_PRESETS.clear);assert.deepEqual(evaluateTransition(t,31),WEATHER_PRESETS.downpour);
 assert.equal(evaluateTransition(t,15).precipitation,0);assert.ok(evaluateTransition(t,15).lowCoverage>WEATHER_PRESETS.clear.lowCoverage);
 assert.deepEqual(evaluateTransition(startWeatherTransition(t.from,t.to,0,0),0),WEATHER_PRESETS.downpour);
 assert.throws(()=>evaluateTransition(t,NaN));assert.throws(()=>startWeatherTransition(t.from,t.to,0,Infinity));
 assert.throws(()=>evaluateTransition({...t,to:{...t.to,precipitation:NaN}},20));
 assert.throws(()=>evaluateTransition({...t,rainWindow:[0,Infinity]},20));
 const stop=startWeatherTransition(t.to,t.from,0,20);
 assert.equal(evaluateTransition(stop,10).precipitation,0);assert.ok(evaluateTransition(stop,10).lowCoverage>t.from.lowCoverage);
});

test('interrupting a transition starts at its current blend with no jump or accumulated multipliers',()=>{
 const first=startWeatherTransition(WEATHER_PRESETS.clear,WEATHER_PRESETS.downpour,0,12),now=evaluateTransition(first,6);
 const next=startWeatherTransition(now,WEATHER_PRESETS.mixed,6,12);
 assert.deepEqual(evaluateTransition(next,6),now);
 for(let i=0;i<200;i++)assert.deepEqual(evaluateTransition(next,8),evaluateTransition(next,8));
});

test('automatic weather is reproducible, periodic and continuous at segment boundaries',()=>{
 let seconds=0;
 for(const segment of WEATHER_SEGMENTS){
  const a=automaticWeather(seconds-.00001).state,b=automaticWeather(seconds+.00001).state;
  for(const key of Object.keys(a))assert.ok(Math.abs(a[key]-b[key])<1e-7,key);
  assert.deepEqual(automaticWeather(seconds),automaticWeather(seconds+WEATHER_PERIOD_SECONDS));seconds+=segment.seconds;
 }
 assert.throws(()=>automaticWeather(Infinity));
});
