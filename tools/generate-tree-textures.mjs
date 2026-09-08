import {deflateSync} from 'node:zlib';
import {writeFileSync} from 'node:fs';
// Original periodic pigment fields; no reference pixels are copied into game assets.
const size=512;
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([name,data])),data.length+8);return out;}
function png(kind){const raw=Buffer.alloc(size*(1+size*4));for(let y=0;y<size;y++){for(let x=0;x<size;x++){
 const u=x/size*Math.PI*2,v=y/size*Math.PI*2;
 const grain=((Math.imul(x+17,374761393)^Math.imul(y+3,668265263))>>>0)%997/997;
 let f;
 if(kind==='bark'){
  const warp=u+0.13*Math.sin(v*2)+0.055*Math.sin(v*5+u*2);
  const furrow=Math.pow(Math.max(0,Math.cos(warp*16+0.7*Math.sin(v*3))),14);
  const fine=Math.pow(Math.max(0,Math.cos(warp*41+Math.sin(v*8))),24);
  f=0.91-0.24*furrow-0.09*fine+0.04*Math.sin(warp*6+v)+0.06*(grain-0.5);
 }else{
  const wash=Math.sin(u*5+Math.sin(v*4))*Math.cos(v*7+Math.sin(u*3));
  const leaf=Math.sin(u*29+1.2*Math.sin(v*19))*Math.cos(v*37+Math.sin(u*23));
  const fleck=Math.max(0,Math.sin(u*57+v*31)*Math.sin(v*51-u*23));
  f=0.80+0.105*wash+0.07*leaf+0.10*fleck+0.055*(grain-0.5);
 }
 const value=Math.round(Math.min(1,Math.max(0,f))*255),at=y*(1+size*4)+1+x*4;raw[at]=value;raw[at+1]=value;raw[at+2]=value;raw[at+3]=255;
 }}const hdr=Buffer.alloc(13);hdr.writeUInt32BE(size);hdr.writeUInt32BE(size,4);hdr[8]=8;hdr[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
for(const kind of ['bark','canopy'])writeFileSync(`assets/trees/${kind}.png`,png(kind));
