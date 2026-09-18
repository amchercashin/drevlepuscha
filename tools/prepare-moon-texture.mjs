// Deterministic runtime texture preparation; preserves the supplied artwork.
// PNG RGB/RGBA 8-bit decoder uses only Node, so this authoring step is portable.
import {readFileSync,writeFileSync} from 'node:fs';
import {inflateSync,deflateSync} from 'node:zlib';
const input=process.argv[2]??'assets/sky/source/moon-generated.png';
const output=process.argv[3]??'assets/sky/moon-albedo.png';
const png=readFileSync(input),width=png.readUInt32BE(16),height=png.readUInt32BE(20),channels=png[25]===2?3:4;
if(png[24]!==8||![2,6].includes(png[25])||png[28]!==0)throw Error('Expected non-interlaced RGB/RGBA 8-bit PNG');
const chunks=[];
for(let p=8;p<png.length;){const n=png.readUInt32BE(p);if(png.toString('ascii',p+4,p+8)==='IDAT')chunks.push(png.subarray(p+8,p+8+n));p+=n+12;}
const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,data=Buffer.alloc(width*height*channels);
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
for(let y=0;y<height;y++){
 const filter=raw[y*(stride+1)];
 for(let x=0;x<stride;x++){
  const i=y*stride+x,a=x>=channels?data[i-channels]:0,b=y?data[i-stride]:0,c=y&&x>=channels?data[i-stride-channels]:0;
  const prediction=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];if(prediction===undefined)throw Error('Invalid PNG filter');
  data[i]=(raw[y*(stride+1)+x+1]+prediction)&255;
 }
}
const visible=(x,y)=>{const p=(y*width+x)*channels;return (data[p]+data[p+1]+data[p+2])/3>40;};
const xs=[],ys=[];
for(let x=0;x<width;x++)if(visible(x,Math.floor(height/2)))xs.push(x);
for(let y=0;y<height;y++)if(visible(Math.floor(width/2),y))ys.push(y);
const cx=(xs[0]+xs.at(-1))/2,cy=(ys[0]+ys.at(-1))/2,rx=(xs.at(-1)-xs[0])/2,ry=(ys.at(-1)-ys[0])/2;
if(rx<width*.35||ry<height*.35)throw Error('Cannot locate full lunar disc');
const size=512,rows=Buffer.alloc((size*3+1)*size);
function sample(x,y,c){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;const at=(a,b)=>data[(Math.max(0,Math.min(height-1,b))*width+Math.max(0,Math.min(width-1,a)))*channels+c];return (at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy;}
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,r=Math.hypot(u,v),edge=r>.982?.982/r:1;
 // Radially extend the interior rim into ALL outside pixels before mip generation.
 for(let c=0;c<3;c++)rows[y*(size*3+1)+1+x*3+c]=Math.round(sample(cx+u*edge*rx,cy+v*edge*ry,c));
}
function crc32(buffer){let crc=0xffffffff;for(const b of buffer){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,bytes){const head=Buffer.from(type),n=Buffer.alloc(4),crc=Buffer.alloc(4);n.writeUInt32BE(bytes.length);crc.writeUInt32BE(crc32(Buffer.concat([head,bytes])));return Buffer.concat([n,head,bytes,crc]);}
const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=2;
writeFileSync(output,Buffer.concat([png.subarray(0,8),chunk('IHDR',header),chunk('IDAT',deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]));
console.log({input,output,cx,cy,rx,ry,size,bytes:readFileSync(output).length});
