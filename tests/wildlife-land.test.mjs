import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {WildlifeWorld} from '../src/domain/wildlife/world.ts';import {routeMotion,sampleRoute,distance} from '../src/domain/wildlife/routes.ts';import {frameValidator} from '../src/network/wildlife-protocol.ts';
const data=JSON.parse(readFileSync('public/wildlife/content/showcase/bird.json')),env={totalGameHours:12,daylight01:1,precipitation01:0};
const cell=data.cells.find(c=>c.sites.some(s=>s.species==='red-squirrel')),site=cell.sites.find(s=>s.species==='red-squirrel'),route=cell.routes.find(r=>r.from===site.id);
const observer=(e,n)=>({id:'visitor',e,n,h:site.home.h,headingDeg:0,speedMps:0,running:true,observedAtMs:0});
const world=()=>new WildlifeWorld({content:data.identity,authorityEpoch:'land-test',seed:'land',cells:new Map([[cell.id,cell]]),limits:data.limits,bird:data.bird});
test('squirrel shares one continuous metric route through ground, mounting and climb',()=>{
 const w=world(),far=observer(site.home.e+35,site.home.n),near=observer(site.home.e+3,site.home.n-2),states=new Set();w.advance({simMs:0,observers:[far],environment:env});
 for(let t=200;t<25000;t+=200){w.advance({simMs:t,observers:[near],environment:env});const snapshot=w.snapshot(),animal=snapshot.entities.find(e=>e.species==='red-squirrel');assert.ok(frameValidator(data)(snapshot));states.add(animal.state);}
 for(const state of ['alert','ground-bound','mount','climb','trunk-idle'])assert.ok(states.has(state),state+' missing '+[...states]);
 for(const key of route.motion.slice(1)){const a=routeMotion(route,key.atMs-.01),b=routeMotion(route,key.atMs+.01);assert.ok(distance(sampleRoute(route,a.distanceM).point,sampleRoute(route,b.distanceM).point)<.001);}
});
test('climbing interpolates finite unit normals without scaling the animal with its tree',()=>{
 for(let t=0;t<=route.motion.at(-1).atMs;t+=33){const sample=sampleRoute(route,routeMotion(route,t).distanceM);assert.ok(Math.abs(Math.hypot(...sample.normal)-1)<1e-6);assert.ok(Object.values(sample.point).every(Number.isFinite));}
});
const deerCell=data.cells.find(c=>c.sites.some(s=>s.species==='roe-deer')),deerSite=deerCell.sites.find(s=>s.species==='roe-deer');
function deerWorld(){return new WildlifeWorld({content:data.identity,authorityEpoch:'deer-test',seed:'deer',cells:new Map([[deerCell.id,deerCell]]),limits:data.limits,bird:data.bird});}
const visitor=(id,e,n)=>({id,e,n,h:deerSite.home.h,headingDeg:0,speedMps:0,running:true,observedAtMs:0});
test('deer selects among three exits using every observer; all blocked keeps it alert',()=>{
 assert.equal(new Set(deerCell.routes.map(r=>r.to)).size,3);
 const near=visitor('near',deerSite.home.e+4,deerSite.home.n),far=visitor('far',deerSite.home.e+45,deerSite.home.n);
 const blocked=deerCell.routes.filter(r=>r.motion[0].state==='flee').map((r,i)=>{const p=sampleRoute(r,3).point;return {...visitor('block-'+i,p.e,p.n),h:p.h-1};});
 for(const count of [1,3]){const w=deerWorld();w.advance({simMs:0,observers:[far],environment:env});for(let t=200;t<=2400;t+=200)w.advance({simMs:t,observers:[near,...blocked.slice(0,count)],environment:env});const p=w.snapshot().entities[0];if(count===3){assert.equal(p.state,'alert');assert.equal(p.route,null);}else{assert.equal(p.state,'flee');assert.notEqual(p.route.routeId,deerCell.routes.find(r=>r.motion[0].state==='flee').id);}}
});
test('a new observer ahead pauses a moving deer; clearing the route resumes without teleporting',()=>{
 let w=deerWorld();const r=deerCell.routes.find(r=>r.motion[0].state==='walk-away'),home=deerSite.home;
 w.advance({simMs:0,observers:[visitor('far',home.e+45,home.n)],environment:env});let initial=w.snapshot();initial.simMs=2000;initial.entities[0]={...initial.entities[0],state:'walk-away',stateSinceMs:0,route:{cellId:deerCell.id,routeId:r.id},routeStartMs:0,routeStartDistanceM:0,speedMps:.55,point:sampleRoute(r,1.1).point};w=deerWorld();w.restoreVisible(initial);
 const b=sampleRoute(r,2.3).point,blocker={...visitor('ahead',b.e,b.n),h:b.h-.5};w.advance({simMs:2200,observers:[blocker],environment:env});const stopped=w.snapshot().entities[0];assert.equal(stopped.state,'alert');
 w.advance({simMs:2400,observers:[blocker],environment:env});assert.deepEqual(w.snapshot().entities[0].point,stopped.point);
 w.advance({simMs:2600,observers:[visitor('far',home.e+45,home.n)],environment:env});assert.ok(distance(w.snapshot().entities[0].point,stopped.point)<.001);assert.equal(w.snapshot().entities[0].state,'walk-away');
 w.advance({simMs:2800,observers:[visitor('far',home.e+45,home.n)],environment:env});assert.ok(distance(w.snapshot().entities[0].point,stopped.point)>.05);
});
