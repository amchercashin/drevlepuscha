import {trailHash} from './trail-edge.ts';

/** World-anchored ecological patches, shared by the material bake and small-object placement. */
export const GROUND_FIELD={minE:-256,minN:-256,width:512,height:640,pixelsE:256,pixelsN:320} as const;
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export function groundNoise(e:number,n:number,seed:number){
 const x=Math.floor(e),y=Math.floor(n),u=smooth(0,1,e-x),v=smooth(0,1,n-y);
 const h=(a:number,b:number)=>trailHash(a,(Math.imul(b,31337)+seed)>>>0);
 return ((h(x,y)*(1-u)+h(x+1,y)*u)*(1-v)+(h(x,y+1)*(1-u)+h(x+1,y+1)*u)*v)*2-1;
}
export function groundPatch(e:number,n:number){
 const leaves=smooth(.18,.82,.5+.55*groundNoise(e*.11,n*.11,41)+.3*groundNoise(e*.37,n*.37,101));
 const moss=smooth(.25,.75,.5+.6*groundNoise(e*.065+37,n*.065-13,73)+.22*groundNoise(e*.21-7,n*.21+5,151));
 return {leaves,moss};
}
export function groundWarp(e:number,n:number){
 return [
  .5+.32*groundNoise(e*.09+71,n*.09-19,307)+.15*groundNoise(e*.22,n*.22,503),
  .5+.32*groundNoise(e*.09-23,n*.09+41,701)+.15*groundNoise(e*.22,n*.22,907),
 ];
}
