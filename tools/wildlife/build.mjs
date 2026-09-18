import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {sceneData,readJSON,treeInputs,propInputs} from './scene-data.mjs';
import {showcaseHeight,showcasePath} from '../../src/domain/showcase.ts';
import {meshBlocksCylinder,meshBlocksSegment} from '../../src/domain/mesh-collision.ts';
import {distance,transformAnchor} from '../../src/domain/wildlife/routes.ts';
import {cellId} from '../../src/domain/wildlife/ids.ts';
import {validatePackage} from '../../src/domain/wildlife/habitat.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
const sha=x=>createHash('sha256').update(x).digest('hex');
export const inputs=[...treeInputs,...propInputs,'config/wildlife/showcase-sites.json','config/wildlife/species.json','config/wildlife/budgets.json','src/domain/showcase.ts','src/domain/forest-layout.ts','src/domain/forest-records.ts','src/domain/forest-props-layout.ts','src/domain/tree-family.ts','src/domain/seed.ts','src/domain/mesh-collision.ts','src/domain/wildlife/routes.ts','src/domain/wildlife/types.ts','tools/wildlife/scene-data.mjs','tools/wildlife/build.mjs'];
// All inputs are versioned text. Hash Git's LF form on Windows as well as Linux.
export const sourceHash=text=>sha(text.replace(/\r\n/g,'\n'));
export const sourceHashes=()=>Object.fromEntries(inputs.map(p=>[p,sourceHash(readFileSync(resolve(root,p),'utf8'))]));
const xyz=p=>({x:p.e,y:p.h,z:-p.n});
export function corridorClear(points,boxes,body){
 const nearby=boxes.filter(b=>{const c=b.collision;return points.some(p=>p.e>=c.min.x-30&&p.e<=c.max.x+30&&-p.n>=c.min.z-30&&-p.n<=c.max.z+30);});
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],steps=Math.ceil(distance(a,b)/.04);
  for(let j=0;j<=steps;j++){
   const t=j/steps,p={e:a.e+(b.e-a.e)*t,n:a.n+(b.n-a.n)*t,h:a.h+(b.h-a.h)*t};
   if(p.e< -256||p.e>256||p.n< -256||p.n>384||p.h<showcaseHeight(p.e,p.n)+.02)return false;
   if(nearby.some(o=>meshBlocksCylinder(o.collision,xyz(p),body.radiusM+.021,body.heightM)))return false;
  }
 }
 return true;
}
function pathPoints(points){
 // Cubic Bezier, then validate the sampled curve, not just the four controls.
 const [a,b,c,d]=points,rough=distance(a,b)+distance(b,c)+distance(c,d),steps=Math.ceil(rough/.08);
 return Array.from({length:steps+1},(_,i)=>{const t=i/steps,u=1-t;return Object.fromEntries(['e','n','h'].map(k=>[k,u*u*u*a[k]+3*u*u*t*b[k]+3*u*t*t*c[k]+t*t*t*d[k]]));});
}
function prepareRoute(id,from,to,points,body,treeId){
 let lengthM=0;const samples=points.map((point,i)=>{if(i)lengthM+=distance(points[i-1],point);return {distanceM:lengthM,point,normal:[0,0,1]};});
 const bounds={min:{},max:{}};for(const k of ['e','n','h']){bounds.min[k]=Math.min(...points.map(p=>p[k]));bounds.max[k]=Math.max(...points.map(p=>p[k]));}
 return {id,kind:'flight',from,to,lengthM,samples,bounds,clearanceM:body.radiusM,maxSlopeDeg:90,treeId};
}
function anchorPoint(anchor,catalog){
 const t=catalog.get(anchor.treeId);if(!t)throw Error(`Unknown treeId: ${anchor.treeId}`);
 if(t.familyId!==anchor.familyId||t.assetVersion!==anchor.assetVersion||anchor.anchorVersion!==1)throw Error(`Incompatible anchor: ${anchor.treeId}`);
 const result=transformAnchor(anchor.point,anchor.normal,t.modelToAbsoluteXYZ).point;
 return {...result,h:result.h+.035};
}
export function compile(){
 const scene=sceneData(),config=readJSON('config/wildlife/showcase-sites.json'),bird=readJSON('config/wildlife/species.json')['woodland-bird'];
 const perchFamily=scene.families.find(f=>f.id===config.perch.familyId);
 if(!perchFamily||config.perch.point[1]>Math.max(...perchFamily.levels[0].flatMap(p=>p.positions.filter((_,i)=>i%3===1)))*.18)throw Error('Perch is above the rigid wind zone');
 const hashes=sourceHashes(),hash=sha(JSON.stringify(hashes)),home=anchorPoint(config.perch,scene.catalog),id=cellId(home.e,home.n);
 const routes=config.routes.map((r,i)=>{
  const end=anchorPoint(r.refuge,scene.catalog),points=pathPoints([home,...r.controls,end]);
  if(!corridorClear(points,scene.boxes,bird))throw Error(`Blocked wildlife flight corridor: ${r.id}`);
  const eye={x:showcasePath(end.n),y:showcaseHeight(showcasePath(end.n),end.n)+1.6,z:-end.n};
  if(!scene.boxes.some(b=>meshBlocksSegment(b.collision,eye,{...xyz(end),y:end.h+bird.heightM/2})))throw Error(`Refuge lacks cover: ${r.id}`);
  return prepareRoute(r.id,config.id,`cover-${i}`,points,bird,r.refuge.treeId);
 });
 const proxies=scene.boxes.filter(b=>Math.hypot((b.min.x+b.max.x)/2-home.e,-(b.min.z+b.max.z)/2-home.n)<64).map(b=>{const c=b;return {id:b.id,min:{e:c.min.x,n:-c.max.z,h:c.min.y},max:{e:c.max.x,n:-c.min.z,h:c.max.y}};});
 const data={identity:{realmId:'showcase-ravines',contentHash:hash,behaviorVersion:1},limits:readJSON('config/wildlife/budgets.json'),bird,cells:[{id,contentHash:hash,sites:[{id:config.id,cellId:id,species:'woodland-bird',home,allowedRoutes:routes.map(r=>r.id),refuges:routes.map(r=>r.to),treeId:config.perch.treeId,maxResidents:1,tags:['test-episode','rigid-lower-perch']}],routes,neighbors:[],obstacles:proxies}]};
 validatePackage(data);return {data,hashes,scene};
}
/** Authoring helper: selects actual upward-facing triangles; writes a reviewable fixed config once. */
export function selectSite(){
 const scene=sceneData(),body=readJSON('config/wildlife/species.json')['woodland-bird'],candidates=[];
 for(const [index,{placement:p,slot}] of scene.records.entries()){
  if(Math.abs(p.n)>120||Math.abs(p.e-showcasePath(p.n))>12)continue;
  const tree=scene.catalog.get(p.id),m=tree.modelToAbsoluteXYZ; const modelHeight=Math.max(...scene.families[slot].levels[0].flatMap(part=>part.positions.filter((_,i)=>i%3===1)));
  for(const part of scene.families[slot].levels[0])for(let i=0;i<part.indices.length;i+=3){
   const vertices=[0,1,2].map(j=>part.positions.slice(part.indices[i+j]*3,part.indices[i+j]*3+3));
   const [a,b,c]=vertices,u=b.map((x,k)=>x-a[k]),v=c.map((x,k)=>x-a[k]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...normal);
   if(len<.001||Math.abs(normal[1]/len)<.75)continue;
   const point=a.map((x,k)=>(x+b[k]+c[k])/3);const world=transformAnchor(point,normal,m).point;
   if(world.h-showcaseHeight(world.e,world.n)<.04||world.h-showcaseHeight(world.e,world.n)>4||world.h-p.y>5)continue;
   const anchor={treeId:p.id,familyId:tree.familyId,assetVersion:tree.assetVersion,anchorVersion:1,point,normal:normal.map(x=>x/len),triangle:i/3,part:part.name};
   const pos=anchorPoint(anchor,scene.catalog);
   if(!corridorClear([pos,{...pos,h:pos.h+.1}],scene.boxes,body))continue;
   candidates.push({anchor,pos,rigid:point[1]<=modelHeight*.18,score:Math.abs(pos.n)+Math.abs(pos.e-showcasePath(pos.n))});
  }
 }
 candidates.sort((a,b)=>a.score-b.score);console.log(`Candidate rigid perches: ${candidates.length}`);
 for(const home of candidates.filter(c=>c.rigid).slice(0,80)){
  const routes=[];
  for(const end of candidates){
   const d=distance(home.pos,end.pos);if(d<6||d>26||end.anchor.treeId===home.anchor.treeId||routes.some(r=>r.refuge.treeId===end.anchor.treeId))continue;
   const eye={x:showcasePath(end.pos.n),y:showcaseHeight(showcasePath(end.pos.n),end.pos.n)+1.6,z:-end.pos.n};
   if(!scene.boxes.some(b=>meshBlocksSegment(b.collision,eye,{...xyz(end.pos),y:end.pos.h+body.heightM/2})))continue;
   for(const lift of [2,4,7]){
    const h=Math.max(home.pos.h,end.pos.h)+lift,controls=[{e:showcasePath(home.pos.n),n:home.pos.n,h},{e:showcasePath(end.pos.n),n:end.pos.n,h}];
    if(corridorClear(pathPoints([home.pos,...controls,end.pos]),scene.boxes,body)){routes.push({id:`flight-${routes.length}`,refuge:end.anchor,controls});break;}
   }
   if(routes.length===2){const config={id:'trail-bird-01',status:'test-content-awaiting-art-review',perch:home.anchor,routes};writeFileSync(resolve(root,'config/wildlife/showcase-sites.json'),JSON.stringify(config,null,2)+'\n');console.log(JSON.stringify(config));return;}
  }
 }
 throw Error('No safe two-exit perch found; authoring required');
}
export function build(check=false){
 const {data,hashes}=compile(),json=JSON.stringify(data),dir=resolve(root,'public/wildlife/content');
 const manifest={v:1,status:'test-content',...data.identity,file:'showcase/bird.json',sha256:sha(json),sourceHashes:hashes};
 const files=[[resolve(dir,'showcase/bird.json'),json],[resolve(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n']];
 if(check){for(const [p,text] of files)if(readFileSync(p,'utf8')!==text)throw Error('Stale wildlife content; run npm run wildlife:build');}
 else {mkdirSync(resolve(dir,'showcase'),{recursive:true});for(const [p,text] of files)writeFileSync(p,text);}
 console.log(JSON.stringify({contentHash:data.identity.contentHash,sites:data.cells[0].sites.length,routes:data.cells[0].routes.length,bytes:json.length,check}));return data;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv.includes('--select'))selectSite();else build(process.argv.includes('--check'));}
