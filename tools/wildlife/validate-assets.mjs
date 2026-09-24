import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {compile} from './build.mjs';
import {inspectGlb} from './glb.mjs';
function validateContent(){
 const {data,hashes}=compile();
 const stored=readFileSync(new URL('../../public/wildlife/content/showcase/bird.json',import.meta.url),'utf8');
 const manifest=JSON.parse(readFileSync(new URL('../../public/wildlife/content/manifest.json',import.meta.url),'utf8'));
 const digest=createHash('sha256').update(stored).digest('hex');
 const expectedManifest={v:1,status:'test-content',...data.identity,file:'showcase/bird.json',sha256:digest,sourceHashes:hashes};
 if(!isDeepStrictEqual(manifest,expectedManifest))throw Error('Stale wildlife content manifest; run npm run wildlife:build');
 // Obstacle heights can differ by a few floating-point ULPs across platforms.
 function compare(saved,compiled,path=''){
  if(typeof saved==='number'&&typeof compiled==='number'){
   if(saved===compiled||/^\.cells\[\d+\]\.obstacles\[\d+\]\.(min|max)\.h$/.test(path)&&Math.abs(saved-compiled)<=4e-15)return;
   throw Error(`Stale wildlife content at ${path}`);
  }
  if(Array.isArray(saved)&&Array.isArray(compiled)&&saved.length===compiled.length){saved.forEach((value,i)=>compare(value,compiled[i],`${path}[${i}]`));return;}
  if(saved&&compiled&&typeof saved==='object'&&typeof compiled==='object'&&isDeepStrictEqual(Object.keys(saved).sort(),Object.keys(compiled).sort())){for(const key of Object.keys(saved))compare(saved[key],compiled[key],`${path}.${key}`);return;}
  if(!isDeepStrictEqual(saved,compiled))throw Error(`Stale wildlife content at ${path}`);
 }
 compare(JSON.parse(stored),data);
}
export function validateAssets(manifest,production=false){
 if(production&&(manifest.status!=='accepted'||![...manifest.species??[],...manifest.decorative??[]].every(s=>s.review==='accepted')))throw Error('No accepted wildlife assets. Candidate and test models are not production assets.');
 if(manifest.status==='test-only')return [];
 if(manifest.v!==1||!['candidate','accepted'].includes(manifest.status)||!manifest.species?.length||manifest.species.length>3)throw Error('Invalid wildlife asset manifest');
 const settings={'woodland-bird':{tri:[1200,500,160],joints:16,bytes:600000,texture:512,clips:['perch_idle','alert','takeoff','fly_loop']},'red-squirrel':{tri:[3000,1200,350],joints:28,bytes:2200000,texture:1024,clips:['forage_idle','alert','bound_ground','mount_trunk','climb_up','trunk_idle']},'roe-deer':{tri:[5000,2000,600],joints:32,bytes:2400000,texture:1024,clips:['graze_idle','alert','walk_loop','run_loop']}};
 settings['woodland-butterfly']={tri:[200],joints:3,bytes:180000,texture:256,clips:['flutter']};
 return [...manifest.species,...manifest.decorative??[]].flatMap(bird=>{const budget=settings[bird.id],budgets=budget?.tri;if(!budget||bird.lods?.length!==budgets?.length)throw Error('Invalid bird LODs');
 return bird.lods.map((lod,i)=>{
  if(lod.level!==i||lod.file!==(bird.id==='woodland-butterfly'?'woodland-butterfly/model.glb':`${bird.id}/lod${i}.glb`))throw Error('Invalid asset path');
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
 validateContent();const manifest=JSON.parse(readFileSync(new URL('../../public/wildlife/assets.json',import.meta.url),'utf8'));
 validateAudio(JSON.parse(readFileSync(new URL('../../config/wildlife/audio.json',import.meta.url),'utf8')),process.argv.includes('--production'));
 console.log(JSON.stringify({status:manifest.status,assets:validateAssets(manifest,process.argv.includes('--production')),visualAcceptance:manifest.status==='accepted'}));
}

export function validateAudio(manifest,production=false){
 if(manifest.v!==1||manifest.assets?.length!==2||production&&manifest.status!=='accepted')throw Error('Unaccepted or invalid wildlife audio');
 for(const a of manifest.assets){if(!/^WL[SD]01-[a-f0-9]{12}\.opus$/.test(a.file)||a.basePath!=='wildlife/audio')throw Error('Invalid audio path');const b=readFileSync(new URL('../../public/wildlife/audio/'+a.file,import.meta.url));if(b.length!==a.bytes||createHash('sha256').update(b).digest('hex')!==a.sha256)throw Error('Audio hash mismatch');let at=0,last=0,pre=0,channels=0;while(at<b.length){if(b.toString('ascii',at,at+4)!=='OggS')throw Error('Invalid Ogg page');last=Number(b.readBigUInt64LE(at+6));const n=b[at+26],start=at+27+n,size=Array.from(b.subarray(at+27,start)).reduce((a,b)=>a+b,0);if(b.toString('ascii',start,start+8)==='OpusHead'){channels=b[start+9];pre=b.readUInt16LE(start+10);}at=start+size;}if(channels!==1||Math.abs((last-pre)/48000-a.duration)>.001||b.length>64000||a.processing.tailTrimSeconds!==0)throw Error('Audio budget or duration mismatch');}
 return true;
}
