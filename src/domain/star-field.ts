/**
 * Star field for the sky dome. The shader mirrors this function; keeping the
 * arithmetic in the domain means the midnight seam can be tested without a GPU.
 *
 * The dome turns once per day, so `spin` is in turns and only its fractional part
 * matters. Two half-turns of the same fixed grid are cross-faded, and the sample is
 * mirrored past the seam: at midnight one layer has faded out completely before the
 * other starts to move, so no star is ever rebuilt, moved or doubled.
 */
export type StarSample={azimuth:number;elevation:number;spin:number};
export type StarLayer={density:number;tileX:number;tileY:number;level:number;phase:number;tintSeed:number};
export const STAR_LAYERS:readonly StarLayer[]=[
 {density:0.55,tileX:14,tileY:7,level:0.45,phase:0.37,tintSeed:7.7},
 {density:0.86,tileX:26,tileY:13,level:0.95,phase:0.61,tintSeed:19.3},
 {density:0.97,tileX:44,tileY:22,level:1.80,phase:0.83,tintSeed:31.7},
];
const TAU=Math.PI*2;
const fract=(v:number)=>v-Math.floor(v);
const clamp=(v:number,a:number,b:number)=>v<a?a:v>b?b:v;
export function smoothstep(a:number,b:number,x:number){
 const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);
}
export function hash21(x:number,y:number){
 let qx=fract(x*0.1031),qy=fract(y*0.1030);
 const d=qx*(qx+33.33)+qy*(qy+33.33);
 qx=fract(qx+d);qy=fract(qy+d);
 return fract((qx+qy)*qx);
}
/** Level only: no colour, no twinkle, no horizon or cloud mask. */
export function starLayerField(sample:StarSample,layer:StarLayer,time:number){
 const angle=sample.spin*TAU;
 const lon=sample.azimuth*TAU+angle;
 const axisX=Math.sin(sample.elevation),axisY=Math.cos(sample.elevation);
 let weight=0,sum=0;
 for(let i=0;i<2;i++){
  weight=i===0?1-weight:smoothstep(0.25,0.75,fract(sample.spin+0.5));
  const offsetX=axisX*layer.tileX*0.25,offsetY=axisY*layer.tileY*0.25;
  const qx=lon/(TAU*layer.tileX)+offsetX,qy=sample.elevation/Math.PI*layer.tileY+offsetY;
  const cellX=Math.floor(qx),cellY=Math.floor(qy);
  const localX=qx-cellX,localY=qy-cellY;
  const seed=hash21(cellX+i*97,cellY+i*97);
  if(seed>layer.density){
   const jitterX=hash21(cellX+13.7,cellY+13.7),jitterY=hash21(cellX+71.3,cellY+71.3);
   const distance=Math.hypot(localX-jitterX,localY-jitterY);
   const radius=0.09+hash21(cellX+29.1,cellY+29.1)*0.15;
   const point=(1-smoothstep(radius,radius+0.02,distance))*(0.65+hash21(cellX+53.9,cellY+53.9)*0.35);
   sum+=point;
  }
 }
 const twinkle=0.82+0.18*Math.sin(time*(0.7+layer.phase*1.6)+layer.phase*37);
 return sum*weight*layer.level*twinkle;
}
/** Total star level over the dome for a scene hour. `spin` is turns, exactly as sent to WGSL. */
export function starFieldLevel(spin:number,directions:readonly [number,number,number][],time=0){
 let total=0;
 for(const [x,y,z] of directions){
  const sample={azimuth:Math.atan2(z,x),elevation:Math.asin(clamp(y,-1,1)),spin};
  for(const layer of STAR_LAYERS)total+=starLayerField(sample,layer,time);
 }
 return total;
}
/** Largest jump between neighbouring samples — the seam that used to fall on midnight. */
export function starFieldSteps(spins:readonly number[],directions:readonly [number,number,number][],time=0){
 const levels=spins.map(spin=>starFieldLevel(spin,directions,time));
 let largest=0;
 for(let i=1;i<levels.length;i++)largest=Math.max(largest,Math.abs(levels[i]-levels[i-1]));
 return {levels,largest};
}
/** Directions spread over the upper dome, avoiding the exact pole and horizon. */
export function domeSamples(count=64){
 const directions:[number,number,number][]=[];
 for(let i=0;i<count;i++){
  const azimuth=i*2.399963,elevation=0.12+0.78*((i%17)+0.5)/17;
  const y=Math.sin(elevation),r=Math.cos(elevation);
  directions.push([r*Math.cos(azimuth),y,r*Math.sin(azimuth)]);
 }
 return directions;
}
export function starAngleAt(hours:number){return hours/24;}
/** The previous convention added whole days instead of a fraction, so the sum wrapped hard at midnight. */
export function legacyStarAngleAt(hours:number){return hours/24+Math.floor(hours/24);}
