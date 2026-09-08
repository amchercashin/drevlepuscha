/** Reproducible build-time cache. One authored source, no runtime decimation or new dependency. */
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {Scene} from '@babylonjs/core/scene.js';
import {Mesh} from '@babylonjs/core/Meshes/mesh.js';
import {VertexData} from '@babylonjs/core/Meshes/mesh.vertexData.js';
import {QuadraticErrorSimplification} from '@babylonjs/core/Meshes/meshSimplification.js';
import {createReferenceTree} from '../src/domain/reference-tree.ts';
import {canopyProxy} from './canopy-proxy.mjs';
import {treeGLB} from '../src/domain/tree-glb.ts';
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
const source=createReferenceTree();
const merged=['bark','canopy'].map(name=>({name,positions:[],normals:[],uvs:[],colors:[],indices:[]}));
for(const p of source){const target=merged[p.name==='canopy'?1:0],offset=target.positions.length/3;for(const key of ['positions','normals','colors'])target[key].push(...p[key]);target.uvs.push(...(p.name==='bark'||p.name==='canopy'?p.uvs:p.uvs.map(()=>0)));target.indices.push(...p.indices.map(i=>i+offset));}
const count=parts=>parts.reduce((n,p)=>n+p.indices.length/3,0);
async function simplify(parts,quality){const result=[];for(const p of parts){const mesh=new Mesh(p.name,scene),data=new VertexData();Object.assign(data,p);data.applyToMesh(mesh);const reduced=await new Promise(resolve=>new QuadraticErrorSimplification(mesh).simplify({quality,distance:0,optimizeMesh:true},resolve));const part={name:p.name,positions:Array.from(reduced.getVerticesData('position')),normals:Array.from(reduced.getVerticesData('normal')),uvs:Array.from(reduced.getVerticesData('uv')),colors:Array.from(reduced.getVerticesData('color')),indices:Array.from(reduced.getIndices())};for(let i=0;i<part.normals.length;i+=3){const length=Math.hypot(...part.normals.slice(i,i+3));for(let j=0;j<3;j++)part.normals[i+j]/=length||1;}result.push(part);reduced.dispose();mesh.dispose();}return result;}
const near=await simplify(merged,0.25);
const canopy=source.find(p=>p.name==='canopy');
const middle=[...(await simplify([near[0]],0.24)),canopyProxy(canopy,14,8,4)];
const far=[...(await simplify([near[0]],0.05)),canopyProxy(canopy,6,6,3)];
const levels=[near,middle,far];
if(count(near)>5000||count(middle)>1500||count(far)>300)throw new Error('Tree exceeds its budget');
const cache={version:'game-tree-v1',algorithm:'babylon-9.25.0-qem-crown-clusters-v2',sourceHash:createHash('sha256').update(JSON.stringify(source)).digest('hex'),triangles:levels.map(count),levels};
writeFileSync('assets/trees/game/tree.json',JSON.stringify(cache));
const textures=Object.fromEntries(['bark','canopy'].map(n=>[n,new Uint8Array(readFileSync(`assets/trees/${n}.png`))]));
writeFileSync('assets/trees/game/tree.glb',new Uint8Array(treeGLB(near,textures,cache.version)));
console.log(JSON.stringify({triangles:cache.triangles,materials:near.length,sourceHash:cache.sourceHash}));
scene.dispose();engine.dispose();
