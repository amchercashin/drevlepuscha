import {showcaseBaseHeight,showcaseHeight} from '../domain/showcase.ts';
import type {TreePart} from '../domain/reference-tree.ts';
import {multiply,nlerpQuaternion,trs} from './math.ts';

export interface MeshData {vertices:Float32Array;indices:Uint32Array}

function heightNormal(e:number,n:number,step:number):[number,number,number] {
 const dx=(showcaseBaseHeight(e-step,n)-showcaseBaseHeight(e+step,n))/(2*step);
 const dz=(showcaseBaseHeight(e,n+step)-showcaseBaseHeight(e,n-step))/(2*step);
 const length=Math.hypot(dx,1,dz);
 return [dx/length,1/length,dz/length];
}

export function terrainGeometry():MeshData {
 const minE=-256,maxE=256,minN=-256,maxN=384,step=2;
 const cols=(maxE-minE)/step+1,rows=(maxN-minN)/step+1;
 const vertices=new Float32Array(cols*rows*12),indices=new Uint32Array((cols-1)*(rows-1)*6);
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
  const e=minE+i*step,n=minN+j*step,k=(j*cols+i)*12;
  const normal=heightNormal(e,n,step);
  vertices.set([e,showcaseBaseHeight(e,n),-n,...normal,e/5,n/5,1,1,1,1],k);
 }
 let k=0;for(let j=0;j<rows-1;j++)for(let i=0;i<cols-1;i++){
  const a=j*cols+i,b=a+1,c=a+cols,d=c+1;
  indices.set([a,b,c,b,d,c],k);k+=6;
 }
 return {vertices,indices};
}

/** Local sub-metre triangles share the movement height, with a narrow levelled edge. */
export function detailTerrainGeometry(centerE:number,centerN:number):MeshData {
 const step=.5,half=16,cols=half*2/step+1,rows=cols;
 const baseE=Math.round(centerE/8)*8-half,baseN=Math.round(centerN/8)*8-half;
 const vertices=new Float32Array(cols*rows*12),indices=new Uint32Array((cols-1)*(rows-1)*6);
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
  const e=baseE+i*step,n=baseN+j*step,k=(j*cols+i)*12;
  const edge=Math.min(i,j,cols-1-i,rows-1-j);
  const blend=Math.min(1,edge/4);
  const height=showcaseBaseHeight(e,n)*(1-blend)+showcaseHeight(e,n)*blend+.012;
  const dx=(showcaseHeight(e-0.25,n)-showcaseHeight(e+0.25,n))/.5;
  const dz=(showcaseHeight(e,n+0.25)-showcaseHeight(e,n-0.25))/.5;
  const l=Math.hypot(dx,1,dz);
  vertices.set([e,height,-n,dx/l,1/l,dz/l,e/5,n/5,1,1,1,1],k);
 }
 let k=0;for(let j=0;j<rows-1;j++)for(let i=0;i<cols-1;i++){
  const a=j*cols+i,b=a+1,c=a+cols,d=c+1;
  indices.set([a,b,c,b,d,c],k);k+=6;
 }
 return {vertices,indices};
}

export function treeGeometry(part:TreePart):MeshData {
 const positions=part.positions,normals=part.normals,uvs=part.uvs,colors=part.colors;
 const vertices=new Float32Array(positions.length/3*12);
 const linear=(value:number)=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
 for(let i=0;i<positions.length/3;i++){
  vertices.set([positions[i*3],positions[i*3+1],positions[i*3+2],
   normals?.[i*3]??0,normals?.[i*3+1]??1,normals?.[i*3+2]??0,
   uvs?.[i*2]??0,uvs?.[i*2+1]??0,
   linear(colors?.[i*4]??1),linear(colors?.[i*4+1]??1),linear(colors?.[i*4+2]??1),colors?.[i*4+3]??1],i*12);
 }
 return {vertices,indices:new Uint32Array(part.indices)};
}

