import {hash01} from '../domain/geography.mjs';
import {triangleHeight} from './math.ts';
import type {EN,Grid} from './schema.ts';

/** Ground roots on the rendered surface: detailed triangles nearby, coarse land beyond streaming. */
export function regionGroveMatrices(p:EN,origin:EN,grid:Grid,geo:any){
 const groups:Record<string,number[]>={};
 const half=60,step=14;
 for(let y=Math.floor(p.n/step)-half;y<=Math.floor(p.n/step)+half;y++)for(let x=Math.floor(p.e/step)-half;x<=Math.floor(p.e/step)+half;x++){
  const e=(x+.2+hash01(x,y,603)*.6)*step,n=(y+.2+hash01(x,y,604)*.6)*step,d=Math.hypot(e-p.e,n-p.n);
  if(d<410||d>820||e<grid.origin[0]||n<grid.origin[1]||e>grid.origin[0]+(grid.columns-1)*grid.stepM||n>grid.origin[1]+(grid.rows-1)*grid.stepM)continue;
  if(!geo.forestAt(e,n)||geo.exclusion(e,n)||hash01(x,y,606)<.18)continue;
  const family=hash01(x,y,609)<.15?2:hash01(x,y,607)<.5?0:1,variant=Math.floor(hash01(x,y,608)*3),level=d<850?1:2;
  const height=(E:number,N:number)=>d<710?geo.surfaceHeight(E,N):triangleHeight(grid,E,N);
  const h=Math.min(height(e,n),height(e-2,n),height(e+2,n),height(e,n-2),height(e,n+2))-.3;
  const s=.72+hash01(x,y,610)*.65,w=s*(.8+hash01(x,y,611)*.35),a=hash01(x,y,612)*Math.PI*2,c=Math.cos(a),z=Math.sin(a);
  const key=family+'/'+variant+'/'+level,buf=groups[key]??(groups[key]=[]);
  buf.push(c*w,0,-z*w,0,0,s,0,0,z*w,0,c*w,0,e-origin.e,h,origin.n-n,1);
 }
 return Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,new Float32Array(v)]));
}
