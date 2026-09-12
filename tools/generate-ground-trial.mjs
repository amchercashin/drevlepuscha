import {deflateSync} from 'node:zlib';
import {mkdirSync,writeFileSync} from 'node:fs';
import {groundPatch,groundWarp,GROUND_FIELD} from '../src/domain/ground-patches.ts';

// Authored, periodic material data. Colour and relief come from the same shapes;
// these are not heights guessed from the brightness of a photograph.
const size=512, count=size*size, metres=3.2, depth=.065;
let seed=9122026;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const hash=(x,y)=>{let h=(Math.imul(x,374761393)^Math.imul(y,668265263))>>>0;h=Math.imul(h^(h>>>16),0x7feb352d);h=Math.imul(h^(h>>>15),0x846ca68b);return ((h^(h>>>16))>>>0)/4294967296;};
function noise(x,y,period){
 const a=Math.floor(x),b=Math.floor(y),u=smooth(0,1,x-a),v=smooth(0,1,y-b);
 const h=(i,j)=>hash((i+period)%period,(j+period)%period);
 return (h(a,b)*(1-u)+h(a+1,b)*u)*(1-v)+(h(a,b+1)*(1-u)+h(a+1,b+1)*u)*v;
}
const earth=new Float32Array(count),litter=new Float32Array(count);
const soilColor=new Uint8Array(count*4),leafColor=new Uint8Array(count*4);
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const i=y*size+x;
 const broad=noise(x/size*12,y/size*12,12),clods=noise(x/size*46,y/size*46,46),grain=noise(x/size*128,y/size*128,128);
 earth[i]=.24+.15*broad+.13*clods+.035*grain;
 litter[i]=earth[i]-.035;
 const pigment=.83+.19*broad+.09*clods+.045*grain;
 for(let c=0;c<3;c++){soilColor[i*4+c]=[136,119,91][c]*pigment;leafColor[i*4+c]=[88,85,63][c]*pigment;}
 soilColor[i*4+3]=(0.5+0.5*noise(x/size*78,y/size*78,78))*255;leafColor[i*4+3]=255;
}
// Pebbles and coherent dirt clods, small enough to belong to the material.
for(let k=0;k<550;k++){
 const cx=random()*size,cy=random()*size,r=1.1+random()*3.2,tone=random();
 if(random()>smooth(.15,.85,noise(cx/size*5,cy/size*5,5)))continue;
 for(let yy=Math.floor(cy-r-1);yy<=cy+r+1;yy++)for(let xx=Math.floor(cx-r-1);xx<=cx+r+1;xx++){
  const q=Math.hypot((xx-cx)/r,(yy-cy)/(r*.7));if(q>=1)continue;
  const i=((yy+size)%size)*size+(xx+size)%size,cap=Math.sqrt(1-q*q)*(.05+r*.018);
  earth[i]+=cap;litter[i]+=cap*.65;
  const blend=smooth(1,.65,q)*.65;
  for(let c=0;c<3;c++)soilColor[i*4+c]=soilColor[i*4+c]*(1-blend)+[123+tone*28,116+tone*23,94+tone*20][c]*blend;
 }
}
// A few compressed leaves on the path, denser overlapping curled leaves off it.
function leaves(height,color,total,raised){
 const baseSurface=height.slice();
 for(let k=0;k<total;k++){
  const cx=random()*size,cy=random()*size,len=4+random()*10,width=len*(.26+random()*.3),angle=random()*Math.PI*2;
  const lobes=random()<.4?0:3+Math.floor(random()*4);
  if(random()>.3+.7*noise(cx/size*4,cy/size*4,4))continue;
  const ca=Math.cos(angle),sa=Math.sin(angle),tone=random(),curl=random();
  const col=[111+tone*34,95+tone*26,61+tone*23];
  const base=baseSurface[(Math.floor(cy)%size)*size+Math.floor(cx)%size]+.015+random()*.045;
  for(let yy=Math.floor(cy-len);yy<=cy+len;yy++)for(let xx=Math.floor(cx-len);xx<=cx+len;xx++){
   const dx=xx-cx,dy=yy-cy,u=(dx*ca+dy*sa)/len,v=(-dx*sa+dy*ca)/width;
   const lobe=1+(lobes===0?0:.18*Math.cos(u*lobes*Math.PI+tone*3));
   const shape=Math.abs(v)/(Math.max(.001,1-u*u)*lobe);
   if(Math.abs(u)>=1||shape>=1)continue;
   const i=((yy+size)%size)*size+(xx+size)%size;
   const ridge=Math.exp(-Math.abs(v)*18)*.035;
   const fold=(v*v*(.12+.08*curl)+Math.pow(Math.abs(u),3)*.07)*raised;
   const veins=Math.exp(-Math.abs(Math.sin(u*24-Math.abs(v)*6))*15)*.012;
   const h=base+.028+fold+ridge+veins;
   const cover=smooth(1,.8,shape)*smooth(1,.94,Math.abs(u));
   if(h>height[i]){
    height[i]=height[i]*(1-cover)+h*cover;
    const pigment=.94+.055*Math.sin(u*10+v*7)-ridge*.7-veins;
    for(let c=0;c<3;c++)color[i*4+c]=color[i*4+c]*(1-cover)+col[c]*pigment*cover;
   }
  }
 }
}
leaves(earth,soilColor,46,.24);leaves(litter,leafColor,1150,1);
// Thin, partly buried twigs in the forest layer.
for(let k=0;k<22;k++){
 const x=random()*size,y=random()*size,a=random()*Math.PI*2,len=18+random()*45;
 for(let t=0;t<len;t+=.5)for(let w=-1;w<=1;w++){
  const xx=Math.round(x+Math.cos(a)*t-Math.sin(a)*w),yy=Math.round(y+Math.sin(a)*t+Math.cos(a)*w);
  const i=((yy%size+size)%size)*size+(xx%size+size)%size;
  litter[i]=Math.max(litter[i],.61+(w===0?.035:0));
  for(let c=0;c<3;c++)leafColor[i*4+c]=[91,79,57][c]+(w===0?5:0);
 }
}
const heights=new Uint8Array(count*4),normals=new Uint8Array(count*4);
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const i=y*size+x,at=(xx,yy)=>((yy+size)%size)*size+(xx+size)%size;
 for(const [layer,h] of [earth,litter].entries()){
  heights[i*4+layer]=clamp(h[i])*255;
  // Soft cavity term, not directional baked lighting.
  const avg=(h[at(x-3,y)]+h[at(x+3,y)]+h[at(x,y-3)]+h[at(x,y+3)])/4;
  heights[i*4+2+layer]=clamp(1-Math.max(0,avg-h[i])*2.2,.68,1)*255;
  const dx=(h[at(x+1,y)]-h[at(x-1,y)])*depth*size/(2*metres);
  const dy=(h[at(x,y+1)]-h[at(x,y-1)])*depth*size/(2*metres);
  const length=Math.hypot(dx,dy,1);
  normals[i*4+layer*2]=(-dx/length*.5+.5)*255;normals[i*4+layer*2+1]=(-dy/length*.5+.5)*255;
 }
}
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([name,data])),data.length+8);return out;}
function png(pixels,width=size,height=size){const rows=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)rows.set(pixels.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);const h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(height,4);h[8]=8;h[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
const directory=new URL('../assets/floor/trial/',import.meta.url);mkdirSync(directory,{recursive:true});
for(const [name,data] of Object.entries({heights,normals,soil:soilColor,litter:leafColor}))writeFileSync(new URL(`${name}.png`,directory),png(data));
const field=new Uint8Array(GROUND_FIELD.pixelsE*GROUND_FIELD.pixelsN*4);
for(let y=0;y<GROUND_FIELD.pixelsN;y++)for(let x=0;x<GROUND_FIELD.pixelsE;x++){
 const e=GROUND_FIELD.minE+(x+.5)*GROUND_FIELD.width/GROUND_FIELD.pixelsE,n=GROUND_FIELD.minN+(y+.5)*GROUND_FIELD.height/GROUND_FIELD.pixelsN;
 const p=groundPatch(e,n),warp=groundWarp(e,n),i=(y*GROUND_FIELD.pixelsE+x)*4;
 field.set([p.leaves,p.moss,...warp].map(v=>Math.round(clamp(v)*255)),i);
}
writeFileSync(new URL('patches.png',directory),png(field,GROUND_FIELD.pixelsE,GROUND_FIELD.pixelsN));
writeFileSync(new URL('material.json',directory),JSON.stringify({version:2,source:'Original deterministic procedural material; node --experimental-strip-types tools/generate-ground-trial.mjs',seed:9122026,size,tileMetres:metres,depthMetres:depth,channels:{heights:'R soil height, G litter height, B soil cavity, A litter cavity',normals:'RG soil tangent normal XY, BA litter tangent normal XY',soil:'RGB soil albedo, A fine moss grain',patches:'R leaf density, G moss cover, BA continuous texture warp'},field:GROUND_FIELD,textureMemoryMiBWithMips:(4*size*size+GROUND_FIELD.pixelsE*GROUND_FIELD.pixelsN)*4*4/3/1048576,meshyCredits:0},null,2)+'\n');
console.log('Generated four 512 px material maps and one world patch field. Meshy credits: 0.');
