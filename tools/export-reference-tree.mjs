import './generate-tree-textures.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {createReferenceTree,TREE_VERSION} from '../src/domain/reference-tree.ts';
import {treeGLB} from '../src/domain/tree-glb.ts';
const parts=createReferenceTree();
const textures=Object.fromEntries(['bark','canopy'].map(name=>[name,new Uint8Array(readFileSync(`assets/trees/${name}.png`))]));
const result=treeGLB(parts,textures);
writeFileSync(`assets/trees/${TREE_VERSION}.glb`,new Uint8Array(result));
console.log(`${TREE_VERSION}: ${parts.reduce((s,p)=>s+p.indices.length/3,0)} triangles, ${parts.length} materials, ${result.byteLength} bytes.`);
