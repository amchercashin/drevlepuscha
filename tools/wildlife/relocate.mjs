import {readFileSync,writeFileSync} from 'node:fs';
import {sceneData} from './scene-data.mjs';
import {anchorPoint,corridorClear,pathPoints} from './build.mjs';
import {showcaseHeight,showcasePath,enableShowcase} from '../../src/domain/showcase.ts';
import {walkerIsClear} from '../../src/domain/harness.ts';
import {meshBlocksSegment} from '../../src/domain/mesh-collision.ts';
// Reuse the same model-space attachment on a compatible existing tree. Never move trees.
const source=JSON.parse(readFileSync('config/wildlife/showcase-sites.json')),body=JSON.parse(readFileSync('config/wildlife/species.json'))['woodland-bird'];
const targetN=Number(process.argv[2]??313);if(!Number.isFinite(targetN))throw Error('Expected target northing');
enableShowcase();const scene=sceneData(),trees=[...scene.catalog.all()],center=t=>({e:(t.bounds.min.e+t.bounds.max.e)/2,n:(t.bounds.min.n+t.bounds.max.n)/2});
const homes=trees.filter(t=>t.familyId===source.perch.familyId&&Math.abs(center(t).n-targetN)<45).sort((a,b)=>Math.abs(center(a).n-targetN)-Math.abs(center(b).n-targetN));
let checked=0;
for(const tree of homes){
 const perch={...source.perch,treeId:tree.id},home=anchorPoint(perch,scene.catalog);
 if(home.h-showcaseHeight(home.e,home.n)>4||Math.abs(home.e-showcasePath(home.n))>20||!corridorClear([home,{...home,h:home.h+.001}],scene.boxes,{...body,forcePerch:true}))continue;
 // The debug approach must be reachable without moving the camera or placing the hero in a trunk.
 if(![3,7,25].every(back=>walkerIsClear({e:home.e+(back<=7?3:0),n:home.n-back},scene.boxes)))continue;
 checked++;console.log('Checking perch',tree.id);const routes=[];
 const endpoints=source.routes.flatMap(template=>trees.filter(t=>t.familyId===template.refuge.familyId&&t.id!==tree.id&&Math.hypot(center(t).e-home.e,center(t).n-home.n)<27).map(t=>({...template.refuge,treeId:t.id})));
 endpoints.sort((a,b)=>{const p=anchorPoint(a,scene.catalog),q=anchorPoint(b,scene.catalog);return Math.hypot(p.e-home.e,p.n-home.n)-Math.hypot(q.e-home.e,q.n-home.n);});
 for(const anchor of endpoints){if(routes.some(r=>r.refuge.treeId===anchor.treeId))continue;
  search: for(const dh of [.5,1,2])for(const de of [0,1,-1,2,-2])for(const dn of [0,1,-1,2,-2]){
   const refuge={...anchor,airOffset:{e:de,n:dn,h:dh}},end=anchorPoint(refuge,scene.catalog),d=Math.hypot(end.e-home.e,end.n-home.n);if(d<6||d>28)continue;
   if(!corridorClear([end,{...end,h:end.h+.001}],scene.boxes,{...body,forceFlight:true}))continue;
   const eye={x:showcasePath(end.n),y:showcaseHeight(showcasePath(end.n),end.n)+1.6,z:-end.n};
   if(!scene.boxes.some(b=>meshBlocksSegment(b.collision,eye,{x:end.e,y:end.h+body.heightM/2,z:-end.n})))continue;
   for(const lift of [2,4,7])for(const bend of [0,3,-3]){
    const h=Math.max(home.h,end.h)+lift,controls=[{e:showcasePath(home.n),n:home.n+bend,h},{e:showcasePath(end.n),n:end.n,h}];
    if(corridorClear(pathPoints([home,...controls,end]),scene.boxes,body)){routes.push({id:`relocated-flight-${routes.length}`,refuge,controls});console.log('Safe route',routes.at(-1).id,refuge.treeId);break search;}
   }
  }
  if(routes.length===2){const result={id:'trail-bird-02',status:'relocation-probe-awaiting-art-review',perch,routes};writeFileSync('config/wildlife/showcase-relocated-site.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({home,checked,tree:tree.id}));process.exit(0);}
 }
 if(checked>=18)break;
}
throw Error('No safe relocation found in the bounded search');
