// Authoring step on macOS (sips); CI ships the checked-in result. Keep the source GLB.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const source=readFileSync('assets/characters/ranger/meshy.glb');
const jsonLength=source.readUInt32LE(12),g=JSON.parse(source.subarray(20,20+jsonLength));
assert.equal(g.buffers.length,1);assert.equal(g.extensionsUsed,undefined);
const binary=source.subarray(28+jsonLength),oldAccessors=g.accessors,oldViews=g.bufferViews;
g.animations=g.animations.filter(a=>['restpose','Walking','Running'].includes(a.name));
assert.equal(g.animations.length,3);
const accessorMap=new Map(),accessors=[];
function accessor(old){if(!accessorMap.has(old)){accessorMap.set(old,accessors.length);accessors.push(structuredClone(oldAccessors[old]));}return accessorMap.get(old);}
for(const m of g.meshes)for(const p of m.primitives){
 p.indices=accessor(p.indices);
 for(const attributes of [p.attributes,...(p.targets??[])])for(const key in attributes)attributes[key]=accessor(attributes[key]);
}
for(const s of g.skins)if(s.inverseBindMatrices!==undefined)s.inverseBindMatrices=accessor(s.inverseBindMatrices);
for(const a of g.animations)for(const s of a.samplers){s.input=accessor(s.input);s.output=accessor(s.output);}
const viewMap=new Map(),views=[],chunks=[];let offset=0;
function view(old,replacement){
 if(viewMap.has(old))return viewMap.get(old);
 const v=oldViews[old],bytes=replacement??binary.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);
 const id=views.length;views.push({...v,byteOffset:offset,byteLength:bytes.length});viewMap.set(old,id);
 const padding=Buffer.alloc((4-bytes.length%4)%4);chunks.push(bytes,padding);offset+=bytes.length+padding.length;return id;
}
for(const a of accessors){assert.equal(a.sparse,undefined);a.bufferView=view(a.bufferView);}
const temp=mkdtempSync(join(tmpdir(),'ranger-runtime-'));
try{
 for(const [i,image] of g.images.entries()){
  assert.equal(image.mimeType,'image/jpeg');const v=oldViews[image.bufferView];
  const input=join(temp,`${i}.jpg`),output=join(temp,`${i}-1024.jpg`);
  writeFileSync(input,binary.subarray(v.byteOffset,v.byteOffset+v.byteLength));
  execFileSync('sips',['-Z','1024','-s','formatOptions','90',input,'--out',output],{stdio:'pipe'});
  image.bufferView=view(image.bufferView,readFileSync(output));
 }
}finally{rmSync(temp,{recursive:true,force:true});}
g.accessors=accessors;g.bufferViews=views;g.buffers=[{byteLength:offset}];
const text=Buffer.from(JSON.stringify(g)),json=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]),bin=Buffer.concat(chunks);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4);
const output=Buffer.concat([header,json,binHeader,bin]);writeFileSync('assets/characters/ranger/runtime.glb',output);
console.log(`Ranger: ${source.length} → ${output.length} bytes; same geometry/rig, 3 clips, 1024px JPEG q90.`);
