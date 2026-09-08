import type { TreePart } from './reference-tree.ts';
import { TREE_VERSION } from './reference-tree.ts';

/** Minimal glTF 2.0 export for these static, vertex-coloured meshes. Units are metres, Y up. */
export function treeGLB(parts:TreePart[],textures:Partial<Record<string,Uint8Array>>={},version=TREE_VERSION):ArrayBuffer {
  const chunks:Uint8Array[]=[],views:object[]=[],accessors:object[]=[],meshes:object[]=[];
  let offset=0;
  function attribute(values:number[],width:number,type:string,index=false) {
    const array=index?new Uint32Array(values):new Float32Array(values);
    const bytes=new Uint8Array(array.buffer);chunks.push(bytes);
    const view=views.length;views.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target:index?34963:34962});offset+=bytes.length;
    const min=Array.from({length:width},()=>Infinity),max=min.map(()=>-Infinity);
    values.forEach((v,i)=>{min[i%width]=Math.min(min[i%width],v);max[i%width]=Math.max(max[i%width],v);});
    const accessor=accessors.length;accessors.push({bufferView:view,componentType:index?5125:5126,count:values.length/width,type,min,max});return accessor;
  }
  parts.forEach((p,i)=>{
    const attributes={POSITION:attribute(p.positions,3,'VEC3'),NORMAL:attribute(p.normals,3,'VEC3'),COLOR_0:attribute(p.colors,4,'VEC4'),TEXCOORD_0:attribute(p.uvs,2,'VEC2')};
    meshes.push({name:p.name,primitives:[{attributes,indices:attribute(p.indices,1,'SCALAR',true),material:i}]});
  });
  const images:object[]=[],textureDefs:object[]=[],textureIndices:Record<string,number>={};
  for(const [name,data] of Object.entries(textures)){if(!data)continue;const padded=new Uint8Array(Math.ceil(data.length/4)*4);padded.set(data);chunks.push(padded);const bufferView=views.length;views.push({buffer:0,byteOffset:offset,byteLength:data.length});offset+=padded.length;textureIndices[name]=textureDefs.length;textureDefs.push({source:images.length,sampler:0});images.push({bufferView,mimeType:'image/png',name});}
  const doc={asset:{version:'2.0',generator:version},scene:0,scenes:[{nodes:parts.map((_,i)=>i)}],nodes:parts.map((p,i)=>({name:p.name,mesh:i})),meshes,materials:parts.map(p=>({name:p.name,pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:1,...(textureIndices[p.name]!==undefined?{baseColorTexture:{index:textureIndices[p.name]}}:{})}})),buffers:[{byteLength:offset}],bufferViews:views,accessors,images,textures:textureDefs,samplers:[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}],extras:{units:'metres',origin:'root base',source:'Authored interpretation of user-supplied multi-view tree sheet; not photogrammetry',version}};
  const json=new TextEncoder().encode(JSON.stringify(doc)),jsonSize=Math.ceil(json.length/4)*4;
  const result=new ArrayBuffer(12+8+jsonSize+8+offset),view=new DataView(result),bytes=new Uint8Array(result);
  view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,result.byteLength,true);
  view.setUint32(12,jsonSize,true);view.setUint32(16,0x4e4f534a,true);bytes.fill(32,20,20+jsonSize);bytes.set(json,20);
  const bin=20+jsonSize;view.setUint32(bin,offset,true);view.setUint32(bin+4,0x004e4942,true);
  let cursor=bin+8;for(const chunk of chunks){bytes.set(chunk,cursor);cursor+=chunk.length;}return result;
}
