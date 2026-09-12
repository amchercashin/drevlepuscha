/** Seeded, tileable sky data. Generated once at startup, never per frame. */
export const SKY_TEXTURE_SIZE=256;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
function hash(x:number,y:number,seed:number){
 let h=Math.imul(x+seed,374761393)+Math.imul(y,668265263);
 h=Math.imul(h^(h>>>13),1274126177);
 return ((h^(h>>>16))>>>0)/4294967295;
}
function noise(u:number,v:number,frequency:number,seed:number){
 const x=u*frequency,y=v*frequency,ix=Math.floor(x),iy=Math.floor(y);
 const fx=x-ix,fy=y-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
 const sample=(a:number,b:number)=>hash(((a%frequency)+frequency)%frequency,((b%frequency)+frequency)%frequency,seed);
 const a=sample(ix,iy),b=sample(ix+1,iy),c=sample(ix,iy+1),d=sample(ix+1,iy+1);
 return (a+(b-a)*sx)*(1-sy)+(c+(d-c)*sx)*sy;
}
function fbm(u:number,v:number,seed:number){
 return noise(u,v,4,seed)*.5+noise(u,v,8,seed+1)*.26+noise(u,v,16,seed+2)*.14+noise(u,v,32,seed+3)*.07+noise(u,v,64,seed+4)*.03;
}
export function createCloudPixels(){
 const size=SKY_TEXTURE_SIZE,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x)*4,u=x/size,v=y/size;
  data[i]=Math.round(fbm(u,v,37)*255);
  data[i+1]=Math.round(noise(u,v,16,71)*255);
  data[i+2]=Math.round(noise(u,v,64,93)*255);data[i+3]=255;
 }
 return data;
}
/** Lunar maria and crater relief, baked to albedo; no external image or runtime crater loops. */
export function createMoonPixels(){
 const size=SKY_TEXTURE_SIZE,data=new Uint8Array(size*size*4),height=new Float32Array(size*size);
 const maria=Array.from({length:9},(_,i)=>({x:.18+hash(i,1,51)*.64,y:.18+hash(i,2,51)*.64,rx:.06+hash(i,3,51)*.12,ry:.05+hash(i,4,51)*.11}));
 for(let i=0;i<90;i++){
  const cx=hash(i,1,192)*size,cy=hash(i,2,192)*size,r=2+hash(i,3,192)**3*24;
  for(let y=Math.max(0,Math.floor(cy-r*1.3));y<Math.min(size,cy+r*1.3);y++)for(let x=Math.max(0,Math.floor(cx-r*1.3));x<Math.min(size,cx+r*1.3);x++){
   const d=Math.hypot(x-cx,y-cy)/r;
   height[y*size+x]+=.65*Math.exp(-(((d-1)/.11)**2))-.32*Math.max(0,1-d*d);
  }
 }
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size,index=y*size+x,i=index*4;
  const grain=fbm(u,v,133),warp=(noise(u,v,16,173)-.5)*.06;
  let sea=0;
  for(const m of maria){const d=((u-m.x+warp)/m.rx)**2+((v-m.y+warp)/m.ry)**2;sea=Math.max(sea,1-clamp((d-.5)*1.4));}
  const slope=height[y*size+Math.min(size-1,x+1)]-height[Math.max(0,y-1)*size+x];
  const tone=clamp(.70+grain*.28-sea*.27+slope*.25);
  data[i]=Math.round(tone*239);data[i+1]=Math.round(tone*246);data[i+2]=Math.round(tone*255);data[i+3]=255;
 }
 return data;
}
