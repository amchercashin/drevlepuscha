import {groundHeight,pathCentre} from './harness.ts';
import type {Box} from './harness.ts';
import {FOREST_BOUNDS} from './forest.ts';
import {createRandom,seedFor} from './seed.ts';
export const COVER={nearStart:12,nearEnd:24,nearRadius:4,midStart:48,midEnd:90,midRadius:4} as const;
export interface CoverGeometry {positions:number[];indices:number[];colors:number[];normals:number[];uvs:number[]}
/** Permanent coarse silhouettes plus a separate, additive middle layer. No moving placement seed. */
export function makeCoverTile(cx:number,cz:number,layer:'far'|'mid',boxes:readonly Box[],height=groundHeight):CoverGeometry{
 const size=layer==='far'?64:32,grid=layer==='far'?16:20,step=size/grid;
 const e0=cx*size,n0=cz*size,g:CoverGeometry={positions:[],indices:[],colors:[],normals:[],uvs:[]};
 const nearby=boxes.filter(b=>b.max.x>=e0-1&&b.min.x<=e0+size+1&&b.max.z>=-n0-size-1&&b.min.z<=-n0+1);
 function vertex(x:number,y:number,z:number,c:readonly number[],t:number,u=.75,v=.75){
  g.positions.push(x,y,z);g.normals.push(0,1,0);g.uvs.push(u,v);g.colors.push(c[0]+t*.08,c[1]+t*.11,c[2]+t*.04,1);
 }
 for(let j=0;j<grid;j++)for(let i=0;i<grid;i++){
  const r=createRandom(seedFor('showcase-cover-v1',layer,cx*grid+i,cz*grid+j));
  const e=e0+(i+.15+r()*.7)*step,n=n0+(j+.15+r()*.7)*step;
  const patch=.5+.25*Math.sin(e*.35+n*.21)+.25*Math.sin(e*.71-n*.28);
  if(r()>.48+patch*.48||Math.abs(e-pathCentre(n))<2.5)continue;
  if(e<FOREST_BOUNDS.minE||e>FOREST_BOUNDS.maxE||n<FOREST_BOUNDS.minN||n>FOREST_BOUNDS.maxN)continue;
  if(nearby.some(b=>e>b.min.x-.7&&e<b.max.x+.7&&-n>b.min.z-.7&&-n<b.max.z+.7))continue;
  if(Math.hypot(height(e+.25,n)-height(e-.25,n),height(e,n+.25)-height(e,n-.25))*2>=.85)continue;
  const fern=r()<.42,rotation=r()*Math.PI*2,h=.24+r()*.24,length=.42+r()*.32;
  const tint=.86+r()*.23,c=fern?[tint,tint,tint]:[.85*tint,.95*tint,.72*tint];
  const count=fern?5:6;
  for(let b=0;b<count;b++){
   const a=rotation+b*Math.PI*2/count,dx=Math.cos(a),dz=Math.sin(a),k=g.positions.length/3;
   if(fern){
    const y=height(e,n)+.02,w=length*.18,x=e+dx*length*.52,z=-n+dz*length*.52;
    vertex(e,y,-n,c,0,.25,.505);
    vertex(x-dz*w,Math.max(y+h,height(x-dz*w,-z-dx*w)+.025),z+dx*w,c,.8,.10,.75);
    vertex(e+dx*length,Math.max(y+h*.45,height(e+dx*length,n-dz*length)+.025),-n+dz*length,c,1,.25,.995);
    vertex(x+dz*w,Math.max(y+h,height(x+dz*w,-z+dx*w)+.025),z-dx*w,c,.8,.40,.75);
    g.indices.push(k,k+1,k+2,k,k+2,k+3);
   }else{
    const x=e+(r()-.5)*.65,z=-n+(r()-.5)*.65,y=height(x,-z)-.02,w=.035+r()*.035;
    vertex(x-dz*w,y,z+dx*w,c,0);vertex(x+dz*w,y,z-dx*w,c,0);
    vertex(x+dx*h*.5,y+h,z+dz*h*.5,c,1);g.indices.push(k,k+1,k+2);
   }
  }
 }
 return g;
}
/** Coverage never changes height. Kept in domain for endpoint/continuity tests. */
export function coverWeight(distance:number,start:number,end:number){
 const t=Math.max(0,Math.min(1,(distance-start)/(end-start)));return 1-t*t*(3-2*t);
}
