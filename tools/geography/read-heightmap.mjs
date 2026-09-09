/** Offline reference importer. Runtime may use the same range metadata with fetch. */
import {readFileSync,openSync,readSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {sampleRaster} from '../../src/domain/geography.mjs';
export function decodeFloat32LE(buf){if(buf.length%4)throw Error('Invalid Float32 byte length');const values=new Float32Array(buf.length/4);for(let i=0;i<values.length;i++)values[i]=buf.readFloatLE(i*4);return values;}
export function openHeightmap(directory){
 const manifest=JSON.parse(readFileSync(resolve(directory,'manifest.json'),'utf8'));
 const base={...manifest.base,values:decodeFloat32LE(gunzipSync(readFileSync(resolve(directory,manifest.base.file))))};
 if(base.values.length!==base.columns*base.rows)throw Error('Invalid base dimensions');
 const tiles=new Map(manifest.detail.tiles.map(t=>[t.id,t])),cache=new Map(),fd=openSync(resolve(directory,manifest.detail.file),'r');let closed=false;
 function tile(id){if(closed)throw Error('Heightmap closed');if(cache.has(id))return cache.get(id);const t=tiles.get(id);if(!t)return null;
  const buf=Buffer.alloc(t.byteLength);let done=0;while(done<buf.length){const n=readSync(fd,buf,done,buf.length-done,t.byteOffset+done);if(!n)throw Error('Truncated detail file');done+=n;}
  const values=decodeFloat32LE(gunzipSync(buf));if(values.length!==t.columns*t.rows)throw Error('Invalid detail dimensions');
  const grid={...t,stepM:manifest.detail.stepM,values};if(cache.size>=8)cache.delete(cache.keys().next().value);cache.set(id,grid);return grid;
 }
 return {manifest,base,tile,sample(e,n){if(closed)throw Error('Heightmap closed');const coarse=sampleRaster(base,e,n),s=manifest.detail.tileSizeM,t=tile(Math.floor(e/s)+','+Math.floor(n/s));return t?sampleRaster(t,e,n):coarse;},close(){if(!closed){closed=true;closeSync(fd);cache.clear();}}};
}
