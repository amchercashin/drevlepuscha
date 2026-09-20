import test from 'node:test';
import assert from 'node:assert/strict';
import {regionGroveMatrices} from '../src/world/region-grove-data.ts';
import {regionCanopyGeometry} from '../src/world/region-canopy-data.ts';
import {triangleHeight} from '../src/world/math.ts';
const grid={origin:[-1024,-1024],stepM:128,columns:17,rows:17,values:Array.from({length:289},(_,i)=>Math.floor(i/17)*2+i%17)};
const geo={forestAt:(e,n)=>Math.abs(e)<900&&Math.abs(n)<900,exclusion:(e,n)=>Math.abs(e)<45,surfaceHeight:(e,n)=>triangleHeight(grid,e,n)};
test('middle forest roots follow rendered ground, stay outside the near band and survive rebasing',()=>{
 const a=regionGroveMatrices({e:0,n:0},{e:0,n:0},grid,geo),b=regionGroveMatrices({e:0,n:0},{e:512,n:-512},grid,geo);
 let count=0;for(const [id,matrices]of Object.entries(a))for(let i=0;i<matrices.length;i+=16){count++;const e=matrices[i+12],n=-matrices[i+14],h=matrices[i+13];
  assert.ok(Math.hypot(e,n)>=409.99&&Math.hypot(e,n)<=820.01);assert.ok(Math.abs(e)>=45);assert.ok(h<=triangleHeight(grid,e,n)&&h>triangleHeight(grid,e,n)-1);
  assert.ok(Math.abs(b[id][i+12]-(e-512))<.001);assert.ok(Math.abs(b[id][i+14]-(-512-n))<.001);assert.equal(b[id][i+13],h);
 }assert.ok(count>300);assert.deepEqual(a,regionGroveMatrices({e:0,n:0},{e:0,n:0},grid,geo));
});
test('far canopy shares vertices, stays finite and leaves the river corridor open',()=>{
 const g=regionCanopyGeometry(grid,geo);assert.ok(g.indices.length>1000);assert.ok(g.positions.length/3<g.indices.length/2);
 for(const v of g.positions)assert.ok(Number.isFinite(v));
 for(let i=0;i<g.indices.length;i+=3){const ids=Array.from(g.indices.slice(i,i+3));const x=ids.reduce((n,j)=>n+g.positions[j*3],0)/3;assert.ok(Math.abs(x)>=39.9,'forest must not bridge the excluded river');}
 const tops=[];for(let i=0;i<g.positions.length;i+=3){const h=g.positions[i+1]-triangleHeight(grid,g.positions[i],-g.positions[i+2]);if(h>2)tops.push(h);}assert.ok(Math.max(...tops)-Math.min(...tops)>5,'edge and interior must have different silhouettes');
});
