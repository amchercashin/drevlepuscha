/** Strict importer for static, uncompressed Meshy GLBs; unsupported data fails explicitly. */
import {Matrix,Quaternion,Vector3} from '@babylonjs/core/Maths/math.vector.js';

export function imageSize(bytes,mime){
 if(mime==='image/png')return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
 if(mime==='image/jpeg')for(let i=2;i<bytes.length;){
  if(bytes[i++]!==255)continue;let marker=bytes[i++];while(marker===255)marker=bytes[i++];
  if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;
  const len=bytes.readUInt16BE(i);
  if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return [bytes.readUInt16BE(i+5),bytes.readUInt16BE(i+3)];
  if(len<2)break;i+=len;
 }
 throw new Error('Unsupported or invalid image');
}
export function readMeshyGLB(bytes,heightMeters=18){
 if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('Invalid GLB');
 const jsonLength=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+jsonLength));
 const binStart=28+jsonLength,bin=bytes.subarray(binStart);
 if(bytes.readUInt32LE(24+jsonLength)!==0x004e4942||doc.buffers?.length!==1||doc.buffers[0].uri)throw new Error('Expected embedded GLB buffer');
 if(doc.extensionsRequired?.length||doc.skins?.length||doc.animations?.length)throw new Error('Only static uncompressed meshes are supported');
 const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
 function accessor(index){
  const a=doc.accessors[index],v=doc.bufferViews[a?.bufferView],width=widths[a?.type];
  const readers={5121:['getUint8',1],5123:['getUint16',2],5125:['getUint32',4],5126:['getFloat32',4]},reader=readers[a?.componentType];
  if(!a||!v||!width||!reader||a.sparse||v.buffer!==0)throw new Error('Unsupported accessor');
  const [method,size]=reader,stride=v.byteStride||width*size,base=(v.byteOffset||0)+(a.byteOffset||0),view=new DataView(bin.buffer,bin.byteOffset,bin.byteLength),values=[];
  if(base+(a.count-1)*stride+width*size>(v.byteOffset||0)+v.byteLength)throw new Error('Accessor outside buffer view');
  for(let i=0;i<a.count;i++)for(let c=0;c<width;c++){let n=view[method](base+i*stride+c*size,true);if(a.normalized&&a.componentType!==5126)n/=2**(size*8)-1;if(!Number.isFinite(n))throw new Error('Non-finite geometry');values.push(n);}
  return values;
 }
 const partsByMaterial=new Map(),textures={},textureMimeTypes={},textureInfo=[],doubleSided={};
 function material(index){
  if(partsByMaterial.has(index))return partsByMaterial.get(index);
  const mat=doc.materials[index],pbr=mat?.pbrMetallicRoughness;
  if(!pbr||(mat.alphaMode&&mat.alphaMode!=='OPAQUE')||pbr.baseColorTexture?.texCoord>0||pbr.baseColorTexture?.extensions)throw new Error('Expected opaque base-color material, UV0');
  const name='material-'+index,part={name,positions:[],normals:[],uvs:[],colors:[],indices:[]};partsByMaterial.set(index,part);doubleSided[name]=mat.doubleSided??false;
  const tex=doc.textures?.[pbr.baseColorTexture?.index],im=doc.images?.[tex?.source];
  if(!im||im.uri||!['image/png','image/jpeg'].includes(im.mimeType))throw new Error('Expected embedded PNG/JPEG base color');
  const v=doc.bufferViews[im.bufferView],data=bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);
  textures[name]=data;textureMimeTypes[name]=im.mimeType;textureInfo.push({name,mimeType:im.mimeType,size:imageSize(data,im.mimeType),bytes:data.length});return part;
 }
 function walk(index,parent,ancestors=new Set()){
  if(ancestors.has(index))throw new Error('Cyclic scene graph');const chain=new Set([...ancestors,index]),node=doc.nodes[index];
  const local=node.matrix?Matrix.FromArray(node.matrix):Matrix.Compose(Vector3.FromArray(node.scale||[1,1,1]),Quaternion.FromArray(node.rotation||[0,0,0,1]),Vector3.FromArray(node.translation||[0,0,0]));
  const world=local.multiply(parent),normalMatrix=Matrix.Transpose(Matrix.Invert(world));
  if(node.mesh!==undefined)for(const p of doc.meshes[node.mesh].primitives){
   if((p.mode??4)!==4||p.targets||p.extensions)throw new Error('Expected static triangle primitives');
   const pos=accessor(p.attributes.POSITION),norm=accessor(p.attributes.NORMAL),uv=accessor(p.attributes.TEXCOORD_0),col=p.attributes.COLOR_0===undefined?null:accessor(p.attributes.COLOR_0);
   const count=pos.length/3,colorWidth=col?col.length/count:4;
   const indices=p.indices===undefined?Array.from({length:count},(_,i)=>i):accessor(p.indices);
   if(norm.length!==pos.length||uv.length!==count*2||indices.length%3||indices.some(i=>!Number.isInteger(i)||i<0||i>=count))throw new Error('Invalid attributes or triangle indices');
   const part=material(p.material),offset=part.positions.length/3,factor=doc.materials[p.material].pbrMetallicRoughness.baseColorFactor||[1,1,1,1];
   for(let i=0;i<count;i++){
    part.positions.push(...Vector3.TransformCoordinates(Vector3.FromArray(pos,i*3),world).asArray());
    part.normals.push(...Vector3.TransformNormal(Vector3.FromArray(norm,i*3),normalMatrix).normalize().asArray());
    part.uvs.push(...uv.slice(i*2,i*2+2));for(let c=0;c<4;c++)part.colors.push(factor[c]*(col&&c<colorWidth?col[i*colorWidth+c]:1));
   }
   for(let i=0;i<indices.length;i+=3){const tri=indices.slice(i,i+3);if(world.determinant()<0)[tri[1],tri[2]]=[tri[2],tri[1]];part.indices.push(...tri.map(n=>n+offset));}
  }
  for(const child of node.children||[])walk(child,world,chain);
 }
 for(const node of doc.scenes[doc.scene??0].nodes)walk(node,Matrix.Identity());
 const parts=[...partsByMaterial.values()];if(!parts.length)throw new Error('Empty GLB');
 let minY=Infinity,maxY=-Infinity;for(const p of parts)for(let i=1;i<p.positions.length;i+=3){minY=Math.min(minY,p.positions[i]);maxY=Math.max(maxY,p.positions[i]);}
 if(!(heightMeters>0&&maxY>minY))throw new Error('Invalid tree height');
 const rootMin=[Infinity,Infinity],rootMax=[-Infinity,-Infinity];
 for(const p of parts)for(let i=0;i<p.positions.length;i+=3)if(p.positions[i+1]<=minY+(maxY-minY)*0.05)for(const [j,axis] of [0,2].entries()){rootMin[j]=Math.min(rootMin[j],p.positions[i+axis]);rootMax[j]=Math.max(rootMax[j],p.positions[i+axis]);}
 const origin=[(rootMin[0]+rootMax[0])/2,minY,(rootMin[1]+rootMax[1])/2],scale=heightMeters/(maxY-minY);
 for(const p of parts)for(let i=0;i<p.positions.length;i++)p.positions[i]=(p.positions[i]-origin[i%3])*scale;
 return {parts,textures,textureMimeTypes,textureInfo,doubleSided,normalization:{origin,scale,heightMeters},triangles:parts.reduce((n,p)=>n+p.indices.length/3,0)};
}
