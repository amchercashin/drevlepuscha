import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from './build.mjs';
import {inspectGlb} from './glb.mjs';
export function validateAssets(manifest,production=false){
 if(production&&(manifest.status!=='accepted'||!manifest.species?.every(s=>s.review==='accepted')))throw Error('No accepted wildlife assets. Candidate and test models are not production assets.');
 if(manifest.status==='test-only')return [];
 if(manifest.v!==1||!['candidate','accepted'].includes(manifest.status)||manifest.species?.length!==1)throw Error('Invalid wildlife asset manifest');
 const bird=manifest.species[0],budgets=[1200,500,160];if(bird.id!=='woodland-bird'||bird.lods?.length!==3)throw Error('Invalid bird LODs');
 return bird.lods.map((lod,i)=>{
  if(lod.level!==i||lod.file!==`woodland-bird/lod${i}.glb`)throw Error('Invalid asset path');
  const path=new URL(`../../public/wildlife/${lod.file}`,import.meta.url),bytes=readFileSync(path),actual=inspectGlb(path);
  if(createHash('sha256').update(bytes).digest('hex')!==lod.sha256)throw Error('Asset hash mismatch');
  for(const key of Object.keys(actual))if(JSON.stringify(actual[key])!==JSON.stringify(lod[key]))throw Error(`Stale asset metric ${key}`);
  if(actual.triangles>budgets[i]||actual.triangles<1||actual.materials!==1||actual.primitives!==1||actual.joints>16||actual.joints<1||actual.weighted!==actual.vertices||actual.bytes>600000||actual.images.length!==1||actual.images[0].width!==512||actual.images[0].height!==512)throw Error('Bird asset budget exceeded');
  if(actual.clips.length!==4)throw Error('Expected four bird clips');
  for(const name of ['perch_idle','alert','takeoff','fly_loop']){const clip=actual.clips.find(c=>c.name===name);if(!clip||Math.abs(clip.duration-bird.clips[name].duration)>1e-5||clip.tracks!==actual.joints*3)throw Error(`Invalid clip ${name}`);}
  return {lod:i,triangles:actual.triangles,joints:actual.joints,bytes:actual.bytes};
 });
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/validate-assets.mjs')){
 build(true);const manifest=JSON.parse(readFileSync(new URL('../../public/wildlife/assets.json',import.meta.url),'utf8'));
 console.log(JSON.stringify({status:manifest.status,assets:validateAssets(manifest,process.argv.includes('--production')),visualAcceptance:manifest.status==='accepted'}));
}
