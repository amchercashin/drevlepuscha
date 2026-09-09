import {readFileSync,writeFileSync,mkdirSync,openSync,writeSync,closeSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync,deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createGeography,sampleRaster,smooth,clamp,nearestOnLine} from '../../src/domain/geography.mjs';
import {validateGeography} from './validate.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),dir=resolve(root,'content/geography/old-forest');
const json=readFileSync(resolve(dir,'geography.json'),'utf8'),g=JSON.parse(json),sources=JSON.parse(readFileSync(resolve(root,'references/sources.json'),'utf8')).sources;
const errors=validateGeography(g,new Set(sources.map(s=>s.id)));if(errors.length)throw Error(errors.join('\n'));
const m=createGeography(g),b=g.bounds,sha=x=>createHash('sha256').update(x).digest('hex');
const out=resolve(dir,'generated');mkdirSync(out,{recursive:true});
const step=g.terrain.baseStepM,cols=(b.maxE-b.minE)/step+1,rows=(b.maxN-b.minN)/step+1;
const base={origin:[b.minE,b.minN],stepM:step,columns:cols,rows,values:new Float32Array(cols*rows)};
console.log(`Base ${cols}×${rows}; ${(base.values.byteLength/1048576).toFixed(1)} MiB decoded.`);
let min=Infinity,max=-Infinity;
for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const v=Math.round(m.height(b.minE+x*step,b.minN+y*step)*64)/64;base.values[y*cols+x]=v;min=Math.min(min,v);max=Math.max(max,v);}
function encode(values){const buf=Buffer.allocUnsafe(values.length*4);for(let i=0;i<values.length;i++)buf.writeFloatLE(values[i],i*4);return buf;}
const baseCompressed=gzipSync(encode(base.values),{level:6});writeFileSync(resolve(out,'base.f32.gz'),baseCompressed);
const manifest={schemaVersion:1,generatorInputs:Object.fromEntries(['src/domain/geography.mjs','tools/geography/build.mjs','tools/geography/atlas.html'].map(p=>[p,sha(readFileSync(resolve(root,p)))])),contentRevision:g.contentRevision,generatorVersion:g.generatorVersion,inputSha256:sha(json),format:'Float32',heightQuantizationM:1/64,endianness:'little',units:'metres',rowOrder:'south-to-north',columnOrder:'west-to-east',nodeConvention:'inclusive end nodes; not cell centres',base:{file:'base.f32.gz',compression:'gzip',origin:base.origin,stepM:step,columns:cols,rows,minH:min,maxH:max,sha256:sha(baseCompressed)},detail:{file:'detail.f32.gz',compression:'concatenated-gzip-members',tileSizeM:g.terrain.detailTileSizeM,stepM:g.terrain.detailStepM,edgeBlendM:32,tiles:[]},profiles:[],summary:{}};
const size=g.terrain.detailTileSizeM,margin=g.terrain.detailMarginM,selected=new Set();
const add=(e,n)=>{for(let x=Math.floor((e-margin)/size);x<=Math.floor((e+margin)/size);x++)for(let y=Math.floor((n-margin)/size);y<=Math.floor((n+margin)/size);y++)if(x*size>=b.minE&&y*size>=b.minN&&(x+1)*size<=b.maxE&&(y+1)*size<=b.maxN)selected.add(x+','+y);};
for(const f of g.features){
 if(f.geometry.type==='Point'){const p=f.geometry.coordinates;add(...p);continue;}
 if(!f.route&&!f.water)continue;
 // Brandywine contextual trunk stays at 16 m except the confluence.
 if(f.id==='brandywine')continue;
 const p=f.geometry.coordinates;for(let i=1;i<p.length;i++){const a=p[i-1],c=p[i],count=Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1])/64);for(let j=0;j<=count;j++)add(a[0]+(c[0]-a[0])*j/count,a[1]+(c[1]-a[1])*j/count);}
}
const tiles=[...selected].map(k=>k.split(',').map(Number)).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);console.log(`Detail ${tiles.length} tiles; ${(tiles.length*257*257*4/1048576).toFixed(1)} MiB decoded.`);
const fd=openSync(resolve(out,'detail.f32.gz'),'w'),detailHash=createHash('sha256');let offset=0,rawOffset=0;
for(const [tx,ty]of tiles){
 const origin=[tx*size,ty*size],count=size/g.terrain.detailStepM+1,values=new Float32Array(count*count);
 const missing=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)if(!selected.has((tx+dx)+','+(ty+dy)))missing.push([(tx+dx)*size,(ty+dy)*size]);
 for(let j=0;j<count;j++)for(let i=0;i<count;i++){
  const e=origin[0]+i*2,n=origin[1]+j*2;let dist=32;
  for(const [x,y]of missing)dist=Math.min(dist,Math.hypot(Math.max(x-e,0,e-x-size),Math.max(y-n,0,n-y-size)));
  const coarse=sampleRaster(base,e,n);values[j*count+i]=coarse+(Math.round(m.height(e,n)*64)/64-coarse)*smooth(dist/32);
 }
 const data=gzipSync(encode(values),{level:6});writeSync(fd,data);detailHash.update(data);
 manifest.detail.tiles.push({id:`${tx},${ty}`,origin,columns:count,rows:count,byteOffset:offset,byteLength:data.length,decodedByteOffset:rawOffset,decodedByteLength:values.byteLength,sha256:sha(data)});
 offset+=data.length;rawOffset+=values.byteLength;
}
closeSync(fd);manifest.detail.sha256=detailHash.digest('hex');manifest.detail.decodedByteLength=rawOffset;
function profile(id,name,points,spacing){let distance=0;const samples=[];for(let i=1;i<points.length;i++){
 const a=points[i-1],c=points[i],d=Math.hypot(c[0]-a[0],c[1]-a[1]),count=Math.ceil(d/spacing);
 for(let j=0;j<count;j++){const e=a[0]+(c[0]-a[0])*j/count,n=a[1]+(c[1]-a[1])*j/count;samples.push([distance+d*j/count,m.height(e,n),e,n]);}distance+=d;
 }const p=points.at(-1);samples.push([distance,m.height(...p),...p]);
 let maxGrade=0,totalAscent=0,totalDescent=0;for(let i=1;i<samples.length;i++){const dh=samples[i][1]-samples[i-1][1];maxGrade=Math.max(maxGrade,Math.abs(dh)/(samples[i][0]-samples[i-1][0]));if(dh>0)totalAscent+=dh;else totalDescent-=dh;}
 return {id,name,sampleColumns:['distanceM','heightM','eastM','northM'],distanceM:distance,maxGrade,totalAscentM:totalAscent,totalDescentM:totalDescent,samples};}
