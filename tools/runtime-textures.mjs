import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(readFileSync(resolve(root,'assets/runtime-textures.json'),'utf8'));
const replacements=new Map(manifest.map(entry=>[resolve(root,entry.source),entry]));
const verified=new Set();
/** Both Vite and world packs use the same versioned, checked runtime copies. */
export function runtimeTexture(source){
 const path=resolve(source),entry=replacements.get(path);if(!entry)return path;
 if(!verified.has(path)){
  for(const [file,hash] of [[path,entry.sourceHash],[resolve(root,entry.output),entry.outputHash]]){
   if(createHash('sha256').update(readFileSync(file)).digest('hex')!==hash)throw Error(`Texture changed: ${file}. Run npm run textures:prepare.`);
  }
  verified.add(path);
 }
 return resolve(root,entry.output);
}
export function runtimeTexturesPlugin(){return {
 name:'runtime-textures',enforce:'pre',
 resolveId(source,importer){
  if(!importer||!(/\.(png|jpe?g)(\?.*)?$/.test(source)))return;
  const [file,query]=source.split('?'),absolute=resolve(dirname(importer.split('?')[0]),file);
  const optimized=runtimeTexture(absolute);
  if(optimized!==absolute)return optimized+(query?'?'+query:'');
 },
};}
