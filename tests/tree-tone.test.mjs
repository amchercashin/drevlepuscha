import test from 'node:test';
import assert from 'node:assert/strict';
import {treeTone} from '../src/domain/tree-tone.ts';
test('tree tones are bounded, reproducible and continuous between groves',()=>{
 const samples=[];
 for(let i=0;i<200;i++){const tone=treeTone('tree-'+i,i*3-300,i*2-200);assert.deepEqual(tone,treeTone('tree-'+i,i*3-300,i*2-200));tone.forEach((v,j)=>assert.ok(Math.abs(v)<=[.16,.22,.13][j]));samples.push(tone);}
 assert.ok(new Set(samples.map(t=>t.join(','))).size===200);
 const a=treeTone('same',47.999,20),b=treeTone('same',48.001,20);a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-5));
 const near=treeTone('same',48.1,20),far=treeTone('same',160,100);assert.ok(Math.abs(a[1]-near[1])<Math.abs(a[1]-far[1]));
});
