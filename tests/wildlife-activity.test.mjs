import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {wildlifeAdmission,wildlifeCooldown} from '../src/domain/wildlife/activity.ts';
import {WildlifeWorld} from '../src/domain/wildlife/world.ts';
import {validateAudio} from '../tools/wildlife/validate-assets.mjs';
test('shared dawn/rain admission is staggered and cooldowns are independent per ID',()=>{
 const ids=Array.from({length:48},(_,i)=>`bird-${i}`),env={totalGameHours:30,daylight01:.23,precipitation01:0};
 const count=ids.filter(id=>wildlifeAdmission(env,'woodland-bird','seed',id,0)).length;assert.ok(count>5&&count<43);
 assert.ok(new Set(ids.map(id=>wildlifeCooldown(90000,'seed',id,0))).size>40);
 for(const id of ids){assert.equal(wildlifeAdmission({...env,daylight01:0},'woodland-bird','seed',id,0),false);assert.equal(wildlifeAdmission({...env,daylight01:1,precipitation01:1},'woodland-bird','seed',id,0),false);}
 const data=JSON.parse(readFileSync('public/wildlife/content/showcase/bird.json')),home=data.cells[0].sites[0].home,w=new WildlifeWorld({content:data.identity,authorityEpoch:'test',seed:'seed',cells:new Map(data.cells.map(c=>[c.id,c])),limits:data.limits,bird:data.bird}),observers=[{...home,e:home.e+50,id:'p',headingDeg:0,speedMps:0,running:false,observedAtMs:0}];
 w.advance({simMs:0,observers,environment:{...env,daylight01:1}});const before=w.snapshot().entities.map(e=>e.id);assert.ok(before.length);
 for(let t=200;t<=4000;t+=200)w.advance({simMs:t,observers,environment:{...env,daylight01:0,precipitation01:1}});assert.deepEqual(w.snapshot().entities.map(e=>e.id),before);w.dispose();
});
test('local audio hashes, mono Opus duration and preserved tails are verified; unheard cannot be accepted',()=>{const m=JSON.parse(readFileSync('config/wildlife/audio.json'));assert.equal(validateAudio(m),true);assert.throws(()=>validateAudio(m,true),/Unaccepted/);});
