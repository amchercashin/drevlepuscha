import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readMeshyGLB} from '../tools/meshy-glb.mjs';
import {forestPlacements,treeCollider} from '../src/domain/forest.ts';
import {groundHeight,walkerIsClear} from '../src/domain/harness.ts';
const hash=b=>createHash('sha256').update(b).digest('hex');

for(const route of ['a','b']){
 test('Meshy '+route+': real export, metre scale, textures and cached LOD meet the asset budget',()=>{
  const base='assets/trees/meshy-'+route,bytes=readFileSync(base+'/source.glb'),source=readMeshyGLB(bytes),cache=JSON.parse(readFileSync(base+'/tree.json'));
  assert.equal(cache.sourceHash,hash(bytes));assert.ok(source.triangles<=6000);assert.equal(cache.triangles[0],source.triangles);assert.equal(source.parts.length,1);assert.deepEqual(source.textureInfo[0].size,[2048,2048]);
  const imported=readMeshyGLB(readFileSync(base+'/tree.glb'));
  assert.equal(imported.triangles,source.triangles);assert.equal(hash(imported.textures['material-0']),hash(source.textures['material-0']));
  for(const [level,parts] of cache.levels.entries()){
   assert.equal(parts.reduce((n,p)=>n+p.indices.length/3,0),cache.triangles[level]);assert.ok(cache.triangles[level]<=[6000,1500,300][level]);
   for(const p of parts){const n=p.positions.length/3;assert.ok(p.positions.every(Number.isFinite));assert.equal(p.normals.length,n*3);assert.equal(p.uvs.length,n*2);assert.equal(p.colors.length,n*4);assert.ok(p.indices.every(i=>Number.isInteger(i)&&i>=0&&i<n));assert.ok(p.colors.every(x=>x>=0&&x<=1));for(let i=0;i<n;i++)assert.ok(Math.abs(Math.hypot(...p.normals.slice(i*3,i*3+3))-1)<1e-5);}
  }
  assert.equal(cache.bakedColorFromLevel,1);for(const parts of cache.levels.slice(1))for(const p of parts){let trunkSamples=0;for(let i=0;i<p.indices.length;i+=3)for(let j=0;j<3;j++){const a=p.indices[i+j],b=p.indices[i+(j+1)%3],ay=p.positions[a*3+1],by=p.positions[b*3+1];if((ay<4&&by>4)||(by<4&&ay>4)){const t=(4-ay)/(by-ay),r=p.colors[a*4]*(1-t)+p.colors[b*4]*t,g=p.colors[a*4+1]*(1-t)+p.colors[b*4+1]*t;trunkSamples++;assert.ok(g-r<.055,'green bark at 4 m in distant LOD');}}assert.ok(trunkSamples>0);}

  const ys=source.parts.flatMap(p=>p.positions.filter((_,i)=>i%3===1));assert.ok(Math.abs(Math.min(...ys))<1e-6);assert.ok(Math.abs(Math.max(...ys)-18)<1e-6);
 });
 test('Meshy '+route+': source change does not shuffle the forest; approximate trunk colliders leave the route open',()=>{
  const cache=JSON.parse(readFileSync('assets/trees/meshy-'+route+'/tree.json')),trees=forestPlacements(cache.rootRadius,cache.placement),original=forestPlacements();
  assert.equal(trees.length,4967);assert.deepEqual(trees.map(({id,e,n,yaw})=>({id,e,n,yaw})),original.map(({id,e,n,yaw})=>({id,e,n,yaw})));assert.deepEqual(trees,forestPlacements(cache.rootRadius,cache.placement));
  const background=trees.filter(t=>t.id.startsWith('m1-'));for(const t of background){assert.ok(t.height>=.6&&t.height<=1);assert.ok(t.width>=.45&&t.width<=.78);assert.ok(t.depth/t.width>=.82&&t.depth/t.width<=1.18);assert.ok(Math.abs(t.leanX)<=2*Math.PI/180);assert.ok(t.y<groundHeight(t.e,t.n)-.5);}
  assert.ok(new Set(background.map(t=>t.depth/t.width)).size>100);assert.ok(Math.max(...background.map(t=>t.height))-Math.min(...background.map(t=>t.height))>.39);
  const boxes=trees.map(t=>treeCollider(t,cache.trunkRadius));for(let n=0;n<60;n+=0.1)assert.ok(walkerIsClear({e:0,n},boxes),'route blocked at '+n);
 });
}
