import {mkdirSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
// Authoring-only cwebp; original images and world texture manifests stay intact.
const sources=[["oak", "trees/meshy-a/material-0.jpg"], ["fork", "trees/fork-oak/material-0.jpg"], ["young", "trees/young-tree/material-0.jpg"], ["rock", "rocks/moss-boulder/material-0.jpg"], ["log", "props/fallen-log/material-0.jpg"], ["stump", "props/old-stump/material-0.jpg"], ["slab", "props/slate-slab/material-0.jpg"], ["soil", "floor/soil.png"], ["foliage", "floor/foliage.png"]];
mkdirSync('assets/optimized/showcase',{recursive:true});
for(const [name,path] of sources){const size=['soil','foliage'].includes(name)?768:1024;const out=`assets/optimized/showcase/${name}.webp`;execFileSync('cwebp',['-resize',String(size),String(size),'-q','82','-m','6','-alpha_q','100','-exact',`assets/${path}`,'-o',out],{stdio:'pipe'});console.log(name,statSync(out).size);}
