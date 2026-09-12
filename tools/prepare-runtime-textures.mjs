import {readFileSync,writeFileSync,readdirSync,mkdirSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {dirname} from 'node:path';

// cwebp is an authoring tool only; CI ships checked-in copies and verifies hashes.
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):[dir+'/'+e.name]);
const sources=walk('assets').filter(p=>/\/material-0\.jpg$/.test(p)||/^assets\/floor\/.*\.png$/.test(p));
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const entries=[];
for(const source of sources){
 const lossless=/\/(heights|normals|patches)\.png$/.test(source);
 const output=source.replace(/^assets\//,'assets/optimized/').replace(/\.(jpg|png)$/,'.webp');
 mkdirSync(dirname(output),{recursive:true});
 const args=lossless?['-lossless','-exact','-m','6']:['-q','90','-m','6','-sharp_yuv','-alpha_q','100','-exact'];
 const result=spawnSync('cwebp',[...args,source,'-o',output],{encoding:'utf8'});
 if(result.status!==0)throw Error(result.stderr||'Install cwebp to prepare runtime textures');
 entries.push({source,output,mode:lossless?'lossless':'q90',sourceHash:hash(source),outputHash:hash(output),sourceBytes:statSync(source).size,bytes:statSync(output).size});
 console.log(source,statSync(source).size,'→',statSync(output).size,lossless?'lossless':'q90');
}
writeFileSync('assets/runtime-textures.json',JSON.stringify(entries,null,2)+'\n');
