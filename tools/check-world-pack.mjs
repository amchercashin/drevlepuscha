/** Checks the actual published terrain grids, not a tiny substitute terrain. */
import {readFileSync,statSync,readdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {triangleHeight} from '../src/world/math.ts';
const root='public/world/',manifest=JSON.parse(readFileSync(root+'manifest.json'));
const cache=new Map();
function grid(id){if(cache.has(id))return cache.get(id);const spec=manifest.tiles[id],bytes=readFileSync(root+spec.file);assert.equal(bytes.length,spec.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),spec.sha256);const raw=gunzipSync(bytes),values=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)),[x,y]=id.split(',').map(Number),columns=512/spec.stepM+1;assert.equal(values.length,columns*columns);assert.ok(values.every(Number.isFinite));const g={origin:[x*512,y*512],stepM:spec.stepM,columns,rows:columns,values};if(cache.size>200)cache.delete(cache.keys().next().value);cache.set(id,g);return g;}
let joins=0,worst=0;for(const id of Object.keys(manifest.tiles)){const [x,y]=id.split(',').map(Number),a=grid(id);for(const [dx,dy] of [[1,0],[0,1]]){const next=(x+dx)+','+(y+dy);if(!manifest.tiles[next])continue;const b=grid(next);for(let j=0;j<=512;j+=2){const e=(x+dx)*512+(dy?j:0),n=(y+dy)*512+(dx?j:0),error=Math.abs(triangleHeight(a,e,n)-triangleHeight(b,e,n));worst=Math.max(worst,error);assert.ok(error<.0001,`Terrain seam ${id}/${next}: ${error}`);}joins++;}}
const size=dir=>readdirSync(dir,{withFileTypes:true}).reduce((n,f)=>n+(f.isDirectory()?size(dir+'/'+f.name):statSync(dir+'/'+f.name).size),0);
assert.equal(Object.keys(manifest.tiles).length,7040);assert.ok(size('dist')<250*1048576,'Published size budget');const map=JSON.parse(gunzipSync(readFileSync(root+manifest.map)));const source=JSON.parse(readFileSync('content/geography/old-forest/geography.json'));assert.deepEqual(map.pois.map(p=>p.id),source.features.filter(f=>f.geometry.type==='Point').map(f=>f.id));assert.equal(map.zones.length,9);
console.log(JSON.stringify({tiles:7040,joins,worstSeamM:worst,worldMiB:size(root)/1048576,distMiB:size('dist')/1048576,pois:map.pois.length,zones:map.zones.length,trails:map.trails.length}));
