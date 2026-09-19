import {readFileSync} from 'node:fs';
export function readGlb(path){
 const bytes=readFileSync(path);if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB header');
 let json,bin;for(let at=12;at<bytes.length;){const size=bytes.readUInt32LE(at),type=bytes.readUInt32LE(at+4),chunk=bytes.subarray(at+8,at+8+size);if(chunk.length!==size)throw Error('Truncated GLB');if(type===0x4e4f534a)json=JSON.parse(chunk.toString('utf8'));if(type===0x004e4942)bin=chunk;at+=8+size;}
 if(!json||!bin)throw Error('GLB needs JSON and BIN');
 function accessor(index){const a=json.accessors[index];if(!a||a.sparse||a.bufferView===undefined)throw Error('Unsupported accessor');const v=json.bufferViews[a.bufferView],width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type],size={5121:1,5123:2,5125:4,5126:4}[a.componentType];if(!width||!size)throw Error('Unsupported accessor type');const stride=v.byteStride??width*size,base=(v.byteOffset??0)+(a.byteOffset??0),out=[];
  const read={5121:o=>bin.readUInt8(o),5123:o=>bin.readUInt16LE(o),5125:o=>bin.readUInt32LE(o),5126:o=>bin.readFloatLE(o)}[a.componentType];
  for(let i=0;i<a.count;i++){const row=[];for(let j=0;j<width;j++){let n=read(base+i*stride+j*size);if(!Number.isFinite(n))throw Error('Nonfinite accessor');if(a.normalized)n/=a.componentType===5121?255:65535;row.push(n);}out.push(row);}return out;
 }
 return {bytes,json,bin,accessor};
}
export function inspectGlb(path){
 const {bytes,json:g,bin,accessor}=readGlb(path);
 if((g.buffers??[]).some(b=>b.uri)||(g.images??[]).some(i=>i.uri))throw Error('External wildlife URI is forbidden');
 if(g.cameras?.length||g.extensions?.KHR_lights_punctual)throw Error('Export contains cameras/lights');
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let triangles=0,vertices=0,primitives=0,weighted=0;
 for(const mesh of g.meshes??[])for(const p of mesh.primitives){
  if((p.mode??4)!==4)throw Error('Wildlife must be triangles');primitives++;const positions=accessor(p.attributes.POSITION);vertices+=positions.length;
  for(const v of positions)for(let k=0;k<3;k++){min[k]=Math.min(min[k],v[k]);max[k]=Math.max(max[k],v[k]);}
  const indices=p.indices===undefined?positions.map((_,i)=>[i]):accessor(p.indices);if(indices.length%3||indices.some(i=>i[0]>=positions.length))throw Error('Invalid triangle indices');triangles+=indices.length/3;
  if(p.attributes.WEIGHTS_1!==undefined||p.attributes.JOINTS_1!==undefined)throw Error('More than four skin influences');
  if(p.attributes.WEIGHTS_0!==undefined){const weights=accessor(p.attributes.WEIGHTS_0),joints=accessor(p.attributes.JOINTS_0),jointCount=Math.max(...g.skins.map(s=>s.joints.length));
   for(let i=0;i<weights.length;i++){if(Math.abs(weights[i].reduce((a,b)=>a+b,0)-1)>.002||weights[i].some(w=>w<0)||joints[i].some(j=>j>=jointCount))throw Error('Invalid skin weights');}weighted+=weights.length;
  }
 }
 const clips=(g.animations??[]).map(a=>{let duration=0;for(const channel of a.channels){const sampler=a.samplers[channel.sampler],times=accessor(sampler.input).flat(),values=accessor(sampler.output);if(times.some((t,i)=>t<0||(i>0&&t<=times[i-1])))throw Error('Invalid animation times');duration=Math.max(duration,...times);const node=g.nodes[channel.target.node];if(node.name==='root'&&channel.target.path==='translation'&&values.some(v=>v.some((n,k)=>Math.abs(n-values[0][k])>1e-6)))throw Error('Root motion is forbidden');}return {name:a.name,duration,tracks:a.channels.length};});
 const images=(g.images??[]).map(i=>{const v=g.bufferViews[i.bufferView],image=bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);if(i.mimeType!=='image/png'||image.toString('hex',0,8)!=='89504e470d0a1a0a')throw Error('Expected embedded PNG atlas');return {width:image.readUInt32BE(16),height:image.readUInt32BE(20)};});
 return {bytes:bytes.length,triangles,vertices,primitives,materials:g.materials?.length??0,joints:Math.max(0,...(g.skins??[]).map(s=>s.joints.length)),weighted,bounds:{min,max},images,clips};
}
