import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from './build.mjs';
import {inspectGlb} from './glb.mjs';
export function validateAssets(manifest,production=false){
 if(production&&(manifest.status!=='accepted'||!manifest.species?.every(s=>s.review==='accepted')))throw Error('No accepted wildlife assets. Candidate and test models are not production assets.');
 if(manifest.status==='test-only')return [];
 if(manifest.v!==1||!['candidate','accepted'].includes(manifest.status)||!manifest.species?.length||manifest.species.length>3)throw Error('Invalid wildlife asset manifest');
 const settings={'woodland-bird':{tri:[1200,500,160],joints:16,bytes:600000,texture:512,clips:['perch_idle','alert','takeoff','fly_loop']},'red-squirrel':{tri:[3000,1200,350],joints:28,bytes:2200000,texture:1024,clips:['forage_idle','alert','bound_ground','mount_trunk','climb_up','trunk_idle']},'roe-deer':{tri:[5000,2000,600],joints:32,bytes:2400000,texture:1024,clips:['graze_idle','alert','walk_loop','run_loop']}};
 return manifest.species.flatMap(bird=>{const budget=settings[bird.id],budgets=budget?.tri;if(!budget||bird.lods?.length!==3)throw Error('Invalid bird LODs');
 return bird.lods.map((lod,i)=>{
  if(lod.level!==i||lod.file!==`${bird.id}/lod${i}.glb`)throw Error('Invalid asset path');
  const path=new URL(`../../public/wildlife/${lod.file}`,import.meta.url),bytes=readFileSync(path),actual=inspectGlb(path);
  if(createHash('sha256').update(bytes).digest('hex')!==lod.sha256)throw Error('Asset hash mismatch');
  for(const key of Object.keys(actual))if(JSON.stringify(actual[key])!==JSON.stringify(lod[key]))throw Error(`Stale asset metric ${key}`);
  if(actual.triangles>budgets[i]||actual.triangles<1||actual.materials!==1||actual.primitives!==1||actual.joints>budget.joints||actual.joints<1||actual.weighted!==actual.vertices||actual.bytes>budget.bytes||actual.images.length!==1||actual.images[0].width!==budget.texture||actual.images[0].height!==budget.texture)throw Error(`${bird.id} asset budget exceeded`);
  if(actual.clips.length!==budget.clips.length)throw Error('Unexpected clip count');
  for(const name of budget.clips){const clip=actual.clips.find(c=>c.name===name);if(!clip||Math.abs(clip.duration-bird.clips[name].duration)>1e-5||clip.tracks!==actual.joints*3)throw Error(`Invalid clip ${name}`);}
  return {species:bird.id,lod:i,triangles:actual.triangles,joints:actual.joints,bytes:actual.bytes};
 });});
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/validate-assets.mjs')){
 build(true);const manifest=JSON.parse(readFileSync(new URL('../../public/wildlife/assets.json',import.meta.url),'utf8'));
 console.log(JSON.stringify({status:manifest.status,assets:validateAssets(manifest,process.argv.includes('--production')),visualAcceptance:manifest.status==='accepted'}));
}
