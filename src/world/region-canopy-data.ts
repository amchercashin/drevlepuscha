import {hash01} from '../domain/geography.mjs';
import {triangleHeight} from './math.ts';
import type {Grid} from './schema.ts';

/** A connected forest cover, with a ragged edge dropping into the understorey. Not crown spheres. */
export function regionCanopyGeometry(grid:Grid,geo:any){
 const step=20,cols=Math.floor((grid.columns-1)*grid.stepM/step),rows=Math.floor((grid.rows-1)*grid.stepM/step);
 const positions:number[]=[],colors:number[]=[],indices:number[]=[],vertices=new Map<string,number>();
 const excluded=new Map<string,boolean>();
 const blocked=(x:number,y:number)=>{const id=x+','+y;if(!excluded.has(id))excluded.set(id,geo.exclusion(grid.origin[0]+x*step,grid.origin[1]+y*step));return excluded.get(id);};
 const forest=(x:number,y:number)=>geo.forestAt(grid.origin[0]+(x+.5)*step,grid.origin[1]+(y+.5)*step)&&!blocked(x,y)&&!blocked(x+1,y)&&!blocked(x,y+1)&&!blocked(x+1,y+1);
 const mask=new Uint8Array(cols*rows);for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)mask[y*cols+x]=Number(forest(x,y));
 const filled=(x:number,y:number)=>x>=0&&y>=0&&x<cols&&y<rows&&!!mask[y*cols+x];
 function vertex(x:number,y:number,bottom=false){const key=x+','+y+','+bottom;if(vertices.has(key))return vertices.get(key)!;
  const e=grid.origin[0]+x*step,n=grid.origin[1]+y*step,ground=triangleHeight(grid,e,n);
  const edge=[filled(x,y),filled(x-1,y),filled(x,y-1),filled(x-1,y-1)].filter(Boolean).length<4;
  const canopy=bottom?-.5:(edge?10:16)+Math.sin(e*.043+n*.023)*2+Math.sin(n*.078-e*.029)*1.4+hash01(x,y,231)*3;
  const k=positions.length/3;vertices.set(key,k);positions.push(e,ground+canopy,-n);
  const tone=.88+hash01(x,y,235)*.18,light=bottom?.48:edge?.84:1;colors.push(.25*tone*light,.36*tone*light,.18*tone*light,1);return k;
 }
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(filled(x,y)){
  const a=vertex(x,y),b=vertex(x+1,y),c=vertex(x,y+1),d=vertex(x+1,y+1);indices.push(a,b,c,b,d,c);
  for(const [nx,ny,ax,ay,bx,by]of [[x,y-1,x+1,y,x,y],[x+1,y,x+1,y+1,x+1,y],[x,y+1,x,y+1,x+1,y+1],[x-1,y,x,y,x,y+1]])if(!filled(nx,ny)){
   const u=vertex(ax,ay),v=vertex(bx,by),w=vertex(ax,ay,true),z=vertex(bx,by,true);indices.push(u,w,v,v,w,z);
  }
 }
 return {positions:new Float32Array(positions),colors:new Float32Array(colors),indices:new Uint32Array(indices)};
}
