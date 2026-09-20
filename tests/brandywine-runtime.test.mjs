import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {regionGeography,createBrandywineGeography} from '../src/domain/regions/brandywine.mjs';
import {surfaceAt,barrierAt} from '../src/domain/regions/traversal.mjs';
import {triangleHeight,moveOnTerrain} from '../src/world/math.ts';
const source=JSON.parse(readFileSync(new URL('../content/regions/brandywine-bridge/region-source.json',import.meta.url)));
const geo=createBrandywineGeography(regionGeography(source));
const build=spawnSync(process.execPath,['tools/regions/build.mjs'],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);
const root=new URL('../public/regions/brandywine-bridge/world/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',root)));
const grids=new Map();
function grid(id){if(!grids.has(id)){const [x,y]=id.split(',').map(Number),raw=gunzipSync(readFileSync(new URL(manifest.tiles[id].file,root))),values=Float32Array.from({length:257*257},(_,i)=>raw.readFloatLE(i*4));grids.set(id,{origin:[x*512,y*512],columns:257,rows:257,stepM:2,values});}return grids.get(id);}
const height=(e,n)=>triangleHeight(grid(Math.floor(e/512)+','+Math.floor(n/512)),e,n);
test('72 streamed terrain tiles share identical Float32 edges',()=>{
 assert.equal(Object.keys(manifest.tiles).length,72);
 for(const id of Object.keys(manifest.tiles)){const [x,y]=id.split(',').map(Number),a=grid(id);
  if(manifest.tiles[`${x+1},${y}`]){const b=grid(`${x+1},${y}`);for(let j=0;j<257;j++)assert.equal(a.values[j*257+256],b.values[j*257]);}
  if(manifest.tiles[`${x},${y+1}`]){const b=grid(`${x},${y+1}`);for(let i=0;i<257;i++)assert.equal(a.values[256*257+i],b.values[i]);}
 }
});
test('offscreen physics and tile halo use the same Float32 triangles as rendered ground',()=>{
 for(let i=0;i<500;i++){const e=-1500+(i*193.13)%3800,n=-1400+(i*379.71)%3800;assert.ok(Math.abs(height(e,n)-geo.surfaceHeight(e,n))<1e-7);}
});
test('walking ramps and both bridge decks works on rendered terrain triangles',()=>{
 for(const bridge of geo.bridges){
  const a=bridge.points[0],b=bridge.points.at(-1),dx=b[0]-a[0],dn=b[1]-a[1],len=Math.hypot(dx,dn),r=bridge.id==='main-bridge'?120:45;
  const start=[a[0]-dx/len*r,a[1]-dn/len*r],goal=[b[0]+dx/len*r,b[1]+dn/len*r];
  let p={e:start[0],n:start[1]},context={height:height(...start),supportId:'terrain',mode:'walk',water:'normal'};
  const surface=(e,n)=>surfaceAt(geo,height,e,n,context);
  for(let i=0;i<Math.ceil((len+r*2)/.1);i++){
   const next=moveOnTerrain(p,dx/len*.1,dn/len*.1,{height:(e,n)=>surface(e,n).height,ready:()=>true,blocked:()=>false,waterDepth:(e,n)=>surface(e,n).supportId==='terrain'?Math.max(0,(geo.waterAt(e,n)?.level??-Infinity)-height(e,n)):0},source.playBounds);
   p=next;const s=surface(p.e,p.n);context={...context,height:s.height,supportId:s.supportId};
  }
  assert.ok(Math.hypot(p.e-goal[0],p.n-goal[1])<1,bridge.id+' ends at '+JSON.stringify(p));
 }
});
test('under-bridge boat stays on water; hedge only opens at authored gate',()=>{
 assert.ok(surfaceAt(geo,height,0,0,{height:0,supportId:'water',mode:'boat',water:'normal'}).height<1);
 assert.equal(surfaceAt(geo,height,0,0,{height:-3.8,supportId:'terrain',mode:'walk',water:'normal'}).supportId,'terrain');
 assert.equal(barrierAt(geo,550,-180,true),false);assert.equal(barrierAt(geo,550,-180,false),true);assert.equal(barrierAt(geo,350,-180,true),true);
});
