import {readFileSync,writeFileSync} from 'node:fs';import {sceneData} from './scene-data.mjs';import {surfaceHit} from './surface.mjs';import {sampleRoute,routeMotion,transformAnchor} from '../../src/domain/wildlife/routes.ts';
import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';
const read=p=>JSON.parse(readFileSync(p)),guide=read('config/wildlife/squirrel-rig-guide.json');
export function analyzeSquirrelContact(route,scene,tracksOverride){
const tracks=tracksOverride??read('.artwork/wildlife/squirrel-01/contact-tracks.json');
const tree=scene.catalog.get(route.treeId),collider=scene.boxes.find(b=>b.id===route.treeId).collision;
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>{const l=Math.hypot(...a);return a.map(v=>v/l);},dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),xyz=p=>[p[0],p[2],-p[1]];
let maxGap=0,maxPenetration=0,missing=0,count=0;const failures=[];
const start=route.motion.find(k=>k.state==='climb').atMs,end=route.motion.at(-1).atMs,clip='climb_up',duration=guide.clips[clip],frames=tracks.clips[clip];
for(let t=start;t<end;t+=20){const d=routeMotion(route,t).distanceM,s=sampleRoute(route,d),a=sampleRoute(route,Math.max(0,d-.02)).point,b=sampleRoute(route,Math.min(route.lengthM,d+.02)).point,up=s.normal,raw=[b.e-a.e,b.n-a.n,b.h-a.h],forward=norm(raw.map((v,i)=>v-up[i]*dot(raw,up))),right=norm(cross(up,forward)),pose=frames[Math.round(((t-start)/1000%duration)*tracks.fps)],phase=((t-start)/1000/duration)%1;
 for(const [foot,p] of Object.entries(pose)){
  const [limb,,side]=foot.split('.'),shift=(limb==='front'?0:.5)+(side==='L'?0:.5);if((phase+shift)%1>=guide.locomotion[clip].stance)continue;
  const position=[s.point.e,s.point.n,s.point.h].map((v,i)=>v+right[i]*p[0]-forward[i]*p[1]+up[i]*(p[2]+.008)),hit=surfaceHit(collider,xyz(position.map((v,i)=>v+up[i]*.25)),xyz(position.map((v,i)=>v-up[i]*.25)));count++;
  if(!hit){missing++;continue;}const world=transformAnchor(hit.point,hit.normal,tree.modelToAbsoluteXYZ).point,gap=dot(position.map((v,i)=>v-[world.e,world.n,world.h][i]),up);maxGap=Math.max(maxGap,gap);maxPenetration=Math.max(maxPenetration,-gap);if(Math.abs(gap)>.03)failures.push({t,foot,gap});
 }
}
const result={status:missing||maxGap>.03||maxPenetration>.005?'needs-contact-correction':'numeric-contact-pass',samples:count,missing,maxGapM:maxGap,maxPenetrationM:maxPenetration,failures:failures.slice(0,8)};return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const data=read('public/wildlife/content/showcase/bird.json'),result=analyzeSquirrelContact(data.cells.flatMap(c=>c.routes).find(r=>r.kind==='climb'),sceneData());writeFileSync('.artwork/wildlife/squirrel-01/route-contact-report.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
