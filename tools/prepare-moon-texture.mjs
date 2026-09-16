import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {basename} from 'node:path';
import {deflateSync,inflateSync} from 'node:zlib';
/**
 * Turns a generated full-moon image into the sky's painted moon.
 *
 *   node tools/prepare-moon-texture.mjs <image.png>
 *
 * The shader draws a sphere through a tangent plane, so the file must be a complete
 * front-facing disc. The circle stays where it is, the space around it becomes
 * transparent when the source has no alpha, and the result is scaled to a power of
 * two. All of that happens here rather than in the shader, which keeps the fragment
 * cost at one texture fetch.
 */
const SIZE=Number(process.env.MOON_SIZE??512);
const source=process.argv[2];
if(!source)throw new Error('Usage: node tools/prepare-moon-texture.mjs <image.png>');

function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}

/** Minimal PNG decode: 8-bit truecolour with or without alpha, no interlace. */
function decodePng(bytes){
 if(bytes.readUInt32BE(0)!==0x89504e47)throw new Error('Not a PNG file');
 let offset=8,width=0,height=0,channels=0,bitDepth=0,colourType=0,interlaced=0;
 const chunks=[];
 while(offset<bytes.length){
  const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+length);
  offset+=12+length;
  if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);bitDepth=data[8];colourType=data[9];interlaced=data[12];}
  else if(type==='IDAT')chunks.push(data);
  else if(type==='IEND')break;
 }
 if(bitDepth!==8)throw new Error(`Only 8-bit PNG is supported, got ${bitDepth}`);
 if(interlaced)throw new Error('Interlaced PNG is not supported');
 if(![2,6].includes(colourType))throw new Error(`Only RGB and RGBA PNG are supported, got colour type ${colourType}`);
 channels=colourType===6?4:3;
 const raw=inflateSync(Buffer.concat(chunks)),stride=width*channels,pixels=Buffer.alloc(height*stride);
 let read=0;
 for(let y=0;y<height;y++){
  const filter=raw[read++],line=raw.subarray(read,read+stride);read+=stride;
  const previous=y>0?pixels.subarray((y-1)*stride,y*stride):Buffer.alloc(stride),target=pixels.subarray(y*stride,(y+1)*stride);
  for(let x=0;x<stride;x++){
   const a=x>=channels?target[x-channels]:0,b=previous[x],c=x>=channels?previous[x-channels]:0,value=line[x];
   target[x]=filter===0?value:filter===1?(value+a)&255:filter===2?(value+b)&255:filter===3?(value+((a+b)>>1))&255:(value+paeth(a,b,c))&255;
  }
 }
 return {width,height,channels,pixels};
}

const CRC_TABLE=(()=>{const table=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c;}return table;})();
function crc32(buffer){let c=0xffffffff;for(const byte of buffer)c=CRC_TABLE[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
/** Minimal PNG encode: 8-bit RGBA, no interlace. */
function encodePng(rgba,width,height){
 const stride=width*4,raw=Buffer.alloc((stride+1)*height);
 for(let y=0;y<height;y++){raw[y*(stride+1)]=0;Buffer.from(rgba.buffer,rgba.byteOffset+y*stride,stride).copy(raw,y*(stride+1)+1);}
 const chunk=(type,data)=>{
  const head=Buffer.alloc(8);head.writeUInt32BE(data.length,0);head.write(type,4,'ascii');
  const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4),data])),0);
  return Buffer.concat([head,data,crc]);
 };
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}

const image=decodePng(readFileSync(source));
if(image.width!==image.height)throw new Error(`The disc must be square, got ${image.width}x${image.height}`);
const {width:sourceSize,channels,pixels}=image;
// An opaque disc on a dark ground still needs its corners cleared, or the sphere shows
// a square. A source that carries real alpha is trusted instead.
let alphaFromSource=channels===4;
if(!alphaFromSource){
 const corners=[[0,0],[sourceSize-1,0],[0,sourceSize-1],[sourceSize-1,sourceSize-1]];
 const dark=corners.every(([x,y])=>pixels[(y*sourceSize+x)*channels]<16);
 const centre=pixels[((sourceSize>>1)*sourceSize+(sourceSize>>1))*channels];
 alphaFromSource=dark&&centre>16;
}
const output=new Uint8Array(SIZE*SIZE*4),scale=sourceSize/SIZE;
for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
 const sx=(x+.5)*scale-.5,sy=(y+.5)*scale-.5;
 const x0=Math.max(0,Math.min(sourceSize-1,Math.floor(sx))),y0=Math.max(0,Math.min(sourceSize-1,Math.floor(sy)));
 const x1=Math.min(sourceSize-1,x0+1),y1=Math.min(sourceSize-1,y0+1),fx=sx-x0,fy=sy-y0;
 const sample=(channel,px,py)=>pixels[(py*sourceSize+px)*channels+channel];
 const bilinear=channel=>{const a=sample(channel,x0,y0),b=sample(channel,x1,y0),c=sample(channel,x0,y1),d=sample(channel,x1,y1);return (a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;};
 let alpha=255;
 if(alphaFromSource){
  if(channels===4)alpha=bilinear(3);
  else{
   const radius=SIZE/2,distance=Math.hypot(x+.5-radius,y+.5-radius);
   alpha=distance<=radius-1.5?255:distance>=radius?0:Math.round(255*(radius-distance)/1.5);
  }
 }
 const index=(y*SIZE+x)*4;
 output[index]=Math.round(bilinear(0));output[index+1]=Math.round(bilinear(1));output[index+2]=Math.round(bilinear(2));output[index+3]=Math.round(alpha);
}
mkdirSync('assets/sky',{recursive:true});
const png=encodePng(output,SIZE,SIZE);
writeFileSync('assets/sky/moon.png',png);
// The module ships the same bytes inside the engine chunk, so the moon needs no second
// request and survives being served from a repository subpath.
const lines=png.toString('base64').match(/.{1,120}/g).map(line=>`'${line}'`).join('+\n');
writeFileSync('src/domain/moon-texture.ts',`/** Generated from ${basename(source)} by tools/prepare-moon-texture.mjs. Do not edit. */
export const MOON_TEXTURE_SIZE=${SIZE};
export const MOON_TEXTURE_PNG_BASE64=
${lines};
`);
console.log(JSON.stringify({source:basename(source),written:['assets/sky/moon.png','src/domain/moon-texture.ts'],size:SIZE,alphaFromSource,pngBytes:png.length}));
