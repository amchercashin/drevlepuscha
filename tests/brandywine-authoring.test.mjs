import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSource, storageInfo, polygonArea, previewWater, previewHeight, findRoute, lineLength, nearestStation, bankProfile } from '../tools/regions/authoring-core.mjs';
import { sampleLine, terrainReview } from '../tools/regions/terrain-review.mjs';
const source = JSON.parse(readFileSync(new URL('../content/regions/brandywine-bridge/region-source.json', import.meta.url), 'utf8'));
test('source IDs, geometry, graph crossings and confluence are consistent', () => {
  const report = validateSource(source); assert.deepEqual(report.errors, []);
});
test('16 km² play area stays distinct from 72 storage tiles', () => {
  const b = source.playBounds, s = storageInfo(source);
  assert.equal((b.maxE - b.minE) * (b.maxN - b.minN), 16_000_000);
  assert.equal(s.count, 72); assert.equal(s.columns, 9); assert.equal(s.rows, 8);
  assert.deepEqual(s.bounds, { minE: -2048, maxE: 2560, minN: -1536, maxN: 2560 });
});
test('east wood and west grove retain design-sized footprints', () => {
  assert.ok(Math.abs(polygonArea(source.forests[0].polygon) / 1e6 - 1.11455) < 1e-8);
  assert.ok(Math.abs(polygonArea(source.forests[1].polygon) / 1e6 - .2714) < 1e-8);
});
test('main river channel is not walkable, bridge is not part of terrain height', () => {
  for (const [e, n] of source.rivers[0].stations) for (const state of ['low', 'normal', 'high']) assert.ok(previewWater(source, e, n, state).depth > 2);
  assert.ok(previewHeight(source, 0, 0) < 0);
});
test('tributary ford depths reflect independent water presets', () => {
  assert.ok(Math.abs(previewWater(source, -1300, 1600, 'normal').depth - .2) < 1e-8);
  assert.ok(Math.abs(previewWater(source, -1300, 1600, 'high').depth - .7) < 1e-8);
});
test('without main bridge and boats, no west/east river crossing exists', () => {
  assert.equal(findRoute(source, 'INN', 'ROAD_LOOKOUT', { boats: false, bridgeOpen: false }), null);
  const route = findRoute(source, 'INN', 'ROAD_LOOKOUT', { boats: false });
  assert.ok(route.edges.includes('main-bridge'));
});
test('wagon uses roads and bridge, never boats or tributary footbridge', () => {
  const r = findRoute(source, 'ROAD_W', 'BUCKLAND_EXIT', { profile: 'wagon' });
  assert.ok(r); assert.ok(r.edges.includes('main-bridge')); assert.ok(r.edges.includes('north-gate'));
  assert.equal(findRoute(source, 'ROAD_W', 'BUCKLAND_EXIT', { profile: 'wagon', bridgeOpen: false }), null);
  assert.equal(findRoute(source, 'ROAD_W', 'FOOTBRIDGE_N', { profile: 'wagon' }), null);
});
test('high water disables ford without disabling footbridge', () => {
  const a = findRoute(source, 'FORD_S', 'FORD_N', { boats: false, water: 'normal' });
  const b = findRoute(source, 'FORD_S', 'FORD_N', { boats: false, water: 'high' });
  assert.deepEqual(a.edges, ['tributary-ford']); assert.ok(b.edges.includes('tributary-footbridge')); assert.ok(!b.edges.includes('tributary-ford'));
});
test('lower boat starts on west: no impossible boarding from east', () => {
  const opts = { bridgeOpen: false, gateOpen: false, boatSides: { 'fishing-boat-01': 0, 'upper-boat-01': -1 } };
  assert.equal(findRoute(source, 'FISHING_LANDING_E', 'FISHING_LANDING_W', opts), null);
  const r = findRoute(source, 'FISHING_LANDING_W', 'FISHING_LANDING_E', opts);
  assert.deepEqual(r.edges, ['lower-boat']); assert.equal(r.finalBoatSides['fishing-boat-01'], 1);
  const back = findRoute(source, 'FISHING_LANDING_E', 'FISHING_LANDING_W', { ...opts, boatSides: r.finalBoatSides });
  assert.deepEqual(back.edges, ['lower-boat']);
});
test('every authored node is reachable in normal conditions by a ranger', () => {
  for (const n of source.topology.nodes) assert.ok(findRoute(source, 'INN', n.id), n.id);
});
test('route length and timing derived from geometry, deterministic on repeated calls', () => {
  const a = findRoute(source, 'INN', 'RANGER_SHELTER', { boats: false });
  const b = findRoute(source, 'INN', 'RANGER_SHELTER', { boats: false });
  assert.deepEqual(a, b);
  const m = new Map(source.topology.edges.map(e => [e.id, e]));
  assert.ok(Math.abs(a.length - a.edges.reduce((sum, id) => sum + lineLength(m.get(id).points), 0)) < 1e-8);
  assert.ok(Math.abs(a.seconds - a.length / 1.6) < 1e-8);
});
test('validator rejects accidental river bypass', () => {
  const g = structuredClone(source);
  g.topology.edges.push({ id: 'bad-crossing', from: 'BRIDGE_W', to: 'BRIDGE_E', kind: 'path', points: [[-80,-16],[80,19.2]], profiles: ['ranger'], bidirectional: true });
  assert.ok(validateSource(g).errors.some(e => e.includes('bad-crossing')));
});
test('refinement preserves the deep channel at every 4m sample, including low water', () => {
  const river=source.rivers.find(r=>r.id==='brandywine');
  for(const {point} of sampleLine(river.stations.map(p=>p.slice(0,2)),4)) {
    assert.equal(previewHeight(source,...point),previewHeight(source,...point,false));
    assert.ok(previewWater(source,...point,'low').depth>2);
  }
});
test('landing refinements lower dry approaches and give gentle bank profiles', () => {
  const river=source.rivers.find(r=>r.id==='brandywine');
  for(const p of source.pois.filter(p=>p.id.includes('LANDING'))) {
    const q=nearestStation(...p.point,river.stations),bank=bankProfile(source,river,q,...p.point);
    const height=previewHeight(source,...p.point);
    assert.ok(height>q.level+.5,p.id); // dry anchor even with +0.5m high-water preset
    assert.ok(height<previewHeight(source,...p.point,false)-.5,p.id);
    assert.ok(1.5*bank.heightM/bank.widthM<.08,p.id); // analytic maximum slope of smooth bank profile
  }
});
test('candidate creates a lower saddle between the lookout and ridge',()=>{
  const h=previewHeight(source,1230,825);
  const withoutSaddle=structuredClone(source);
  withoutSaddle.terrainRefinement.forms=withoutSaddle.terrainRefinement.forms.filter(f=>f.id!=='east-saddle');
  assert.ok(h<previewHeight(withoutSaddle,1230,825)-5);
  assert.ok(h<previewHeight(source,950,450));
  assert.ok(h<previewHeight(source,1450,1250));
});
test('bank crests rise and fall along both rivers and tributary sits between hills',()=>{
  for(const river of source.rivers){
    const heights=[];
    for(const {point} of sampleLine(river.stations.map(p=>p.slice(0,2)),24)){
      const q=nearestStation(...point,river.stations);
      heights.push(bankProfile(source,river,q,point[0]+50,point[1]).heightM);
    }
    assert.ok(Math.max(...heights)-Math.min(...heights)>.8,river.id);
    assert.ok(heights.some((h,i)=>i&&h>heights[i-1]+.01));
    assert.ok(heights.some((h,i)=>i&&h<heights[i-1]-.01));
  }
  const bed=previewHeight(source,-1000,1450);
  assert.ok(previewHeight(source,-1000,1930)>bed+8);
  assert.ok(previewHeight(source,-900,1150)>bed+6);
});
test('terrain review exposes ungraded bridge steps rather than calling them walkable',()=>{
  const review=terrainReview(source);
  assert.ok(review.bridges.find(b=>b.id==='main-bridge').approaches.every(p=>p.ungradedDeckDifferenceM>3));
  assert.ok(review.routes.every(r=>Number.isFinite(r.maxGradePercent)));
});
test('invalid units, heights, bank geometry and edge endpoints are rejected',()=>{
  for(const mutate of [s=>s.coordinateSystem.kind='degrees',s=>s.landforms[0].radiusM[0]=0,s=>s.rivers[0].stations[0][2]=NaN,s=>s.terrainRefinement.bankProfiles[0].widthM=0,s=>s.topology.edges[0].points=[]]) {
    const s=structuredClone(source);mutate(s);assert.equal(validateSource(s).ok,false);
  }
});
test('collinear walking along a river axis is not an undetected bypass',()=>{
  const s=structuredClone(source),[a,b]=s.rivers[0].stations;
  s.topology.nodes.push({id:'bad-a',point:a.slice(0,2)},{id:'bad-b',point:b.slice(0,2)});
  s.topology.edges.push({id:'bad-collinear',from:'bad-a',to:'bad-b',kind:'path',profiles:['ranger'],bidirectional:true,points:[a.slice(0,2),b.slice(0,2)]});
  assert.ok(validateSource(s).errors.some(e=>e.includes('Unauthorized water crossing bad-collinear')));
});