for(const f of g.features.filter(f=>f.route))manifest.profiles.push(profile(f.id,f.name,f.geometry.coordinates,8));
manifest.profiles.push(profile('valley-cross-section','Поперёк долины',[[17100,18000],[17100,20400]],4));
manifest.profiles.push(profile('house-approach','Подход к дому',[[21600,18820],[21900,19000],[22100,19080],[22400,19350],[22950,19730]],2));
const route=manifest.profiles[0];let area=0;const ring=g.features[0].geometry.coordinates[0];for(let i=1;i<ring.length;i++)area+=ring[i-1][0]*ring[i][1]-ring[i][0]*ring[i-1][1];
manifest.summary={featureCount:g.features.length,forestAreaKm2:Math.abs(area)/2e6,frameWidthKm:(b.maxE-b.minE)/1000,frameHeightKm:(b.maxN-b.minN)/1000,routeKm:route.distanceM/1000,walkingHoursAt1_85Mps:route.distanceM/1.85/3600,decodedMiB:(base.values.byteLength+rawOffset)/1048576,compressedMiB:(baseCompressed.length+offset)/1048576};
manifest.landmarks=Object.fromEntries(g.features.filter(f=>f.geometry.type==='Point').map(f=>[f.id,m.height(...f.geometry.coordinates)]));
writeFileSync(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
// Lossless original hillshade, not copied source artwork. Minimal PNG writer, no new dependencies.
function crc(buf){let c=0xffffffff;for(const v of buf){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,buf){const t=Buffer.from(type),v=Buffer.concat([t,buf]),h=Buffer.alloc(4),tail=Buffer.alloc(4);h.writeUInt32BE(buf.length);tail.writeUInt32BE(crc(v));return Buffer.concat([h,v,tail]);}
const w=900,h=Math.round(w*(b.maxN-b.minN)/(b.maxE-b.minE)),pixels=Buffer.alloc((w*3+1)*h);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const e=b.minE+x/(w-1)*(b.maxE-b.minE),n=b.maxN-y/(h-1)*(b.maxN-b.minN),z=sampleRaster(base,e,n);
 const dx=(m.height(e+16,n)-m.height(e-16,n))/32,dy=(m.height(e,n+16)-m.height(e,n-16))/32;
 const shade=clamp((1+dx*1.8-dy*2.4)/Math.sqrt(1+dx*dx+dy*dy),0.2,1.4),a=clamp(z/450);
 const color=[205+30*a,214-22*a,181-32*a].map(c=>Math.round(clamp(c*(0.64+0.32*shade),0,255)));
 const idx=y*(w*3+1)+1+x*3;pixels[idx]=color[0];pixels[idx+1]=color[1];pixels[idx+2]=color[2];
}
const header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;header[9]=2;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
const zw=450,zh=Math.round(zw*h/w),zp=Buffer.alloc((zw*4+1)*zh);
for(let y=0;y<zh;y++)for(let x=0;x<zw;x++){
 const e=b.minE+x/(zw-1)*(b.maxE-b.minE),n=b.maxN-y/(zh-1)*(b.maxN-b.minN),zone=m.zoneAt(e,n);
 if(!zone)continue;const c=zone.color.slice(1).match(/../g).map(v=>parseInt(v,16)),i=y*(zw*4+1)+1+x*4;
 zp[i]=c[0];zp[i+1]=c[1];zp[i+2]=c[2];zp[i+3]=160;
}
const zhead=Buffer.from(header);zhead.writeUInt32BE(zw);zhead.writeUInt32BE(zh,4);zhead[9]=6;
const zonePng=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',zhead),chunk('IDAT',deflateSync(zp)),chunk('IEND',Buffer.alloc(0))]);

const template=readFileSync(resolve(root,'tools/geography/atlas.html'),'utf8');
const used=new Set();const scan=o=>{if(!o||typeof o!=='object')return;if(o.sourceRefs)o.sourceRefs.forEach(x=>used.add(x));Object.values(o).forEach(scan);};scan(g);
const payload={geography:g,manifest,sources:sources.filter(s=>used.has(s.id)),zoneOverlay:'data:image/png;base64,'+zonePng.toString('base64'),hillshade:'data:image/png;base64,'+png.toString('base64')};
writeFileSync(resolve(out,'atlas.html'),template.replace('/*__DOMAIN__*/',readFileSync(resolve(root,'src/domain/geography.mjs'),'utf8').replace(/^export /gm,'')).replace('/*__DATA__*/',JSON.stringify(payload).replace(/</g,'\\u003c')));
console.log(JSON.stringify(manifest.summary));
