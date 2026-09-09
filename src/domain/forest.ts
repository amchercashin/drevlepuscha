import {showcaseEnabled,showcasePath} from './showcase.ts';
import {createRandom,seedFor} from './seed.ts';
import {groundHeight} from './harness.ts';
import type {Box} from './harness.ts';
export const FOREST_VERSION='m1-tree-field-v1';
export const FOREST_BOUNDS={minE:-256,maxE:256,minN:-256,maxN:384};
export interface TreePlacement {id:string;e:number;n:number;y:number;yaw:number;width:number;height:number;depth:number;leanX:number;leanZ:number;}
export interface TreeVariation {widthRange:[number,number];heightRange:[number,number];depthRatioRange:[number,number];maxLeanDegrees:number;rootSinkMeters:number;}
export function forestPlacements(rootRadiusM=3.8,variation?:TreeVariation):TreePlacement[]{
 const output:TreePlacement[]=[];
 function tree(id:string,e:number,n:number,width?:number,height?:number){
  const r=createRandom(seedFor(FOREST_VERSION,id,'shape')),yaw=r()*Math.PI*2;
  const range=(pair:[number,number])=>pair[0]+r()*(pair[1]-pair[0]);
  const w=variation?(width===undefined?range(variation.widthRange):width*0.7):(width??0.8+r()*0.4);
  const h=variation?(height===undefined?range(variation.heightRange):height*0.85):(height??0.75+r()*0.43);
  const depth=variation?w*range(variation.depthRatioRange):w;
  const lean=variation?variation.maxLeanDegrees*Math.PI/180:0,leanX=(r()*2-1)*lean,leanZ=(r()*2-1)*lean;
  const radius=rootRadiusM*Math.max(w,depth);
  // Conservative downhill support plus a small burial for raised root tips and tilt.
  const samples=variation?24:12;let y=groundHeight(e,n);for(let i=0;i<samples;i++){const a=i*Math.PI*2/samples;y=Math.min(y,groundHeight(e+Math.cos(a)*radius,n+Math.sin(a)*radius));}
  y-=0.08+(variation?variation.rootSinkMeters*h+radius*Math.hypot(leanX,leanZ):0);
  output.push({id,e,n,y,yaw,width:w,height:h,depth,leanX,leanZ});
 }
 if(showcaseEnabled){
  for(let n=-248;n<=376;n+=8)for(let e=-248;e<=248;e+=8){
   const id=`showcase-${e}-${n}`,r=createRandom(seedFor('ravine-1',id));
   const x=e+(r()-.5)*5,z=n+(r()-.5)*5,d=Math.abs(x-showcasePath(z));
   if(d<4.3||r()<.12+(.2*Math.exp(-(((z-82)/22)**2))))continue;
   tree(id,x,z,.55+r()*.35,.68+r()*.45);
  }
  for(let n=-238;n<374;n+=7)for(const side of [-1,1]){
   const id=`showcase-bank-${n}-${side}`,r=createRandom(seedFor('bank',id)),z=n+(r()-.5)*3;
   const x=showcasePath(z)+side*(5+r()*4);
   if(!output.some(t=>Math.hypot(t.e-x,t.n-z)<3))tree(id,x,z,.65+r()*.25,.75+r()*.35);
  }
  return output;
 }
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
export function treeCollider(t:TreePlacement,radiusM=1.18):Box{
 const radius=radiusM*Math.max(t.width,t.depth)+6*t.height*Math.hypot(t.leanX,t.leanZ);
 return {id:t.id,min:{x:t.e-radius,y:t.y,z:-t.n-radius},max:{x:t.e+radius,y:t.y+6*t.height,z:-t.n+radius}};
}
/** Distance to crown envelope, with a protected near zone and hysteresis. */
export function treeLevel(distance:number,current:number):number{
 if(current===0)return distance>22?1:0;
 if(current===1)return distance<18?0:distance>53?2:1;
 return distance<46?1:2;
}
