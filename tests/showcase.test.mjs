import test from 'node:test';
import assert from 'node:assert/strict';
import {showcaseHeight,showcasePath,relief,terrainCameraLift} from '../src/domain/showcase.ts';
test('showcase renders the same two metre triangles used by movement',()=>{
 for(let n=-250;n<380;n+=14)for(let e=-250;e<250;e+=14){
  assert.equal(showcaseHeight(e,n),relief(e,n));
  const expected=(relief(e+2,n)+relief(e,n+2))/2;
  assert.ok(Math.abs(showcaseHeight(e+1,n+1)-expected)<1e-10);
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
