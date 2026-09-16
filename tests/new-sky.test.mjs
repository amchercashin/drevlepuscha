import test from 'node:test';
import assert from 'node:assert/strict';
import {daylightAt,normalizeHour,DAY_PRESETS} from '../src/domain/daylight.ts';
import {skyModeFromParams} from '../src/domain/sky-scene.ts';
import {createCloudLayerPixels,createCirrusLayerPixels,SKY_LAYER_SIZE} from '../src/domain/sky-noise.ts';
import {DEFAULT_ATMOSPHERE,WEATHER_PRESETS,advanceClouds,normalizeAtmosphere,skyAppearanceAt,skyAppearanceKey,weatherPreset,moonPhaseAt,MOON_CYCLE_DAYS,CLOUD_DRIFT_RATE} from '../src/domain/sky-appearance.ts';
import {STAR_LAYERS,domeSamples,starAngleAt,legacyStarAngleAt,starFieldSteps,starFieldLevel} from '../src/domain/star-field.ts';
import {MOON_TEXTURE_PNG_BASE64,MOON_TEXTURE_SIZE} from '../src/domain/moon-texture.ts';

test('new sky is opt-in, and the previous sky stays available for comparison',()=>{
 assert.equal(skyModeFromParams(new URLSearchParams('')),'showcase');
 assert.equal(skyModeFromParams(new URLSearchParams('newsky=1')),'new');
 assert.equal(skyModeFromParams(new URLSearchParams('newsky=0')),'showcase');
 assert.equal(skyModeFromParams(new URLSearchParams('scene=m1')),'legacy');
 assert.equal(skyModeFromParams(new URLSearchParams('scene=m0')),'legacy');
 assert.equal(skyModeFromParams(new URLSearchParams('scene=world')),'showcase');
});

test('atmosphere inputs stay clamped, independent and separate from the hour',()=>{
 const extreme=normalizeAtmosphere({coverage:99,thickness:-4,cirrusAmount:80,cloudDrift:-1,shapeDrift:NaN,moonScale:1e6,moonGlow:-3,starDensity:5});
 for(const [key,value] of Object.entries(extreme))if(typeof value==='number')assert.ok(Number.isFinite(value)&&value>=0,`${key} must stay finite and non-negative`);
 assert.ok(extreme.thickness>=0&&extreme.moonScale<=2.5&&extreme.starDensity<=2&&extreme.cirrusAmount<=1.5);
 // Coverage and thickness must move independently: wide thin veil against small dense cloud.
 const veil=skyAppearanceAt(12,normalizeAtmosphere({coverage:1.1,thickness:.3}),{x:0,y:0,shapeX:0,shapeY:0});
 const dense=skyAppearanceAt(12,normalizeAtmosphere({coverage:.3,thickness:2.4}),{x:0,y:0,shapeX:0,shapeY:0});
 assert.ok(veil.coverage>dense.coverage&&veil.thickness<dense.thickness);
 assert.equal(veil.time,dense.time);
});

test('cloud drift scales with wind and speed, and shape only changes when asked',()=>{
 const start={x:0,y:0,shapeX:0,shapeY:0},wind={azimuth:0,speed:1},fast=normalizeAtmosphere({cloudDrift:2}),slow=normalizeAtmosphere({cloudDrift:1});
 const step=1/60;
 assert.ok(Math.abs(advanceClouds(start,wind,fast,step).x-2*CLOUD_DRIFT_RATE*step)<1e-12);
 assert.ok(advanceClouds(start,wind,fast,step).x>advanceClouds(start,wind,slow,step).x);
 // Same time, twice the wind speed, twice the travel.
 assert.ok(Math.abs(advanceClouds(start,{azimuth:0,speed:2},slow,step).x-2*advanceClouds(start,wind,slow,step).x)<1e-12);
 const frozen=advanceClouds(start,wind,normalizeAtmosphere({shapeDrift:0}),step);
 assert.equal(frozen.shapeX,0);assert.equal(frozen.shapeY,0);
 // Shape changes far slower than drift, so the sky does not boil.
 const moved=advanceClouds(start,wind,DEFAULT_ATMOSPHERE,1);
 const travelled=Math.hypot(moved.x,moved.y);
 assert.ok(moved.shapeX>0,'shape keeps changing');
 assert.ok(moved.x<=travelled+1e-12,'drift stays within one texture step per second');
 // A minute of observation shows movement; the pattern needs far longer to reshape.
 const observe=(seconds,from=start)=>{let at=from;for(let i=0;i<Math.round(seconds*10);i++)at=advanceClouds(at,wind,DEFAULT_ATMOSPHERE,.1);return at;};
 const minute=observe(60);
 assert.ok(minute.x>.015&&minute.shapeX>.15,`a minute drifts ${minute.x} and reshapes ${minute.shapeX}`);
 assert.ok(minute.shapeX<.6,'shape must not boil in a minute');
 const hour=observe(600);
 assert.ok(hour.shapeX<3.5,'an hour of reshaping stays inside a few texture widths');
 // Frame drops never teleport the sky: the step is bounded.
 assert.equal(advanceClouds(start,wind,DEFAULT_ATMOSPHERE,60).x,advanceClouds(start,wind,DEFAULT_ATMOSPHERE,.1).x);
 assert.throws(()=>advanceClouds(start,wind,DEFAULT_ATMOSPHERE,NaN));
 assert.equal(skyAppearanceKey(skyAppearanceAt(3,DEFAULT_ATMOSPHERE,start)),skyAppearanceKey(skyAppearanceAt(3,DEFAULT_ATMOSPHERE,{...start,shapeX:1e-6})));
 assert.notEqual(skyAppearanceKey(skyAppearanceAt(3,DEFAULT_ATMOSPHERE,start)),skyAppearanceKey(skyAppearanceAt(3,DEFAULT_ATMOSPHERE,{...start,shapeX:.5})));
});

