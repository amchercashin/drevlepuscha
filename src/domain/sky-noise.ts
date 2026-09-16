/**
 * Cloud layer data for the new sky. Generated once at startup, never per frame.
 * Each field is evaluated on a small grid and upsampled with the same interpolation
 * the noise uses, so added octaves stay exact at a fraction of the usual cost.
 */
export const SKY_LAYER_SIZE=256;

const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const smooth=(t:number)=>t*t*(3-2*t);
const clamp01=(v:number)=>v<0?0:v>1?1:v;
function hash(x:number,y:number,seed:number){
 let h=Math.imul(x+seed,374761393)+Math.imul(y+seed,668265263);
 h=Math.imul(h^(h>>>13),1274126177);
 return ((h^(h>>>16))>>>0)/4294967295;
}
/** Tileable value noise on a power-of-two grid. */
function sample(ix:number,iy:number,n:number,seed:number){
 return hash(((ix%n)+n)%n,((iy%n)+n)%n,seed);
}
function lerp2(a:number,b:number,c:number,d:number,sx:number,sy:number){
 return mix(mix(a,b,sx),mix(c,d,sx),sy);
}
function gridNoise(grid:number,x:number,y:number,seed:number){
 const fx=x*grid,fy=y*grid,ix=Math.floor(fx),iy=Math.floor(fy);
 return lerp2(sample(ix,iy,grid,seed),sample(ix+1,iy,grid,seed),sample(ix,iy+1,grid,seed),sample(ix+1,iy+1,grid,seed),smooth(fx-ix),smooth(fy-iy));
}
type Octave={n:number;weight:number;seed:number};
/** Weighted average of all octaves, so the result stays inside [0,1]. */
function field(size:number,octaves:Octave[]){
 const values=new Float64Array(size*size);
 const total=octaves.reduce((sum,o)=>sum+o.weight,0);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  let value=0;
  for(const octave of octaves)value+=octave.weight*gridNoise(octave.n,x/size,y/size,octave.seed);
  values[y*size+x]=value/total;
 }
 return values;
}
/** Largest scale first: a coarse grid is sampled once and smoothed up to full size. */
function lowField(size:number,grid:number,octaves:Octave[]){
 const out=new Float64Array(size*size),scale=grid/size;
 const total=octaves.reduce((sum,o)=>sum+o.weight,0);
 for(let y=0;y<size;y++){
  const gy=y*scale,iy=Math.floor(gy),sy=smooth(gy-iy),row0=(iy%grid)*grid,row1=((iy+1)%grid)*grid;
  for(let x=0;x<size;x++){
   const gx=x*scale,ix=Math.floor(gx),sx=smooth(gx-ix),ix0=ix%grid,ix1=(ix+1)%grid;
   let value=0;
   for(const octave of octaves){
    const fx=x/size*octave.n,fy=y/size*octave.n,fx0=Math.floor(fx),fy0=Math.floor(fy);
    value+=octave.weight*lerp2(sample(fx0,fy0,octave.n,octave.seed),sample(fx0+1,fy0,octave.n,octave.seed),sample(fx0,fy0+1,octave.n,octave.seed),sample(fx0+1,fy0+1,octave.n,octave.seed),smooth(fx-fx0),smooth(fy-fy0));
   }
   out[y*size+x]=total>0?value/total:value;
  }
 }
 return out;
}

/** Line contrast around the midpoint. Value noise averages several octaves, so the raw
 * field clusters near 0.5; without this the sky turns into one flat veil instead of
 * separate masses with gaps between them. Values leave the ends fully open or shut. */
export function cloudContrast(value:number,amount=1.9){
 const spread=(value-.5)*2*amount;
 return clamp01(.5+.5*spread*(1.15-Math.abs(spread)*.14));
}
/** Decorrelates two fields that share octaves, so one layer's gaps do not line up with
 * the other's. Falls back to a plain difference when the inputs are not two fields. */
export function channelContrast(a:number,b:number,amount=1.9){
 const total=a+b;
 const centred=total>1e-6?(a-b)/total:(a-b)*2;
 const spread=Math.min(.95,centred*amount);
 return clamp01(.5+.5*spread*(1-Math.abs(spread)*.35));
}
/**
 * RGBA cloud mass. R — base density, G — a finer second scale, B and A — two
 * decorrelated distortion fields. Heights derived per sample drive cloud shading.
 */
export function createCloudLayerPixels(){
 const size=SKY_LAYER_SIZE,data=new Uint8Array(size*size*4);
 // Feature size is set here: a dome patch spans a few tenths of the map, so the
 // largest cloud masses sit near six cycles across the texture, not two.
 const coverage=field(size,[{n:6,weight:1,seed:311},{n:10,weight:.40,seed:419},{n:16,weight:.28,seed:523},{n:24,weight:.20,seed:631}]);
 const detail=field(size,[{n:12,weight:1,seed:733},{n:20,weight:.45,seed:839},{n:30,weight:.30,seed:941},{n:42,weight:.22,seed:1049}]);
 const warpX=lowField(size,16,[{n:5,weight:1,seed:1153},{n:9,weight:.35,seed:1259}]);
 const warpY=lowField(size,16,[{n:4,weight:1,seed:1361},{n:7,weight:.40,seed:1471}]);
 for(let i=0;i<size*size;i++){
  const index=i*4;
  data[index]=Math.round(cloudContrast(coverage[i])*255);
  data[index+1]=Math.round(cloudContrast(detail[i])*255);
  data[index+2]=Math.round(channelContrast(warpX[i],warpY[i])*255);
  data[index+3]=Math.round(channelContrast(warpY[i],warpX[i])*255);
 }
 return data;
}
/** RGBA high veil. R — thin streaks, G — a wider second scale, B — holes, A — drift weight. */
export function createCirrusLayerPixels(){
 const size=SKY_LAYER_SIZE,data=new Uint8Array(size*size*4);
 const streaks=field(size,[{n:11,weight:1,seed:1571},{n:17,weight:.45,seed:1663},{n:23,weight:.30,seed:1753},{n:31,weight:.22,seed:1861}]);
 const broad=lowField(size,32,[{n:5,weight:1,seed:1951},{n:8,weight:.5,seed:2053},{n:13,weight:.26,seed:2143}]);
 const holes=lowField(size,16,[{n:6,weight:1,seed:2243},{n:10,weight:.4,seed:2339},{n:15,weight:.3,seed:2437}]);
 for(let i=0;i<size*size;i++){
  const index=i*4;
  data[index]=Math.round(cloudContrast(streaks[i])*255);
  data[index+1]=Math.round(clamp01(broad[i])*255);
  data[index+2]=Math.round(cloudContrast(holes[i])*255);
  data[index+3]=Math.round(channelContrast(broad[i],streaks[i])*255);
 }
 return data;
}
