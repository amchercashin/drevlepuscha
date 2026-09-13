import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {collisionGeometry,meshCollider,meshBlocksCylinder,meshBlocksSegment} from '../src/domain/mesh-collision.ts';
import {treeCollider} from '../src/domain/forest.ts';
import {collisionGrid} from '../src/domain/collision-grid.ts';
import {groundHeight,moveWalker,walkerIsClear} from '../src/domain/harness.ts';
const cube={positions:[-1,0,-1,1,0,-1,1,2,-1,-1,2,-1,-1,0,1,1,0,1,1,2,1,-1,2,1],indices:[0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,3,2,6,3,6,7,0,3,7,0,7,4,1,5,6,1,6,2]};
const geometry=collisionGeometry([cube]);
function placed(g,scale=[1,1,1],rotation=[0,0,0],position=[0,0,0]){
 const matrix=Matrix.Compose(Vector3.FromArray(scale),Quaternion.FromEulerAngles(...rotation),Vector3.FromArray(position));
 return meshCollider(g,matrix.m,Matrix.Invert(matrix).m);
}
test('camera segments hit actual triangles with scale/lean, skip empty bounds and the endpoint',()=>{
 const c=placed(geometry,[.4,1.8,.2],[.3,.7,.4],[8,3,-10]);
 const world=p=>{const v=Vector3.TransformCoordinates(Vector3.FromArray(p),Matrix.FromArray(c.matrix));return {x:v.x,y:v.y,z:v.z};};
 assert.equal(meshBlocksSegment(c,world([-3,1,0]),world([3,1,0])),true);
 assert.equal(meshBlocksSegment(c,world([3,1,0]),world([-3,1,0])),true);
 assert.equal(meshBlocksSegment(c,world([-3,3,0]),world([3,3,0])),false);
 assert.equal(meshBlocksSegment(c,world([-3,1,0]),world([-1,1,0])),false,'wall at the player endpoint is not an occluder');
 assert.equal(meshBlocksSegment(c,world([-3,1,0]),world([-1.1,1,0])),false);
 assert.equal(meshBlocksSegment(c,world([-3,1,0]),world([-.9,1,0])),true);
 const triangle=placed(collisionGeometry([{positions:[0,0,0,2,0,0,0,2,0],indices:[0,1,2]}]));
 assert.equal(meshBlocksSegment(triangle,{x:1.8,y:1.8,z:-2},{x:1.8,y:1.8,z:2}),false,'empty corner inside the bounding box');
 assert.equal(meshBlocksSegment(triangle,{x:.2,y:.2,z:-2},{x:.2,y:.2,z:2}),true);
 assert.equal(meshBlocksSegment(triangle,{x:.2,y:.2,z:0},{x:.2,y:.2,z:0}),false);
});
test('BVH camera rays agree with Babylon on a transformed tree',async()=>{
 const {NullEngine}=await import('@babylonjs/core/Engines/nullEngine.js');
 const {Scene}=await import('@babylonjs/core/scene.js');
 const {Mesh}=await import('@babylonjs/core/Meshes/mesh.js');
 const {VertexData}=await import('@babylonjs/core/Meshes/mesh.vertexData.js');
 const {StandardMaterial}=await import('@babylonjs/core/Materials/standardMaterial.js');
 const {Ray}=await import('@babylonjs/core/Culling/ray.js');
 const parts=JSON.parse(readFileSync('assets/trees/young-tree/variants.json')).variants[0].levels[0];
 const engine=new NullEngine(),scene=new Scene(engine),mesh=new Mesh('camera-reference',scene);
 try{
  mesh.material=new StandardMaterial('triangles',scene);
  const vertices=new VertexData();Object.assign(vertices,parts[0]);vertices.applyToMesh(mesh);
  mesh.scaling.set(.7,1.1,.45);mesh.rotationQuaternion=Quaternion.FromEulerAngles(.2,1.3,-.12);mesh.position.set(10,-1,-20);mesh.computeWorldMatrix(true);
  const matrix=mesh.getWorldMatrix(),collider=meshCollider(collisionGeometry(parts),matrix.m,Matrix.Invert(matrix).m);
  let seed=4143,hits=0;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let i=0;i<1500;i++){
   const from=new Vector3(10+(random()-.5)*12,random()*10,-20+(random()-.5)*12),to=new Vector3(10+(random()-.5)*7,random()*8,-20+(random()-.5)*7);
   const dir=to.subtract(from),length=dir.length();dir.normalize();
   const hit=new Ray(from,dir,length).intersectsMesh(mesh,false),expected=hit.hit&&hit.distance<length-.001;
   assert.equal(meshBlocksSegment(collider,from,to),expected,`ray ${i}`);if(expected)hits++;
  }
  assert.ok(hits>100);
 }finally{scene.dispose();engine.dispose();}
});
test('collision follows shrink, growth, nonuniform scale, yaw, lean and translation',()=>{
 const small=placed(geometry,[.2,.3,.4]);
 assert.equal(meshBlocksCylinder(small,{x:.6,y:0,z:0},.28,1.1),false);
 assert.equal(meshBlocksCylinder(small,{x:.45,y:0,z:0},.28,1.1),true);
 assert.equal(meshBlocksCylinder(small,{x:0,y:.7,z:0},.28,1.1),false);
 assert.equal(meshBlocksCylinder(placed(geometry,[2,2,2]),{x:1.8,y:0,z:0},.28,1.1),true);
 const rotated=placed(geometry,[.2,1,2],[0,Math.PI/2,0],[8,3,-10]);
 assert.equal(meshBlocksCylinder(rotated,{x:9.8,y:3,z:-10},.28,1.1),true);
 assert.equal(meshBlocksCylinder(rotated,{x:8,y:3,z:-9.4},.28,1.1),false);
 const leaned=placed(geometry,[.2,2,.2],[0,0,Math.PI/4]);
 assert.equal(meshBlocksCylinder(leaned,{x:0,y:0,z:.9},.28,1.1),false);
 assert.equal(meshBlocksCylinder(leaned,{x:-1.5,y:1.5,z:0},.28,1.1),true);
});
test('rounded player can clear rotated AABB corners, but not cross or spawn inside a solid',()=>{
 const c=placed(geometry,[1,1,1],[0,Math.PI/4,0]);
 assert.equal(meshBlocksCylinder(c,{x:1.3,y:0,z:1.3},.28,1.1),false);
 assert.equal(meshBlocksCylinder(c,{x:0,y:.2,z:0},.1,.5),true);
 const b={id:'cube',min:c.min,max:c.max,collision:c},query=collisionGrid([b]);
 const p={e:-3,n:0},next=moveWalker(p,6,0,query(p,6,0));
 assert.ok(next.e< -1.5);assert.equal(walkerIsClear(next,[b]),true);
});
test('young tree no longer uses low branches as a solid radius around the lower trunk',()=>{
 const asset=JSON.parse(readFileSync('assets/trees/young-tree/variants.json')).variants[0];
 const p={id:'young',e:0,n:0,y:-.16*.7,yaw:0,width:.4,height:.7,depth:.32,leanX:0,leanZ:0};
 const old=treeCollider(p,asset.trunkRadius),g=collisionGeometry(asset.levels[0]);
 const c=placed(g,[p.width,p.height,p.depth],[p.leanX,p.yaw,p.leanZ],[p.e,p.y,-p.n]),b={...old,collision:c};
 assert.equal(walkerIsClear({e:1.1,n:0},[old]),false);
 assert.equal(walkerIsClear({e:1.1,n:0},[b]),true);
 const start={e:1.1,n:-2},end=moveWalker(start,0,4,collisionGrid([b])(start,0,4));
 assert.ok(end.n>1.9,'walk through the former invisible wall');
 assert.equal(walkerIsClear({e:0,n:0},[b]),false,'actual trunk remains solid');
 assert.equal(meshBlocksCylinder(c,{x:1.1,y:groundHeight(1.1,0),z:0},.28,1.1),false);
});
test('grid uses transformed collision bounds even outside the old footprint; collider is worker-safe',()=>{
 const c=placed(geometry,[2,1,1],[0,0,0],[-16,0,-16]);
 const b={id:'changed-model',min:{x:0,y:0,z:0},max:{x:1,y:1,z:1},collision:c};
 assert.deepEqual(collisionGrid([b])({e:-18.2,n:16},0,0),[b]);
 const copy=structuredClone(b);
 assert.equal(meshBlocksCylinder(copy.collision,{x:-17.8,y:0,z:-16},.28,1.1),true);
});

test('streamed trees use the selected variant and visual scale, independent of world-origin rebasing',async()=>{
 const {Trees}=await import('../src/world/trees.ts');
 const t={id:'world-young',e:100,n:200,h:3,family:2,variant:0,width:.2,scale:.5,yaw:Math.PI/3,radius:20};
 const family={id:'young',collisions:[geometry]},data={tiles:new Map([['tile',{trees:[t]}]]),height:()=>3};
 const trees=new Trees(null,data,{tree:()=>family});
 trees.refresh({e:100,n:200});
 assert.equal(trees.blocked(101,200),false,'stale authored radius does not block empty space');
 assert.equal(trees.blocked(100,200),true);
 trees.rebase({e:96,n:192});
 assert.equal(trees.blocked(101,200),false);assert.equal(trees.blocked(100,200),true);
 const larger={...t,width:2};data.tiles.set('tile',{trees:[larger]});trees.refresh({e:100,n:200});
 assert.equal(trees.blocked(101,200),true,'streamed larger instance grows its collider');
});
