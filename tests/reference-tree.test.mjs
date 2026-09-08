import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createReferenceTree} from '../src/domain/reference-tree.ts';
import {treeGLB} from '../src/domain/tree-glb.ts';
const parts=createReferenceTree();
test('tree has finite indexed geometry, valid normals and the intended metre scale',()=>{
 let minY=Infinity,maxY=-Infinity,triangles=0;
 for(const p of parts){const vertices=p.positions.length/3;triangles+=p.indices.length/3;assert.equal(p.normals.length,p.positions.length);assert.equal(p.colors.length,vertices*4);assert.equal(p.uvs.length,vertices*2);assert.ok(p.positions.every(Number.isFinite));assert.ok(p.colors.every(v=>v>=0&&v<=1));assert.ok(p.indices.every(i=>Number.isInteger(i)&&i>=0&&i<vertices));for(let i=0;i<vertices;i++){const y=p.positions[i*3+1];minY=Math.min(minY,y);maxY=Math.max(maxY,y);assert.ok(Math.abs(Math.hypot(...p.normals.slice(i*3,i*3+3))-1)<1e-5);}}
 assert.ok(minY>-0.7&&minY<0);assert.ok(maxY>18&&maxY<20);assert.ok(triangles<20000);
});
test('authored tree stays deterministic and standalone GLB export matches its source',()=>{
 assert.deepEqual(createReferenceTree(),parts);
 const textures=Object.fromEntries(['bark','canopy'].map(n=>[n,new Uint8Array(readFileSync(`assets/trees/${n}.png`))]));
 const bytes=treeGLB(parts,textures),view=new DataView(bytes);assert.equal(view.getUint32(0,true),0x46546c67);assert.equal(view.getUint32(8,true),bytes.byteLength);
 const length=view.getUint32(12,true),doc=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,length)));assert.equal(doc.asset.version,'2.0');assert.equal(doc.meshes.length,parts.length);assert.equal(doc.images.length,2);const bin=28+length;assert.equal(doc.buffers[0].byteLength,bytes.byteLength-bin);
 for(const v of doc.bufferViews){assert.equal(v.byteOffset%4,0);assert.ok(v.byteOffset+v.byteLength<=doc.buffers[0].byteLength);}
 doc.meshes.forEach((mesh,i)=>{const a=doc.accessors[mesh.primitives[0].attributes.POSITION],v=doc.bufferViews[a.bufferView];const exported=new Float32Array(bytes,bin+v.byteOffset,a.count*3);assert.deepEqual(exported,new Float32Array(parts[i].positions));});
 assert.deepEqual(new Uint8Array(readFileSync('assets/trees/reference-tree-v1.glb')),new Uint8Array(bytes));
});
