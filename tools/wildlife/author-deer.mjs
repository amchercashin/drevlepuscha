import {writeFileSync} from 'node:fs';
import {sceneData} from './scene-data.mjs';import {showcaseHeight,showcasePath} from '../../src/domain/showcase.ts';import {meshBlocksCylinder,meshBlocksSegment} from '../../src/domain/mesh-collision.ts';import {walkerIsClear} from '../../src/domain/harness.ts';
const scene=sceneData();const radius=.95,height=1.35,xyz=p=>({x:p.e,y:p.h,z:-p.n});
function ground(e,n){return {e,n,h:showcaseHeight(e,n)+.012};}
function clear(p,boxes){return !boxes.some(b=>meshBlocksCylinder(b.collision,{...xyz(p),y:p.h+.008},radius,height));}
let attempts=0;
for(let north=-180;north<330;north+=8)for(const offset of [-10,10,-6,6]){
 const home=ground(showcasePath(north)+offset,north),nearby=scene.boxes.filter(b=>Math.hypot((b.min.x+b.max.x)/2-home.e,-(b.min.z+b.max.z)/2-home.n)<55);if(!clear(home,nearby)||!walkerIsClear({e:home.e+3,n:home.n-7},scene.boxes))continue;attempts++;
 const corridors=[],nodes=new Map(),queue=[],key=(x,z)=>`${x}:${z}`;
 const origin={x:0,z:0,point:home,parent:null};nodes.set(key(0,0),origin);queue.push(origin);
 function edge(a,b){const samples=[];const len=Math.hypot(b.e-a.e,b.n-a.n),steps=Math.ceil(len/.1);let previous=a;
  for(let i=1;i<=steps;i++){const t=i/steps,p=ground(a.e+(b.e-a.e)*t,a.n+(b.n-a.n)*t);if(Math.abs(p.h-previous.h)>len/steps*.466||!clear(p,nearby))return null;const de=(showcaseHeight(p.e+.05,p.n)-showcaseHeight(p.e-.05,p.n))/.1,dn=(showcaseHeight(p.e,p.n+.05)-showcaseHeight(p.e,p.n-.05))/.1,normal=[-de,-dn,1],l=Math.hypot(...normal);samples.push({point:p,normal:normal.map(v=>v/l)});previous=p;}return samples;
 }
 for(let q=0;q<queue.length;q++){
  const node=queue[q],p=node.point,d=Math.hypot(p.e-home.e,p.n-home.n),angle=Math.atan2(p.e-home.e,p.n-home.n)*180/Math.PI;
  if(d>12&&corridors.every(c=>Math.abs(((c.angle-angle+540)%360)-180)>=60)&&nearby.some(b=>meshBlocksSegment(b.collision,{...xyz(home),y:home.h+1.6},{...xyz(p),y:p.h+.6}))){
   const chain=[];for(let n=node;n.parent;n=n.parent)chain.unshift(...n.edge);corridors.push({id:`deer-exit-${corridors.length}`,angle,samples:[{point:home,normal:[0,0,1]},...chain]});
   if(corridors.length===3){const result={id:'clearing-deer-01',species:'roe-deer',status:'candidate-ground-review',home,corridors};writeFileSync('config/wildlife/deer-site.json',JSON.stringify(result)+'\n');console.log(JSON.stringify({attempts,home,exits:corridors.map(c=>({angle:c.angle,samples:c.samples.length}))}));process.exit(0);}
  }
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const x=node.x+dx,z=node.z+dz,k=key(x,z);if(Math.abs(x)>20||Math.abs(z)>20||nodes.has(k))continue;const point=ground(home.e+x,home.n+z),samples=edge(p,point);if(!samples)continue;const next={x,z,point,edge:samples,parent:node};nodes.set(k,next);queue.push(next);}
 }

}
throw Error(`No three safe deer exits among ${attempts} clearing candidates`);
