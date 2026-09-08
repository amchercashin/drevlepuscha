import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toRender, fromRender, tileFor, normalizeAzimuth, shortestAngleDelta, cameraOffset } from '../src/domain/coordinates.ts';
import { hashString, seedFor, createRandom, scatterCandidate } from '../src/domain/seed.ts';
import { canEnterTravel } from '../src/domain/coverage.ts';
import { decodeSave } from '../src/domain/save.ts';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const fixture=()=>JSON.parse(readFileSync(new URL('../content/sandbox/save.example.json',import.meta.url),'utf8'));

test('coordinate round-trip at large offset',()=>{
 const p={e:2000123.5,n:-3456789.25,h:1520.125},o={e:2000000,n:-3456000,h:1500};
 assert.deepEqual(fromRender(toRender(p,o),o),p);
});
test('north becomes negative render Z',()=>assert.deepEqual(toRender({e:5,n:8,h:3},{e:0,n:0,h:0}),{x:5,y:3,z:-8}));
test('coordinates reject nonfinite input',()=>assert.throws(()=>toRender({e:NaN,n:0,h:0},{e:0,n:0,h:0}),RangeError));
test('tile ownership uses floor for negative coordinates',()=>assert.deepEqual(tileFor(-1,-129),{e:-1,n:-2}));
test('exact tile boundary belongs to next tile',()=>assert.deepEqual(tileFor(128,256),{e:1,n:2}));
test('negative exact boundary remains correct',()=>assert.deepEqual(tileFor(-128,-256),{e:-1,n:-2}));
test('invalid tile size rejected',()=>assert.throws(()=>tileFor(1,2,0),RangeError));
test('azimuth normalization',()=>{assert.equal(normalizeAzimuth(-45),315);assert.equal(normalizeAzimuth(720),0);});
test('shortest turn crosses wrap in both directions',()=>{assert.equal(shortestAngleDelta(359,1),2);assert.equal(shortestAngleDelta(1,359),-2);});
test('camera compass directions',()=>{const n=cameraOffset(0,0,10),e=cameraOffset(90,0,10);close(n.x,0);close(n.z,-10);close(e.x,10);close(e.z,0);});
test('camera elevation has correct radius',()=>{const p=cameraOffset(225,45,180);close(Math.hypot(p.x,p.y,p.z),180);assert.ok(p.y>0);});
test('camera rejects radius and tilt outside contract',()=>{assert.throws(()=>cameraOffset(0,95,10));assert.throws(()=>cameraOffset(0,45,0));});
test('FNV-1a golden vectors',()=>{assert.equal(hashString(''),2166136261);assert.equal(hashString('hello'),1335831723);});
test('UTF-8 golden vector',()=>assert.equal(hashString('река'),2873230649));
test('seed keys avoid delimiter ambiguity',()=>assert.notEqual(seedFor('a|b','c'),seedFor('a','b|c')));
test('seed input rejected when unstable/nonfinite',()=>{assert.throws(()=>seedFor());assert.throws(()=>seedFor(Infinity));});
test('same random seed gives same stream',()=>{const a=createRandom(42),b=createRandom(42);for(let i=0;i<100;i++)assert.equal(a(),b());});
test('random outputs remain in [0,1)',()=>{const r=createRandom(0);for(let i=0;i<10000;i++){const v=r();assert.ok(v>=0&&v<1);}});
test('bad uint32 seed rejected',()=>{assert.throws(()=>createRandom(-1));assert.throws(()=>createRandom(1.5));});
test('scatter does not depend on request order',()=>{const a=[[-2,0],[0,0],[8,9]];const run=list=>Object.fromEntries(list.map(([e,n])=>[`${e},${n}`,scatterCandidate('seed','tree',e,n,16)]));assert.deepEqual(run(a),run([...a].reverse()));});
test('candidate belongs to its global scatter cell',()=>{for(let e=-5;e<5;e++){const p=scatterCandidate('s','tree',e,-3,16);assert.deepEqual(tileFor(p.e,p.n,16),{e,n:-3});}});
test('scatter layers do not share stream',()=>assert.notDeepEqual(scatterCandidate('s','tree',0,0,16),scatterCandidate('s','rock',0,0,16)));
test('coverage prevents entering unimplemented world',()=>{for(const c of ['unmapped','atlas','terrain'])assert.equal(canEnterTravel(c),false);assert.equal(canEnterTravel('playable'),true);assert.equal(canEnterTravel('reviewed'),true);});
test('valid save parses',()=>assert.equal(decodeSave(JSON.stringify(fixture())).status,'ok'));
test('invalid JSON does not throw or erase data',()=>assert.equal(decodeSave('{oops').status,'invalid'));
test('save mismatched generator is explicit, not auto-migrated',()=>{const f=fixture();const result=decodeSave(JSON.stringify(f),{worldId:f.worldId,contentRevision:f.contentRevision,generatorVersion:'next',worldSeed:f.worldSeed});assert.equal(result.status,'incompatible');assert.deepEqual(result.save,f);});
test('save rejects unknown schema',()=>{const f=fixture();f.schemaVersion=999;assert.equal(decodeSave(JSON.stringify(f)).status,'invalid');});
test('save rejects duplicated discovery',()=>{const f=fixture();f.discoveredIds.push(f.discoveredIds[0]);assert.equal(decodeSave(JSON.stringify(f)).status,'invalid');});
test('save rejects nonnumeric world position',()=>{const f=fixture();f.position.e='12';assert.equal(decodeSave(JSON.stringify(f)).status,'invalid');});
test('save rejects unexpected keys',()=>{const f=fixture();f.hiddenScale=0.01;assert.equal(decodeSave(JSON.stringify(f)).status,'invalid');});
test('save camera bearing must be normalized',()=>{const f=fixture();f.camera.yawDeg=360;assert.equal(decodeSave(JSON.stringify(f)).status,'invalid');});

