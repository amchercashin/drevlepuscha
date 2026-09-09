import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readMeshyGLB} from './meshy-glb.mjs';
const base='assets/rocks/moss-boulder',source=readFileSync(base+'/source.glb');
const data=readMeshyGLB(source,.8);
if(data.parts.length!==1||data.triangles>900||data.textureInfo.some(t=>Math.max(...t.size)>2048))throw new Error('Boulder exceeds one material / 900 triangles / 2K budget');
for(const [name,bytes] of Object.entries(data.textures))writeFileSync(base+'/'+name+(data.textureMimeTypes[name]==='image/jpeg'?'.jpg':'.png'),bytes);
writeFileSync(base+'/rock.json',JSON.stringify({version:'moss-boulder-v1',sourceHash:createHash('sha256').update(source).digest('hex'),triangles:data.triangles,normalization:data.normalization,textureInfo:data.textureInfo,parts:data.parts}));
console.log(JSON.stringify({triangles:data.triangles,textures:data.textureInfo}));
