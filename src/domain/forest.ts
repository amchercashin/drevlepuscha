import {createRandom,seedFor} from './seed.ts';
import {groundHeight} from './harness.ts';
import type {Box} from './harness.ts';
export const FOREST_VERSION='m1-tree-field-v1';
export const FOREST_BOUNDS={minE:-256,maxE:256,minN:-256,maxN:384};
export interface TreePlacement {id:string;e:number;n:number;y:number;yaw:number;width:number;height:number;}
export function forestPlacements():TreePlacement[]{
 const output:TreePlacement[]=[];
 function tree(id:string,e:number,n:number,width?:number,height?:number){const r=createRandom(seedFor(FOREST_VERSION,id,'shape')),yaw=r()*Math.PI*2,w=width??0.8+r()*0.4,h=height??0.75+r()*0.43;
  // Bury the root base against the downhill ground; shared rigid roots never float over a slope.
  let y=groundHeight(e,n);for(let i=0;i<12;i++){const a=i*Math.PI/6;y=Math.min(y,groundHeight(e+Math.cos(a)*3.8*w,n+Math.sin(a)*3.8*w));}
  output.push({id,e,n,y:y-0.08,yaw,width:w,height:h});}
 for(let row=0;row<10;row++)for(let col=0;col<6;col++){
  if(row>=8&&(col===2||col===3))continue;
  const id=`m1-tree-${row}-${col}`,r=createRandom(seedFor(FOREST_VERSION,id,'position'));
  tree(id,[-20,-13,-6,6,13,20][col]+(r()-0.5)*1.6,-7+row*7+(r()-0.5)*1.8);
 }
 for(let n=-248;n<=376;n+=8)for(let e=-248;e<=248;e+=8){
  if(e>-25&&e<25&&n>-12&&n<65)continue;
  const id=`m1-outer-${e}-${n}`,r=createRandom(seedFor(FOREST_VERSION,id,'position'));
  let x=e+(r()-0.5)*3,z=n+(r()-0.5)*3;
  if(Math.abs(x)<3)x=x<0?-4:4;
  tree(id,x,z);
 }
 tree('narrow-left',-1,14,0.42,0.83);tree('narrow-right',1,14,0.42,0.95);
 tree('camera-trunk',-2.8,5,0.8,1.05);tree('canopy-probe',3.6,7,0.9,1.13);
 return output;
}
export function treeCollider(t:TreePlacement):Box{
 const radius=1.18*t.width;
 return {id:t.id,min:{x:t.e-radius,y:t.y,z:-t.n-radius},max:{x:t.e+radius,y:t.y+6*t.height,z:-t.n+radius}};
}
/** Distance to crown envelope, with a protected near zone and hysteresis. */
export function treeLevel(distance:number,current:number):number{
 if(current===0)return distance>22?1:0;
 if(current===1)return distance<18?0:distance>53?2:1;
 return distance<46?1:2;
}
