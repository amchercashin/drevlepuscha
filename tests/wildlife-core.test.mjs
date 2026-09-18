import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WildlifeWorld} from '../src/domain/wildlife/world.ts';
import {cellId} from '../src/domain/wildlife/ids.ts';
import {localXYZ} from '../src/domain/wildlife/routes.ts';
const data=JSON.parse(readFileSync('public/wildlife/content/showcase/bird.json','utf8'));
const site=data.cells[0].sites[0],env={totalGameHours:12,daylight01:1,precipitation01:0};
const observer=(id,e,n)=>({id,e,n,h:site.home.h-1.5,headingDeg:0,speedMps:1.85,running:true,observedAtMs:0});
const make=()=>new WildlifeWorld({content:data.identity,authorityEpoch:'test-epoch',seed:'test',cells:new Map(data.cells.map(c=>[c.id,c])),limits:data.limits,bird:data.bird});
const far=observer('first',site.home.e+50,site.home.n),near=observer('second',site.home.e+2,site.home.n);
test('30/60/120 FPS delivery has the same bird identity, reaction to second player, route and position',()=>{
 const results=[];
 for(const fps of [30,60,120]){const world=make();world.advance({simMs:0,observers:[far],environment:env});for(let i=1;i<=fps*4;i++)world.advance({simMs:i*1000/fps,observers:[far,near],environment:env});results.push(world.snapshot());assert.equal(results.at(-1).entities[0].state,'flying');}
 assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);
});
test('snapshot is detached and has no decisions/RNG/time side effects; sleep is bounded and silent',()=>{
 const w=make();w.advance({simMs:0,observers:[far],environment:env});const a=w.snapshot(),stats=w.stats();assert.deepEqual(a,w.snapshot());assert.deepEqual(stats,w.stats());a.entities[0].point.e=999;assert.notEqual(w.snapshot().entities[0].point.e,999);
 w.advance({simMs:60000,observers:[near],environment:env});assert.ok(w.stats().decisionSteps-stats.decisionSteps<=2);assert.equal(w.stats().clockReconciliations,1);assert.equal(w.snapshot().recentEvents.length,0);
});
test('unsafe exits leave the bird alert; it cannot cross a blocking second observer',()=>{
 const w=make();w.advance({simMs:0,observers:[far],environment:env});const blockers=data.cells[0].routes.map((r,i)=>{const p=r.samples.find(s=>s.distanceM>=1).point;return {...observer('block-'+i,p.e,p.n),h:p.h-1};});
 for(let t=200;t<=2000;t+=200)w.advance({simMs:t,observers:[near,...blockers],environment:env});assert.equal(w.snapshot().entities[0].state,'alert');assert.equal(w.snapshot().eventWatermark,0);
});
test('stable negative cells, origin-independent poses and pinning until all observers leave',()=>{
 assert.equal(cellId(-.1,-64.1),'-1:-2');const w=make();w.advance({simMs:0,observers:[far],environment:env});const a=w.snapshot();assert.equal(w.leaveCell(data.cells[0].id),false);
 const p=a.entities[0].point;const b=localXYZ(p,{e:1024,n:-2048});assert.ok(Math.abs(b.x+1024-p.e)<1e-9);assert.ok(Math.abs(-2048-b.z-p.n)<1e-9);assert.deepEqual(a,w.snapshot());
 for(let t=200;t<=11000;t+=200)w.advance({simMs:t,observers:[],environment:env});assert.equal(w.stats().residentCells,0);assert.equal(w.stats().activeEntities,0);
});

test('six observers and oversubscribed test sites respect entity, event and sight budgets',()=>{
 const cell=structuredClone(data.cells[0]);cell.sites=[];cell.routes=[];
 for(let i=0;i<28;i++){
  const s=structuredClone(site);s.id=`quota-${i}`;s.allowedRoutes=data.cells[0].routes.map(r=>`${r.id}-${i}`);cell.sites.push(s);
  cell.routes.push(...data.cells[0].routes.map(r=>({...structuredClone(r),id:`${r.id}-${i}`,from:s.id})));
 }
 const world=new WildlifeWorld({content:data.identity,authorityEpoch:'quota-test',seed:'quota',cells:new Map([[cell.id,cell]]),limits:data.limits,bird:data.bird});
 const observers=Array.from({length:6},(_,i)=>({...far,id:`player-${i}`,e:far.e+i}));
 world.advance({simMs:0,observers,environment:env});assert.equal(world.stats().activeEntities,24);
 const before=world.stats();world.advance({simMs:200,observers:observers.map(o=>({...near,id:o.id})),environment:env});
 assert.ok(world.stats().visibilityTests-before.visibilityTests<=data.limits.maxVisibilityTestsPerStep);
 for(let t=400;t<=2000;t+=200)world.advance({simMs:t,observers:observers.map(o=>({...near,id:o.id})),environment:env});
 const frame=world.snapshot();assert.equal(frame.entities.length,24);assert.equal(new Set(frame.entities.map(e=>e.id)).size,24);assert.ok(frame.recentEvents.length<=32);
 world.dispose();assert.equal(world.stats().activeEntities,0);assert.equal(world.stats().residentCells,0);
});
