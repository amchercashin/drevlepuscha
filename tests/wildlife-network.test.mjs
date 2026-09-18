import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WildlifeSession,WildlifeEvents} from '../src/network/wildlife-session.ts';
import {frameValidator,frameBytes,sameCapability,wildlifeCapability} from '../src/network/wildlife-protocol.ts';
import {packShowcasePosition,unpackShowcasePosition} from '../src/domain/showcase-position.ts';
import {metricRoster} from '../src/domain/showcase-wildlife-input.ts';
import {loadWildlifeContent} from '../server/wildlife-content.mjs';
const data=loadWildlifeContent(),home=data.cells[0].sites[0].home,env={totalGameHours:12,daylight01:1,precipitation01:0};
const obs=(e,near=false)=>({id:near?'second':'first',e,n:home.n,h:home.h-1,headingDeg:0,speedMps:2,running:true,observedAtMs:0});
function episode(){const s=new WildlifeSession({data},'authority','authority-1',0);s.advance(0,[obs(home.e+50)],env);for(let t=200;t<=1600;t+=200)s.advance(t,[obs(home.e+2,true)],env);return s;}
test('strict atomic frame validation rejects malformed, oversized, duplicate and foreign content',()=>{
 const s=episode(),frame=s.view.latest(),valid=frameValidator(data);assert.equal(valid(frame),true);assert.ok(frameBytes(frame)<32768);
 const changes=[f=>f.entities.push(f.entities[0]),f=>f.entities[0].species='roe-deer',f=>f.entities[0].state='graze',f=>f.entities[0].point.e=NaN,f=>f.entities[0].generation=-1,f=>f.entities[0].id='x'.repeat(200),f=>f.content.contentHash='0'.repeat(64),f=>f.entities[0].route.routeId='absent',f=>f.recentEvents[0].kind='deer-startle',f=>f.extra='€'.repeat(12000)];
 for(const mutate of changes){const bad=structuredClone(frame);mutate(bad);assert.equal(valid(bad),false);}
});
test('late attach skips old events; live event once; old seq and old epoch never roll state back',()=>{
 const source=episode(),frame=source.view.latest(),replica=new WildlifeSession({data},'replica','ignored',0),events=new WildlifeEvents();
 assert.equal(replica.accept(frame,2000),false);assert.equal(replica.accept(frame,2000,true),true);
 const unsubscribe=replica.view.subscribe((f,initial)=>events.accept(f,initial));assert.deepEqual(events.due(2100),[]);
 assert.equal(replica.accept(frame,2100),false);assert.equal(replica.view.latest().seq,frame.seq);
 const live=structuredClone(frame);live.seq=1800;live.simMs=1800;live.eventWatermark=2;live.recentEvents=[{...frame.recentEvents[0],seq:2,atMs:1800}];
 assert.equal(replica.accept(live,2200),true);assert.equal(events.due(1800).length,1);assert.equal(events.due(1801).length,0);
 const restart={...live,authorityEpoch:'authority-2',seq:0,simMs:0,eventWatermark:0,entities:[],recentEvents:[]};
 assert.equal(replica.accept(restart,2300),false);assert.equal(replica.accept(restart,2300,true),true);assert.equal(replica.accept(live,2400),false);
 assert.ok(replica.view.presentationMs(99999)<=130);unsubscribe();replica.dispose();assert.equal(replica.stats().listeners,0);
});
test('solo core transfers to host without duplicates; replica cannot advance or accept its own authority',()=>{
 const solo=episode(),before=solo.view.latest(),world=solo.detachWorld(),host=new WildlifeSession({data,world},'authority','unused',5000);solo.dispose();
 assert.deepEqual(host.view.latest(),before);host.advance(5200,[obs(home.e+2,true)],env);assert.equal(host.view.latest().entities[0].id,before.entities[0].id);
 assert.equal(host.accept(before,5300,true),false);const replica=new WildlifeSession({data},'replica','ignored',0);replica.advance(9000,[],env);assert.equal(replica.view.latest(),null);
});
test('metric roster uses accepted ready peers and preserves speed; capability is opt-in',()=>{
 const p=unpackShowcasePosition({x:.5,y:.4,seq:0,speed:15,running:true,heading:20});assert.equal(p.e,0);assert.equal(p.n,0);assert.equal(p.speedMps,15);assert.equal(packShowcasePosition(p).y,.4);
 const players=[{id:'ready',name:'a',slot:0,x:.5,y:.4,seq:0,speed:15},{id:'loading',name:'b',slot:1,x:.5,y:.4,seq:0}];assert.deepEqual(metricRoster(players,new Set(['ready']),100).map(p=>p.id),['ready']);
 assert.equal(sameCapability(undefined,undefined),true);assert.equal(sameCapability(undefined,data.identity),false);assert.equal(sameCapability(wildlifeCapability(data.identity),data.identity),true);
 assert.equal(sameCapability({...wildlifeCapability(data.identity),behaviorVersion:99},data.identity),false);
});
test('Node core/content/session dependency graph excludes GPU, DOM, runtime and showcase bounds in core',()=>{
 const visited=new Set();function inspect(path){if(visited.has(path))return;visited.add(path);const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');assert.doesNotMatch(source,/from ['"](?:@babylonjs|.*runtime\/)/);if(path.startsWith('src/domain/wildlife/'))assert.doesNotMatch(source,/\b(?:document|window|FOREST_BOUNDS|showcaseEnabled|Date\.now|performance\.now)\b/);
  for(const match of source.matchAll(/import\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/g)){if(!match[1].startsWith('.'))continue;const absolute=new URL(match[1],new URL('../'+path,import.meta.url));const relative=decodeURIComponent(absolute.pathname).split('/lotr/')[1];if(relative)inspect(relative);}
 }inspect('src/domain/wildlife/world.ts');inspect('server/wildlife-content.mjs');inspect('src/network/wildlife-session.ts');
});