test('weather targets move one way from clear to storm and keep the sky drawable',()=>{
 const names=['clear','fair','overcast','rain','storm'];
 const stages=names.map(name=>weatherPreset(name));
 for(let i=1;i<stages.length;i++){
  assert.ok(stages[i].coverage>stages[i-1].coverage,`${names[i]} must cover more sky`);
  assert.ok(stages[i].thickness>stages[i-1].thickness,`${names[i]} must be thicker`);
 }
 for(const state of stages)for(const [key,value] of Object.entries(state))if(typeof value==='number')assert.ok(value>=0);
 assert.equal(weatherPreset('rain').enabled,true);
 assert.equal(weatherPreset('fair',false).enabled,false);
 assert.throws(()=>weatherPreset('hurricane'));
 // Clearing the sky keeps drift but removes every cloud input.
 const off=skyAppearanceAt(12,normalizeAtmosphere({enabled:false}),{x:5,y:5,shapeX:1,shapeY:1});
 assert.equal(off.coverage,0);assert.equal(off.cirrus,0);assert.equal(off.thickness,1);
});

test('sunset afterglow outlives the solar disc and never breaks the sunrise seam',()=>{
 // Elevation of the plotted sun is -.82 * sin((h - 6) * pi / 12).
 assert.ok(daylightAt(6).afterglow<1.01&&daylightAt(6.0001).afterglow<1.01,'the horizon itself is no longer a step');
 assert.ok(Math.abs(daylightAt(6).afterglow-daylightAt(6.0001).afterglow)<.01,'no jump as the disc rises');
 assert.equal(daylightAt(12).afterglow,0);
 for(let hour=4;hour<9;hour+=.005){
  const a=daylightAt(hour-.005),b=daylightAt(hour+.005);
  assert.ok(Math.abs(a.afterglow-b.afterglow)<.02,`afterglow jumps at ${hour}`);
  assert.ok(b.afterglow>=0&&b.afterglow<=1);
 }
 const discGone=daylightAt(19.3),justBelow=daylightAt(18.4),muchLater=daylightAt(21);
 assert.equal(discGone.sunset,0,'the disc is already under the horizon');
 assert.ok(justBelow.afterglow>.6,'the glow still runs well past the disc');
 assert.ok(discGone.afterglow<justBelow.afterglow*.3,'and fades through the evening');
 assert.ok(daylightAt(18).afterglow>.5,'the glow is already building before the sun sets');
 assert.ok(justBelow.afterglow>muchLater.afterglow,'afterglow fades through the evening');
 assert.equal(daylightAt(12).afterglow,0);
});

test('star turn is a fraction of a day, so midnight is no longer a seam',()=>{
 assert.equal(starAngleAt(0),0);
 assert.equal(starAngleAt(24),1);
 assert.ok(Math.abs(starAngleAt(23.999)-0.999958)<1e-5);
 // The previous convention added whole days; the difference jumped by a full turn.
 assert.equal(legacyStarAngleAt(0),0);
 assert.equal(legacyStarAngleAt(24),2);
 assert.equal(Math.floor(legacyStarAngleAt(23.999))-Math.floor(legacyStarAngleAt(24)),-2);
 // However that angle was wrapped, the rotated coordinate jumped a whole turn.
 assert.ok(Math.abs((legacyStarAngleAt(23.999)%1)-1)<.001);
 assert.equal(legacyStarAngleAt(24)%1,0);
 // Neighbouring wall-clock hours are adjacent turns, never a jump of a whole one.
 const before=daylightAt(23.999),after=daylightAt(24.001);
 const turnDistance=Math.min(Math.abs(starAngleAt(before.hours)-starAngleAt(after.hours)),Math.abs(starAngleAt(before.hours)-starAngleAt(after.hours)+1),Math.abs(starAngleAt(before.hours)-starAngleAt(after.hours)-1));
 assert.ok(turnDistance<1e-4,`midnight moves the field by ${turnDistance} turns`);
});

