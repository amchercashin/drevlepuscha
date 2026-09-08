import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {forestPlacements,treeCollider,treeLevel} from '../src/domain/forest.ts';
import {walkerIsClear,occludesTraveller} from '../src/domain/harness.ts';
import {treeGLB} from '../src/domain/tree-glb.ts';
import {createReferenceTree} from '../src/domain/reference-tree.ts';
const data=JSON.parse(readFileSync('assets/trees/game/tree.json','utf8'));
test('game tree derives from current source and meets all three budgets with two materials',()=>{
 assert.equal(data.sourceHash,createHash('sha256').update(JSON.stringify(createReferenceTree())).digest('hex'));
 data.levels.forEach((parts,l)=>{assert.equal(parts.length,2);const total=parts.reduce((n,p)=>n+p.indices.length/3,0);assert.equal(total,data.triangles[l]);assert.ok(total<=[5000,1500,300][l]);for(const p of parts){const n=p.positions.length/3;assert.ok(p.positions.every(Number.isFinite));assert.equal(p.normals.length,n*3);assert.equal(p.uvs.length,n*2);assert.equal(p.colors.length,n*4);assert.ok(p.indices.every(i=>Number.isInteger(i)&&i>=0&&i<n));for(let i=0;i<n;i++)assert.ok(Math.abs(Math.hypot(...p.normals.slice(i*3,i*3+3))-1)<1e-5);}});
});
test('seeded large tree field is stable, varies shape, and leaves the centre route walkable',()=>{
 const trees=forestPlacements();assert.deepEqual(trees,forestPlacements());assert.equal(trees.length,4967);assert.equal(new Set(trees.map(t=>t.id)).size,4967);assert.ok(new Set(trees.map(t=>t.height)).size>50);const boxes=trees.map(treeCollider);for(let n=0;n<60;n+=0.1)assert.ok(walkerIsClear({e:0,n},boxes),`blocked at ${n}`);
});
test('LOD transitions have hysteresis and return to full detail on approach',()=>{
 assert.equal(treeLevel(21,0),0);assert.equal(treeLevel(23,0),1);assert.equal(treeLevel(19,1),1);assert.equal(treeLevel(17,1),0);assert.equal(treeLevel(54,1),2);assert.equal(treeLevel(47,2),2);assert.equal(treeLevel(45,2),1);
});
test('empty space inside a tree bounding box must not fade its geometry',()=>{
 const camera={x:0,y:1,z:5},feet={x:0,y:0,z:0},box={id:'open-boughs',min:{x:-3,y:0,z:1},max:{x:3,y:15,z:4}};
 assert.equal(occludesTraveller(camera,feet,box),true);assert.equal(occludesTraveller(camera,feet,box,false,()=>false),false);assert.equal(occludesTraveller(camera,feet,box,false,()=>true),true);
});

test('standalone game GLB matches the same near model and embedded textures used by the scene',()=>{
 const textures=Object.fromEntries(['bark','canopy'].map(n=>[n,new Uint8Array(readFileSync(`assets/trees/${n}.png`))]));
 assert.deepEqual(new Uint8Array(readFileSync('assets/trees/game/tree.glb')),new Uint8Array(treeGLB(data.levels[0],textures,data.version)));
});
test('derived distant crowns remain closed volumes instead of collapsed leaf fragments',()=>{
 for(const level of data.levels.slice(1)){
  const p=level[1],edges=new Map(),key=i=>p.positions.slice(i*3,i*3+3).map(v=>Math.round(v*1e6)).join(',');
  for(let i=0;i<p.indices.length;i+=3){const ids=p.indices.slice(i,i+3).map(key);assert.equal(new Set(ids).size,3);for(let e=0;e<3;e++){const edge=[ids[e],ids[(e+1)%3]].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);}}
  assert.ok([...edges.values()].every(n=>n===2));
 }
});
