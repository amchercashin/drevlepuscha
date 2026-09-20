import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RegionSession,alongRoute,createEncounter} from '../src/domain/regions/session.ts';
import {createBrandywineGeography,regionGeography} from '../src/domain/regions/brandywine.mjs';
import {regionalHabitat} from '../src/domain/regions/habitat.mjs';
import {validatePackage} from '../src/domain/wildlife/habitat.ts';
import {regionSight} from '../src/domain/regions/sight.ts';
const source=JSON.parse(readFileSync(new URL('../content/regions/brandywine-bridge/region-source.json',import.meta.url))),geo=createBrandywineGeography(regionGeography(source));
const make=()=>new RegionSession(geo,'test-version');
test('hidden landings require nearby visibility and remain discovered after reload',()=>{
 const s=make();s.discover(()=>true);assert.ok(!s.state.knownPlaces.includes('lower-boat'));assert.ok(!s.state.knownPlaces.includes('RANGER_SHELTER'));
 Object.assign(s.state.player,s.dock('lower-boat',0,'normal').shore);s.discover(()=>false);assert.ok(!s.state.knownPlaces.includes('lower-boat'));
 s.discover(()=>true);assert.ok(s.state.knownPlaces.includes('lower-boat'));assert.ok(!s.state.knownPlaces.includes('upper-boat'));
 const copy=make();copy.restore(s.snapshot());assert.deepEqual(copy.state.knownPlaces,s.state.knownPlaces);
});
test('both boats cross manually, disembark, survive save/reload, and cannot be summoned from the other bank',()=>{
 for(const [id,startSide]of [['lower-boat',0],['upper-boat',1]]){
  const session=make(),p=session.state.player,a=session.dock(id,startSide,'normal'),b=session.dock(id,1-startSide,'normal');Object.assign(p,a.shore,{height:geo.height(a.shore.e,a.shore.n)});
  assert.ok(session.board(id),id+' board');assert.equal(session.board(id),false,'one occupant');
  for(let i=0;i<4000;i++){const dx=b.boat.e-p.e,dn=b.boat.n-p.n,len=Math.hypot(dx,dn);if(len<.2)break;session.row(dx/len*.1,dn/len*.1,()=>true,()=>false);}
  assert.ok(Math.hypot(p.e-b.boat.e,p.n-b.boat.n)<3,id+' reaches opposite bank '+JSON.stringify(p));
  assert.ok(session.disembark(()=>true,()=>false),id+' disembarks');
  const position={...session.state.boats.find(b=>b.id===id)},copy=make();copy.restore(JSON.parse(JSON.stringify(session.snapshot())));assert.deepEqual(copy.state.boats.find(b=>b.id===id),position);
  Object.assign(copy.state.player,a.shore);assert.equal(copy.board(id),false,'no duplicated boat on departure bank');assert.equal(copy.state.boats.length,2);
 }
});
test('boat collision substeps prevent tunnelling and reject offshore disembarkation',()=>{
 const s=make(),b=s.state.boats[0];Object.assign(s.state.player,s.dock(b.id,0,'normal').shore);assert.ok(s.board(b.id));
 const before=b.e;s.row(150,0,()=>true,e=>e>before+5);assert.ok(b.e<before+5);assert.equal(s.disembark(()=>false,()=>false),false);
});
test('water presets alter physical shoreline and ford; no switch strands the player',()=>{
 assert.ok(geo.waterAt(-1300,1600,'normal').depth<.35);assert.ok(geo.waterAt(-1300,1600,'high').depth>.35);
 let flooded=0;for(let e=30;e<120;e+=.5)if(!geo.waterAt(e,-600,'normal')&&geo.waterAt(e,-600,'high'))flooded++;assert.ok(flooded>0);
 const s=make();assert.ok(s.setWater('low'));assert.ok(s.setWater('high'));Object.assign(s.state.player,{e:-1300,n:1600,supportId:'terrain'});assert.equal(s.setWater('high'),false);
});
test('gate cannot close on occupant; new session retains its state',()=>{
 const s=make();Object.assign(s.state.player,{e:550,n:-170});assert.ok(s.toggleGate());assert.equal(s.state.gateOpen,false);assert.ok(s.toggleGate());Object.assign(s.state.player,{e:550,n:-180});assert.equal(s.toggleGate(),false);
});
test('encounter has reproducible truth, real route clues, persistent noncombat outcome',()=>{
 for(let seed=0;seed<3;seed++){const s=structuredClone(source);s.worldSeed=seed;assert.deepEqual(createEncounter(s),createEncounter(s));}
 const session=make();assert.ok(session.clue('testimony'));const tracks=alongRoute(session.state.encounter.route,30);Object.assign(session.state.player,tracks);assert.ok(session.clue('tracks'));
 const before=session.actor();for(let i=0;i<100;i++)session.tick(.05);assert.ok(Math.hypot(session.actor().e-before.e,session.actor().n-before.n)>4);
 Object.assign(session.state.player,session.actor());assert.ok(session.resolve('help'));const copy=make();copy.restore(session.snapshot());assert.equal(copy.state.encounter.phase,'resolved');assert.deepEqual(copy.state.encounter.clues,['testimony','tracks']);assert.ok(copy.state.encounter.outcome);const d=copy.state.encounter.distanceM;copy.tick(60);assert.equal(copy.state.encounter.distanceM,d);
 const corrupt=session.snapshot();corrupt.boats[1].id=corrupt.boats[0].id;assert.throws(()=>copy.restore(corrupt));assert.throws(()=>copy.restore({...session.snapshot(),contentVersion:'other'}));
});
test('regional habitat satisfies the shared fauna contract and budgets',()=>{
 const hash='a'.repeat(64),cells=regionalHabitat(geo,hash),limits=JSON.parse(readFileSync('config/wildlife/budgets.json')),bird=JSON.parse(readFileSync('config/wildlife/species.json'))['woodland-bird'];
 validatePackage({identity:{realmId:'brandywine-bridge',contentHash:hash,behaviorVersion:1},cells,limits,bird});assert.ok(cells.length<=216);assert.deepEqual(new Set(cells.flatMap(c=>c.sites.map(s=>s.species))),new Set(['woodland-bird','roe-deer','red-squirrel']));
});
test('bridge sees its approach but does not control both boat landings; shelter is hidden by the hill',()=>{
 const point=id=>{const p=source.pois.find(p=>p.id===id).point;return {e:p[0],n:p[1],h:(id==='BRIDGE'?6:geo.height(...p))+1.65};};
 assert.ok(regionSight(point('BRIDGE'),point('INN'),geo.height).visible);
 assert.equal(regionSight(point('BRIDGE'),point('FISHING_LANDING_W'),geo.height).visible,false);
 assert.equal(regionSight({e:1100,n:350,h:geo.height(1100,350)+1.65},point('RANGER_SHELTER'),geo.height).visible,false);
});
test('traveller steers around a local obstruction without teleporting or changing its route',()=>{
 const s=make(),start=s.actor(),ahead=s.routePosition(68,0),route=structuredClone(s.state.encounter.route);let last=start,maxStep=0;
 for(let i=0;i<500;i++){s.tick(.05,(e,n)=>Math.hypot(e-ahead.e,n-ahead.n)<.65);const p=s.actor();maxStep=Math.max(maxStep,Math.hypot(p.e-last.e,p.n-last.n));last=p;}
 assert.ok(s.state.encounter.distanceM>75);assert.ok(maxStep<.11);assert.deepEqual(s.state.encounter.route,route);
});