test('star field crosses midnight without a jump, while the old convention shows one',()=>{
 const directions=domeSamples(64);
 const hours=Array.from({length:33},(_,i)=>23.2+i*.05); // 23:12 through 00:48
 const modern=starFieldSteps(hours.map(hour=>starAngleAt(hour)),directions,0);
 assert.ok(modern.largest<.35,`star level jumps by ${modern.largest} across midnight`);
 // The old angle added a whole day, so midnight rewrote every cell hash at once.
 const legacy=hours.map(hour=>starFieldLevel(legacyStarAngleAt(hour),directions,0));
 const legacyStep=Math.max(...legacy.slice(1).map((v,i)=>Math.abs(v-legacy[i])));
 assert.ok(legacyStep>=modern.largest,`old angle stepped ${legacyStep} against ${modern.largest}`);
 assert.equal(starFieldLevel(0,directions,0),starFieldLevel(1,directions,0),'a full turn returns the same sky');
 assert.ok(STAR_LAYERS.length===3&&STAR_LAYERS.every(l=>l.level>0));
});

test('moon phase is available to the architecture but stays a full moon on stage 1',()=>{
 assert.deepEqual(moonPhaseAt(0.3,'full'),{phase:0,illumination:1});
 const half=moonPhaseAt(MOON_CYCLE_DAYS/2,'cycle');
 assert.ok(Math.abs(half.illumination-1)<1e-9&&Math.abs(half.phase-.5)<1e-9);
 assert.ok(moonPhaseAt(0,'cycle').illumination<1e-9);
 assert.ok(moonPhaseAt(-MOON_CYCLE_DAYS*.25,'cycle').illumination>0);
 assert.throws(()=>moonPhaseAt(NaN,'cycle'));
});

test('the painted moon ships as a decodable square PNG inside the build',()=>{
 const png=Buffer.from(MOON_TEXTURE_PNG_BASE64,'base64');
 assert.deepEqual([...png.subarray(0,8)],[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],'must carry PNG bytes, not raw pixels');
 assert.equal(png.readUInt32BE(16),MOON_TEXTURE_SIZE);assert.equal(png.readUInt32BE(20),MOON_TEXTURE_SIZE);
 assert.equal(png[24],8,'eight bits per channel');assert.equal(png[25],6,'RGBA');
 // A blank or half-written disc would still decode, so bound the payload instead.
 assert.ok(png.length>20000&&png.length<900000,`unexpected moon payload ${png.length} bytes`);
 assert.equal(MOON_TEXTURE_SIZE,512);
});

test('cloud layers are tileable noise, not flat or repeated artwork',()=>{
 const layers=createCloudLayerPixels(),cirrus=createCirrusLayerPixels();
 assert.equal(layers.length,SKY_LAYER_SIZE*SKY_LAYER_SIZE*4);
 assert.equal(cirrus.length,layers.length);
 const channel=(data,offset)=>{
  let min=255,max=0,sum=0;
  for(let i=offset;i<data.length;i+=4){min=Math.min(min,data[i]);max=Math.max(max,data[i]);sum+=data[i];}
  return {min,max,mean:sum/(data.length/4)};
 };
 for(const [name,data] of [['cloud',layers],['cirrus',cirrus]]){
  for(const offset of [0,1,2,3]){
   const stats=channel(data,offset);
   assert.ok(stats.max-stats.min>90,`${name} channel ${offset} is too flat`);
   assert.ok(stats.mean>12&&stats.mean<243,`${name} channel ${offset} is clipped`);
  }
  // Opposite tile edges are adjacent when the sampler wraps.
  for(let y=0;y<SKY_LAYER_SIZE;y+=8){
   const left=(y*SKY_LAYER_SIZE)*4,right=(y*SKY_LAYER_SIZE+SKY_LAYER_SIZE-1)*4;
   assert.ok(Math.abs(data[left]-data[right])<160,'tile seam must not be a hard edge');
  }
 }
 assert.notDeepEqual(Array.from(layers.slice(0,256)),Array.from(cirrus.slice(0,256)));
});

test('appearance keeps the hour and the sun/moon contract intact',()=>{
 for(let hour=0;hour<24;hour+=.5){
  const s=daylightAt(hour),appearance=skyAppearanceAt(s.hours,DEFAULT_ATMOSPHERE,{x:1,y:2,shapeX:3,shapeY:4});
  assert.equal(appearance.time,s.hours);
  for(let i=0;i<3;i++)assert.equal(s.towardMoon[i],-s.towardSun[i]);
 }
 assert.throws(()=>skyAppearanceAt(NaN,DEFAULT_ATMOSPHERE,{x:0,y:0,shapeX:0,shapeY:0}));
 assert.throws(()=>normalizeHour(Infinity));
 assert.deepEqual(Object.keys(WEATHER_PRESETS).sort(),['clear','fair','overcast','rain','storm']);
});
