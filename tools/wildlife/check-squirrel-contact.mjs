import {showcaseHeight} from '../../src/domain/showcase.ts';
import {landEpisode} from './land-build.mjs';import {contactEvidence} from './contact-evidence.mjs';
import {readFileSync,writeFileSync} from 'node:fs';import {sceneData} from './scene-data.mjs';import {surfaceHit} from './surface.mjs';import {sampleRoute,routeMotion,transformAnchor,routeBasis} from '../../src/domain/wildlife/routes.ts';
import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';
const read=p=>JSON.parse(readFileSync(p)),guide=read('config/wildlife/squirrel-rig-guide.json');
export function analyzeSquirrelContact(route,scene,tracksOverride){
const tracks=tracksOverride??read('.artwork/wildlife/squirrel-01/contact-tracks.json');
const footOffset=read('public/wildlife/assets.json').species.find(s=>s.id==='red-squirrel').footOffsetM;
const tree=scene.catalog.get(route.treeId),collider=scene.boxes.find(b=>b.id===route.treeId).collision;
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>{const l=Math.hypot(...a);return a.map(v=>v/l);},dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),xyz=p=>[p[0],p[2],-p[1]];
let maxGap=0,maxPenetration=0,missing=0,count=0;const failures=[];
const start=route.motion.find(k=>k.state==='climb').atMs,end=route.motion.at(-1).atMs,clip='climb_up',duration=guide.clips[clip],frames=tracks.clips[clip];
for(let t=start;t<end;t+=20){const d=routeMotion(route,t).distanceM,s=sampleRoute(route,d),a=sampleRoute(route,Math.max(0,d-.02)).point,b=sampleRoute(route,Math.min(route.lengthM,d+.02)).point,up=s.normal,raw=[b.e-a.e,b.n-a.n,b.h-a.h],forward=norm(raw.map((v,i)=>v-up[i]*dot(raw,up))),right=norm(cross(up,forward)),pose=frames[Math.round(((t-start)/1000%duration)*tracks.fps)],phase=((t-start)/1000/duration)%1;
 for(const [foot,p] of Object.entries(pose)){
  const [limb,,side]=foot.split('.'),shift=(limb==='front'?0:.5)+(side==='L'?0:.5);if((phase+shift)%1>=guide.locomotion[clip].stance)continue;
  const position=[s.point.e,s.point.n,s.point.h].map((v,i)=>v+right[i]*p[0]-forward[i]*p[1]+up[i]*(p[2]+footOffset)),hit=surfaceHit(collider,xyz(position.map((v,i)=>v+up[i]*.25)),xyz(position.map((v,i)=>v-up[i]*.25)));count++;
  if(!hit){missing++;continue;}const world=transformAnchor(hit.point,hit.normal,tree.modelToAbsoluteXYZ).point,gap=dot(position.map((v,i)=>v-[world.e,world.n,world.h][i]),up);maxGap=Math.max(maxGap,gap);maxPenetration=Math.max(maxPenetration,-gap);if(Math.abs(gap)>.03)failures.push({t,foot,gap});
 }
}
const result={status:missing||maxGap>.03||maxPenetration>.005?'needs-contact-correction':'numeric-contact-pass',samples:count,missing,maxGapM:maxGap,maxPenetrationM:maxPenetration,failures:failures.slice(0,8)};return result;
}
export function analyzeGroundContact(route,tracks){
 const art=read('public/wildlife/assets.json').species.find(s=>s.id==='red-squirrel'),clip='bound_ground',duration=guide.clips[clip],poses=tracks.clips[clip];let maxGap=0,maxPenetration=0,count=0;
 for(let t=0;t<route.motion[1].atMs;t+=20){const d=routeMotion(route,t).distanceM,s=sampleRoute(route,d),{right,forward,up}=routeBasis(route,d),phase=(t/1000/duration)%1,pose=poses[Math.round((t/1000%duration)*tracks.fps)];
  for(const [foot,p] of Object.entries(pose)){const [limb,,side]=foot.split('.'),shift=(limb==='front'?0:.5)+(side==='L'?0:.08);if((phase+shift)%1>=guide.locomotion[clip].stance)continue;
   const xyz=[s.point.e,s.point.n,s.point.h].map((v,i)=>v+right[i]*p[0]-forward[i]*p[1]+up[i]*(p[2]+art.footOffsetM)),gap=xyz[2]-showcaseHeight(xyz[0],xyz[1]);maxGap=Math.max(maxGap,gap);maxPenetration=Math.max(maxPenetration,-gap);count++;
  }
 }
 return {samples:count,maxGapM:maxGap,maxPenetrationM:maxPenetration};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const scene=sceneData();for(const path of ['config/wildlife/squirrel-site.json','config/wildlife/squirrel-relocated-site.json']){
  const config=read(path),route=landEpisode(config,scene,'contact-check').routes[0],contacts=[0,1,2].map(lod=>({lod,...analyzeSquirrelContact(route,scene,read('.artwork/wildlife/squirrel-01/contact-tracks'+(lod?'-lod'+lod:'')+'.json'))}));
  if(contacts.some(c=>c.status!=='numeric-contact-pass'))throw Error(JSON.stringify({site:config.id,contacts}));
  const ground=[0,1,2].map(lod=>({lod,...analyzeGroundContact(route,read('.artwork/wildlife/squirrel-01/contact-tracks'+(lod?'-lod'+lod:'')+'.json'))}));if(ground.some(g=>g.maxGapM>.03||g.maxPenetrationM>.005))throw Error('Ground contact exceeds tolerance');
  if(process.argv.includes('--record')){config.contact=contacts[0];config.lodContacts=contacts;config.groundContacts=ground;config.contactEvidence=contactEvidence(config);writeFileSync(path,JSON.stringify(config)+'\n');}
  console.log(JSON.stringify({site:config.id,contacts,ground}));
 }
}
