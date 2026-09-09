import test from 'node:test';import assert from 'node:assert/strict';
import {forestPlacements} from '../src/domain/forest.ts';
import {treeFamilySlot} from '../src/domain/tree-family.ts';
test('forest families preserve protected probes and limit each outer grove to one reusable variant',()=>{
 const trees=forestPlacements(),groves=new Map(),counts=new Map();
 for(const p of trees){const slot=treeFamilySlot(p);assert.ok(Number.isInteger(slot)&&slot>=0&&slot<7);counts.set(slot,(counts.get(slot)||0)+1);
  if(!p.id.startsWith('m1-'))assert.equal(slot,0);
  if(p.id.startsWith('m1-outer-')){const key=`${Math.floor(p.e/64)}:${Math.floor(p.n/64)}`;if(groves.has(key))assert.equal(slot,groves.get(key));else groves.set(key,slot);}
 }
 assert.equal(trees.length,4967);assert.equal(counts.size,7);assert.deepEqual(trees.map(p=>treeFamilySlot(p)),forestPlacements().map(p=>treeFamilySlot(p)));
});

test('family selection respects a changed variant count in prepared profiles',()=>{
 for(const counts of [[1,1],[2,4],[4,2]])for(const p of forestPlacements()){const slot=treeFamilySlot(p,counts);assert.ok(slot>=0&&slot<1+counts[0]+counts[1]);}
});
