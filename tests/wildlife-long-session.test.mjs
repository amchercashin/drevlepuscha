import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {WildlifeWorld} from '../src/domain/wildlife/world.ts';
import {frameBytes,frameValidator} from '../src/network/wildlife-protocol.ts';
test('15 simulated minutes with six moving observers, dusk and rain retain bounded state and independent encounters',()=>{
 const data=JSON.parse(readFileSync('public/wildlife/content/showcase/bird.json')),sites=data.cells.flatMap(c=>c.sites),w=new WildlifeWorld({content:data.identity,authorityEpoch:'long-session',seed:'rhythm',cells:new Map(data.cells.map(c=>[c.id,c])),limits:data.limits,bird:data.bird}),valid=frameValidator(data),events=new Map(),births=new Map(),costs=[];let bytes=0,maxActive=0,previous=new Map();
 for(let ms=0;ms<=900000;ms+=200){
  const observers=Array.from({length:6},(_,i)=>{const s=sites[i%sites.length],period=127+i*19,phase=(ms/1000+i*23)%period,d=phase<30?55:phase<65?Math.max(2,55-(phase-30)*1.85):phase<80?2:Math.min(70,2+(phase-80)*1.85);return {...s.home,e:s.home.e+d,n:s.home.n+2,id:`player-${i}`,headingDeg:270,speedMps:1.85,running:false,observedAtMs:ms};});
  const environment={totalGameHours:12+ms/900000*8,daylight01:Math.max(.1,1-ms/1100000),precipitation01:ms>=400000&&ms<500000?.8:0},start=performance.now();w.advance({simMs:ms,observers,environment});const frame=w.snapshot();costs.push(performance.now()-start);assert.ok(valid(frame));bytes=Math.max(bytes,frameBytes(frame));maxActive=Math.max(maxActive,frame.entities.length);
  for(const e of frame.recentEvents)events.set(e.seq,e);for(const e of frame.entities){if(!previous.has(e.id)||previous.get(e.id)!==e.generation)births.set(`${e.id}/${e.generation}`,ms);}
  previous=new Map(frame.entities.map(e=>[e.id,e.generation]));assert.ok(w.stats().dormantRecords<=384);assert.ok(w.stats().residentCells<=216);
 }
 assert.ok(events.size>=3);assert.ok(new Set([...births.values()]).size>=3);assert.ok(bytes<=32768);const before=w.stats();w.dispose();assert.equal(w.stats().activeEntities,0);assert.equal(w.stats().residentCells,0);
 costs.sort((a,b)=>a-b);mkdirSync('tmp',{recursive:true});writeFileSync('tmp/wildlife-long-session.json',JSON.stringify({scope:'15 minutes simulated, not a human walking or listening acceptance',simulatedMs:900000,observers:6,events:events.size,eventKinds:[...new Set([...events.values()].map(e=>e.kind))],births:births.size,maxActive,maxFrameBytes:bytes,coreAndSnapshotMs:{p50:costs[Math.floor(costs.length*.5)],p95:costs[Math.floor(costs.length*.95)],max:costs.at(-1)},beforeDispose:before,afterDispose:w.stats()},null,2));
});
