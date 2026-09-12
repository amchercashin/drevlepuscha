import test from 'node:test';
import assert from 'node:assert/strict';
import {trailWidth} from '../src/domain/trail-edge.ts';
import {showcaseHeight,showcaseBaseHeight,showcasePath,relief,terrainCameraLift,SHOWCASE_GROUND,groundDetailVertexHeight} from '../src/domain/showcase.ts';
test('trail banks stay walkable, vary independently and do not repeat the old two metre wave',()=>{
 const left=[],right=[];
 for(let n=-250;n<380;n+=.25){
  const l=trailWidth(n,false),r=trailWidth(n,true);left.push(l);right.push(r);
  assert.ok(l>.74&&l<2.36&&r>.74&&r<2.36);
  assert.ok(Math.abs(l-trailWidth(n+.01,false))<.02);
 }
 assert.ok(left.some((l,i)=>Math.abs(l-right[i])>.5));
 assert.ok(left.some((l,i)=>i+8<left.length&&Math.abs(l-left[i+8])>.35));
});
test('showcase retains its original large-scale terrain',()=>{
 for(let n=-250;n<380;n+=14)for(let e=-250;e<250;e+=14){
  assert.equal(showcaseBaseHeight(e,n),relief(e,n));
  assert.ok(Math.abs(showcaseHeight(e,n)-showcaseBaseHeight(e,n))<.11);
  const expected=(relief(e+2,n)+relief(e,n+2))/2;
  assert.ok(Math.abs(showcaseBaseHeight(e+1,n+1)-expected)<1e-10);
 }
});
test('detail support uses the rendered quarter-metre triangles throughout the showcase',()=>{
 const step=SHOWCASE_GROUND.step;
 for(let e=-240;e<250;e+=14.75)for(let n=-240;n<370;n+=14.75){
  assert.ok(Math.abs(showcaseHeight(e,n)-showcaseBaseHeight(e,n))<.11);
  for(const [u,v] of [[.2,.3],[.7,.8]]){
   const h=(x,z)=>groundDetailVertexHeight(e+x*step,n+z*step);
   const expected=u+v<=1?h(0,0)+(h(1,0)-h(0,0))*u+(h(0,1)-h(0,0))*v:h(1,1)+(h(0,1)-h(1,1))*(1-u)+(h(1,0)-h(1,1))*(1-v);
   assert.ok(Math.abs(showcaseHeight(e+u*step,n+v*step)-expected)<1e-10);
  }
 }
});
test('winding valley has pronounced banks, varying elevation and a walkable trail',()=>{
 let min=Infinity,max=-Infinity,banks=0;
 for(let n=-230;n<370;n++){
  const e=showcasePath(n),h=showcaseHeight(e,n);min=Math.min(min,h);max=Math.max(max,h);
  if(Math.max(showcaseHeight(e+22,n),showcaseHeight(e-22,n))>h+2)banks++;
  const delta=showcaseHeight(showcasePath(n+1),n+1)-h;
  assert.ok(Math.abs(delta)<.6);
 }
 assert.ok(max-min>9);
 assert.ok(banks>550, "Raised banks remain clear except at tributary openings");
});
test('terrain camera clearance survives opposing slopes and all orbit directions',()=>{
 for(let n=-150;n<260;n+=23)for(const side of [-14,0,14])for(let a=0;a<6.28;a+=.3){
  const x=showcasePath(n)+side,target={x,y:showcaseHeight(x,n)+.95,z:-n};
  const eye={x:x+Math.cos(a)*8,y:target.y,z:-n+Math.sin(a)*8};
  const lift=terrainCameraLift(eye,target);
  assert.ok(eye.y+lift>=showcaseHeight(eye.x,-eye.z)+.239);
  for(let i=0;i<=28;i++){const t=i/30,ex=eye.x+(target.x-eye.x)*t,ez=eye.z+(target.z-eye.z)*t;
   assert.ok(eye.y+lift+(target.y-eye.y-lift)*t>=showcaseHeight(ex,-ez)+.239);
  }
 }
});
