import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RegionHunt} from '../src/domain/regions/hunt.ts';

const source=JSON.parse(readFileSync(new URL('../content/regions/brandywine-bridge/region-source.json',import.meta.url)));
const make=()=>new RegionHunt(source,'test-version');
const world={height:()=>0,visible:()=>true,blocked:()=>false};
const walker=(e,n,extra={})=>({e,n,height:0,mode:'walk',speed:0,crouching:false,...extra});

test('authored tracks form a deterministic sequence and survive a validated save',()=>{
 const hunt=make(),copy=make();assert.deepEqual(hunt.clues,copy.clues);
 assert.equal(hunt.inspect(hunt.clues[1]),null,'cannot skip the first trail sign');
 for(const clue of hunt.clues){assert.equal(hunt.nearbyClue(clue)?.id,clue.id);assert.equal(hunt.inspect(clue)?.id,clue.id);}
 copy.restore(hunt.snapshot());assert.deepEqual(copy.state.tracks,hunt.clues.map(c=>c.id));
 assert.equal(copy.nextClue,null);
 assert.throws(()=>copy.restore({...hunt.snapshot(),contentVersion:'stale'}));
 assert.throws(()=>copy.restore({...hunt.snapshot(),scouts:[hunt.state.scouts[0]]}));
});

test('running in sight raises alarm; crouching delays discovery; patrols move without the player nearby',()=>{
 const quiet=make(),loud=make(),target=quiet.state.scouts[0];
 const p=walker(target.e+16,target.n,{speed:.9,crouching:true});
 for(let i=0;i<80;i++)quiet.update(.05,p,world);
 for(let i=0;i<80;i++)loud.update(.05,{...p,speed:8,crouching:false},world);
 assert.ok(loud.state.scouts[0].alert>quiet.state.scouts[0].alert);
 assert.equal(loud.state.scouts[0].mode,'pursuit');
 const far=make(),before=far.state.scouts[0].distanceM;
 for(let i=0;i<40;i++)far.update(.05,walker(-220,-105),world);
 assert.notEqual(far.state.scouts[0].distanceM,before);
});

test('bow travels through the world, sword needs reach and facing, and victory is persistent',()=>{
 const hunt=make();for(const scout of hunt.state.scouts){
  const player=walker(scout.e,scout.n-10),heading=0;
  assert.ok(hunt.fireBow(player,heading,0));
  for(let i=0;i<10;i++)hunt.update(.05,player,world);
  assert.equal(scout.mode,'down');
  for(let i=0;i<12;i++)hunt.update(.05,walker(-220,-105),world);
 }
 assert.equal(hunt.state.completed,true);assert.equal(hunt.downCount,3);
 const copy=make();copy.restore(hunt.snapshot());assert.equal(copy.state.completed,true);
 const sword=make(),scout=sword.state.scouts[0],behind=walker(scout.e,scout.n+1.5);
 sword.select('sword');assert.ok(sword.swing(behind,0,world));assert.equal(scout.health,100,'back turned');
 for(let i=0;i<16;i++)sword.update(.05,walker(-220,-105),world);
 assert.ok(sword.swing(behind,180,world));assert.equal(scout.health,45);
 for(let i=0;i<16;i++)sword.update(.05,walker(-220,-105),world);
 assert.ok(sword.swing(behind,180,world));assert.equal(scout.mode,'down');
});
