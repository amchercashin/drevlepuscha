/** Offline authoring step: fit a narrow walkable shelf, never relax the QA grade limit. */
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createGeography,nearestOnLine,clamp} from '../../src/domain/geography.mjs';
const file=fileURLToPath(new URL('../../content/geography/old-forest/geography.json',import.meta.url));
const g=JSON.parse(readFileSync(file,'utf8')),routes=g.features.filter(f=>f.route);
const pointsById=new Map(g.features.filter(f=>f.geometry.type==='Point').map(f=>[f.id,f.geometry.coordinates]));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
// Keep all authoring vertices/checkpoints and the segment-based depression masks.
for(const f of routes){const old=f.geometry.coordinates,out=[],index=[];
 for(let i=0;i<old.length-1;i++){index.push(out.length);const a=old[i],b=old[i+1],count=Math.max(1,Math.ceil((distance(a,b)-1e-6)/8));
  for(let j=0;j<count;j++)out.push([a[0]+(b[0]-a[0])*j/count,a[1]+(b[1]-a[1])*j/count]);
 }index.push(out.length);out.push(old.at(-1));f.geometry.coordinates=out;
 for(const key of ['cutSegments','hollowSegments'])if(f.route[key])f.route[key]=f.route[key].map(([a,b])=>[index[a],index[b]]);
 delete f.route.surface;
}
const base=createGeography(g),completed=[];
for(const f of routes){
 const p=f.geometry.coordinates,s=[0],raw=p.map(q=>base.height(...q,false)),grade=.30;
 for(let i=1;i<p.length;i++)s.push(s[i-1]+distance(p[i-1],p[i]));
 const lower=raw.map(()=>-Infinity),upper=raw.map(()=>Infinity),fixed=new Map();
 // Original named scenes are not flattened to obtain an easier test result.
 for(const id of f.route.checkpointIds){if(!g.terrain.sculpt.protectIds.includes(id))continue;
  const q=pointsById.get(id);let nearest=0;for(let i=1;i<p.length;i++)if(distance(p[i],q)<distance(p[nearest],q))nearest=i;
  if(distance(p[nearest],q)<.1)fixed.set(nearest,raw[nearest]);
 }
 for(const i of [0,p.length-1]){let h=raw[i];for(const prior of completed){const n=nearestOnLine(...p[i],prior.route.surface.stations);if(n.distance<.1)h=n.h;}fixed.set(i,h);}
 for(let i=0;i<p.length;i++)for(const water of base.nearbyWater(...p[i])){const half=water.feature.water.widthM/2;
  if(water.distance<half+7){const bank=base.height(...p[i],false);lower[i]=Math.max(lower[i],bank-.15);upper[i]=Math.min(upper[i],bank+.15);}
  else if(water.distance<half+12)lower[i]=Math.max(lower[i],water.h+.8);
 }
 // Joined paths share a height field while they are still within one foot shelf.
 if(completed.length)for(let i=0;i<p.length;i++){const n=nearestOnLine(...p[i],completed[0].route.surface.stations);if(n.distance<14)fixed.set(i,n.h);}
 for(const [i,h] of fixed){lower[i]=h;upper[i]=h;}
 // Propagate fixed heights and dry-bank lower bounds as Lipschitz envelopes.
 for(let i=1;i<p.length;i++){const dh=grade*(s[i]-s[i-1]);lower[i]=Math.max(lower[i],lower[i-1]-dh);upper[i]=Math.min(upper[i],upper[i-1]+dh);}
 for(let i=p.length-2;i>=0;i--){const dh=grade*(s[i+1]-s[i]);lower[i]=Math.max(lower[i],lower[i+1]-dh);upper[i]=Math.min(upper[i],upper[i+1]+dh);}
 const smoothed=raw.map((h,i)=>{let sum=0,weight=0;
  for(let j=Math.max(0,i-12);j<=Math.min(p.length-1,i+12);j++){const d=Math.abs(s[j]-s[i]),w=Math.exp(-((d/24)**2));sum+=raw[j]*w;weight+=w;}
  return sum/weight;
 });
 const heights=[];
 for(let i=0;i<p.length;i++){
  if(lower[i]>upper[i]+1e-6)throw Error(`Infeasible grade at ${f.id}:${i}; move the path, not the test limit`);
  const dh=i?grade*(s[i]-s[i-1]):Infinity;
  const lo=Math.max(lower[i],i?heights[i-1]-dh:-Infinity),hi=Math.min(upper[i],i?heights[i-1]+dh:Infinity);
  if(lo>hi+1e-6)throw Error(`Infeasible shelf ${f.id}:${i}`);
  heights.push(clamp(smoothed[i],lo,hi));
 }
 f.route.surface={halfWidthM:f.route.hidden?2.1:2.4,blendM:Math.max(9,Math.max(...raw.map((h,i)=>Math.abs(h-heights[i])))*2.5),designGradeLimit:grade,stations:p.map((q,i)=>[...q,heights[i]])};
 completed.push(f);console.log(f.id,JSON.stringify({lengthM:s.at(-1),stations:p.length,maximumCorrectionM:Math.max(...raw.map((h,i)=>Math.abs(h-heights[i])))}));
}
writeFileSync(file,JSON.stringify(g,null,2)+'\n');