test('save mode cannot coerce an array to a valid string',()=>{const f=fixture();f.camera.mode=['travel-third-person'];assert.equal(decodeSave(JSON.stringify(f)).status,'invalid');});

test('v1 saves fail explicitly without inventing distance',()=>{
 const f=fixture();f.schemaVersion=1;
 const result=decodeSave(JSON.stringify(f));assert.equal(result.status,'invalid');
 assert.ok(result.errors.some(error=>error.includes('Legacy')&&error.includes('No automatic migration')));
});
test('v2 saves retain upward pitch and camera distance in both modes',()=>{
 for(const mode of ['travel-third-person','atlas']) {
  const f=fixture();f.camera={mode,yawDeg:180,pitchDeg:-20,distanceM:4.5};
  const result=decodeSave(JSON.stringify(f));assert.equal(result.status,'ok');assert.deepEqual(result.save,f);
 }
});
test('v2 camera rejects missing or nonpositive distance and invalid pitch',()=>{
 for(const value of [undefined,0,-1,'5']) {const f=fixture();f.camera.distanceM=value;assert.equal(decodeSave(JSON.stringify(f)).status,'invalid');}
 for(const value of [-91,91,'12']) {const f=fixture();f.camera.pitchDeg=value;assert.equal(decodeSave(JSON.stringify(f)).status,'invalid');}
});
test('camera orbit offset supports looking up',()=>{const p=cameraOffset(0,-20,4.5);assert.ok(p.y<0);close(Math.hypot(p.x,p.y,p.z),4.5);assert.throws(()=>cameraOffset(0,-91,4.5));});
test('versioned PRNG golden stream',()=>{
 const r=createRandom(42);assert.deepEqual(Array.from({length:5},()=>r()),[0.6011037519201636,0.44829055899754167,0.8524657934904099,0.6697340414393693,0.17481389874592423]);
 assert.equal(seedFor('a|b','c'),3700923481);
 assert.deepEqual(scatterCandidate('seed','tree',-2,0,16),{e:-16.148313391953707,n:13.50329902023077,id:'["tree",-2,0,0]'});
});