interface GltfAccessor {bufferView:number;byteOffset?:number;componentType:number;count:number;type:string}
interface GltfView {byteOffset?:number;byteLength:number;byteStride?:number}
interface GltfNode {name?:string;children?:number[];translation?:number[];rotation?:number[];scale?:number[]}
interface Pose {t:number[];r:number[];s:number[]}
interface Channel {node:number;path:'translation'|'rotation'|'scale';times:Float32Array;values:Float32Array;size:number;first:number;duration:number}
/** Reads the existing ranger's mesh, embedded albedo and skeletal clips from GLB. */
export async function rangerGeometry(url:string):Promise<{mesh:MeshData;image:Blob;pose:(seconds:number,speed:number)=>Float32Array;jointCount:number}> {
 const response=await fetch(url);if(!response.ok)throw new Error(`Следопыт: HTTP ${response.status}`);
 const binary=await response.arrayBuffer(),header=new DataView(binary);
 if(header.getUint32(0,true)!==0x46546c67)throw new Error('Некорректная модель следопыта');
 const jsonLength=header.getUint32(12,true),json=JSON.parse(new TextDecoder().decode(new Uint8Array(binary,20,jsonLength)));
 const chunkOffset=20+jsonLength,binOffset=chunkOffset+8;
 const views=json.bufferViews as GltfView[],accessors=json.accessors as GltfAccessor[];
 const primitive=json.meshes[0].primitives[0];
 const read=(index:number)=>{
  const a=accessors[index],v=views[a.bufferView],width={VEC2:2,VEC3:3,VEC4:4,SCALAR:1,MAT4:16}[a.type as 'VEC2'|'VEC3'|'VEC4'|'SCALAR'|'MAT4'];
  const bytes=a.componentType===5126||a.componentType===5125?4:a.componentType===5123?2:1;
  const stride=v.byteStride??width*bytes;
  const offset=binOffset+(v.byteOffset??0)+(a.byteOffset??0);
  const data=new DataView(binary);
  return (i:number,k:number)=>a.componentType===5126?data.getFloat32(offset+i*stride+k*4,true):a.componentType===5125?data.getUint32(offset+i*stride+k*4,true):a.componentType===5123?data.getUint16(offset+i*stride+k*2,true):data.getUint8(offset+i*stride+k);
 };
 const readArray=(index:number)=>{const accessor=accessors[index],width={VEC2:2,VEC3:3,VEC4:4,SCALAR:1,MAT4:16}[accessor.type as 'VEC2'|'VEC3'|'VEC4'|'SCALAR'|'MAT4'],get=read(index),values=new Float32Array(accessor.count*width);for(let i=0;i<accessor.count;i++)for(let k=0;k<width;k++)values[i*width+k]=get(i,k);return values;};
 const p=read(primitive.attributes.POSITION),n=read(primitive.attributes.NORMAL),uv=read(primitive.attributes.TEXCOORD_0),joint=read(primitive.attributes.JOINTS_0),weight=read(primitive.attributes.WEIGHTS_0);
 const count=accessors[primitive.attributes.POSITION].count,vertices=new Float32Array(count*16);
 for(let i=0;i<count;i++)vertices.set([p(i,0),p(i,1),p(i,2),n(i,0),n(i,1),n(i,2),uv(i,0),uv(i,1),joint(i,0),joint(i,1),joint(i,2),joint(i,3),weight(i,0),weight(i,1),weight(i,2),weight(i,3)],i*16);
 const readIndex=read(primitive.indices),indexCount=accessors[primitive.indices].count,indices=new Uint32Array(indexCount);
 for(let i=0;i<indexCount;i++)indices[i]=readIndex(i,0);
 const texture=json.textures[json.materials[primitive.material].pbrMetallicRoughness.baseColorTexture.index];
 const image=json.images[texture.source],view=views[image.bufferView];
 const bytes=new Uint8Array(binary,binOffset+(view.byteOffset??0),view.byteLength);
 const nodes=json.nodes as GltfNode[],parents=new Int16Array(nodes.length).fill(-1);
 for(let i=0;i<nodes.length;i++)for(const child of nodes[i].children??[])parents[child]=i;
 const defaultPose:Pose[]=nodes.map(node=>({t:[...(node.translation??[0,0,0])],r:[...(node.rotation??[0,0,0,1])],s:[...(node.scale??[1,1,1])]}));
 const clonePose=(source:Pose[])=>source.map(pose=>({t:[...pose.t],r:[...pose.r],s:[...pose.s]}));
 const clips=new Map<string,Channel[]>();
 for(const animation of json.animations){
  const channels:Channel[]=[];
  for(const channel of animation.channels){
   const sampler=animation.samplers[channel.sampler],times=readArray(sampler.input),values=readArray(sampler.output);
   channels.push({node:channel.target.node,path:channel.target.path,times,values,size:channel.target.path==='rotation'?4:3,first:times[0],duration:times[times.length-1]-times[0]});
  }
  clips.set(animation.name,channels);
 }
 function sample(channel:Channel,seconds:number){
  const {times,values,size}=channel;
  const time=channel.duration>0?channel.first+((seconds%channel.duration)+channel.duration)%channel.duration:channel.first;
  let i=0;while(i+1<times.length-1&&times[i+1]<time)i++;
  const next=Math.min(i+1,times.length-1),t=next===i?0:(time-times[i])/(times[next]-times[i]);
  const a=Array.from(values.subarray(i*size,(i+1)*size)),b=Array.from(values.subarray(next*size,(next+1)*size));
  return size===4?nlerpQuaternion(a,b,t):a.map((value,k)=>value+(b[k]-value)*t);
 }
 function applyClip(pose:Pose[],name:string,seconds:number){
  for(const channel of clips.get(name)??[])pose[channel.node][channel.path==='translation'?'t':channel.path==='rotation'?'r':'s']=sample(channel,seconds);
 }
 const idle=clonePose(defaultPose);applyClip(idle,'restpose',0);
 // Relax the authored spread arms with the mean walking orientation.
 for(const channel of clips.get('Walking')??[]){
  if(channel.path!=='rotation'||!/^(Left|Right)(Shoulder|Arm|ForeArm|Hand)$/.test(nodes[channel.node].name??''))continue;
  let mean=sample(channel,channel.first);for(let i=1;i<12;i++)mean=nlerpQuaternion(mean,sample(channel,channel.first+channel.duration*i/12),1/(i+1));
  idle[channel.node].r=mean;
 }
 const skin=json.skins[0],inverses=readArray(skin.inverseBindMatrices),joints=skin.joints as number[];
 const output=new Float32Array(joints.length*16);
 function pose(seconds:number,speed:number){
  const current=clonePose(idle),blend=Math.min(1,Math.max(0,speed)/1.5);
  if(blend>0){
   const moving=clonePose(defaultPose),running=speed>4;
   applyClip(moving,running?'Running':'Walking',seconds*(running?1.4:1));
   for(let i=0;i<current.length;i++){
    for(const key of ['t','s'] as const)for(let k=0;k<3;k++)current[i][key][k]=current[i][key][k]*(1-blend)+moving[i][key][k]*blend;
    current[i].r=nlerpQuaternion(current[i].r,moving[i].r,blend);
   }
  }
  const cache:(Float32Array|undefined)[]=new Array(nodes.length);
  const world=(i:number):Float32Array=>cache[i]??(cache[i]=parents[i]<0?trs(current[i].t,current[i].r,current[i].s):multiply(world(parents[i]),trs(current[i].t,current[i].r,current[i].s)));
  for(let j=0;j<joints.length;j++)output.set(multiply(world(joints[j]),inverses.subarray(j*16,(j+1)*16)),j*16);
  return output;
 }
 return {mesh:{vertices,indices},image:new Blob([bytes],{type:image.mimeType}),pose,jointCount:joints.length};
}
