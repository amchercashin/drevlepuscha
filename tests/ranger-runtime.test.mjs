import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const parse=path=>{const b=readFileSync(path),length=b.readUInt32LE(12);return {json:JSON.parse(b.subarray(20,20+length)),binary:b.subarray(28+length),bytes:b.length};};
test('runtime ranger preserves geometry and rig while pruning unused clips and image bytes',()=>{
 const a=parse('assets/characters/ranger/meshy.glb'),b=parse('assets/characters/ranger/runtime.glb');
 assert.ok(b.bytes<a.bytes*.35);assert.deepEqual(b.json.nodes,a.json.nodes);
 assert.deepEqual(b.json.animations.map(a=>a.name).sort(),['Running','Walking','restpose']);
 function bytes(asset,index){const ac=asset.json.accessors[index],v=asset.json.bufferViews[ac.bufferView];return asset.binary.subarray(v.byteOffset,v.byteOffset+v.byteLength);}
 for(let i=0;i<a.json.meshes.length;i++)for(let k=0;k<a.json.meshes[i].primitives.length;k++){
  const x=a.json.meshes[i].primitives[k],y=b.json.meshes[i].primitives[k];
  assert.deepEqual(bytes(a,x.indices),bytes(b,y.indices));
  for(const key in x.attributes)assert.deepEqual(bytes(a,x.attributes[key]),bytes(b,y.attributes[key]));
 }
 for(const [i,s] of a.json.skins.entries())assert.deepEqual(bytes(a,s.inverseBindMatrices),bytes(b,b.json.skins[i].inverseBindMatrices));
 for(const clip of b.json.animations){
  const source=a.json.animations.find(c=>c.name===clip.name);assert.deepEqual(clip.channels,source.channels);
  for(const [i,s] of clip.samplers.entries())for(const field of ['input','output'])assert.deepEqual(bytes(a,source.samplers[i][field]),bytes(b,s[field]));
 }
});
