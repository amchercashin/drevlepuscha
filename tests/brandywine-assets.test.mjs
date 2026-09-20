import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const base=new URL('../public/regions/brandywine-bridge/assets/',import.meta.url),index=JSON.parse(readFileSync(new URL('index.json',base)));
test('regional assets contain bounded geometry, complete textures and three levels for generated models',()=>{
 assert.equal(Object.keys(index).length,23);
 for(const [id,spec]of Object.entries(index)){
  const model=JSON.parse(gunzipSync(readFileSync(new URL(spec.data,base))));assert.equal(model.levels.length,id.startsWith('grass')||id.startsWith('flowers')||id==='fern'?1:3);
  for(const m of model.materials)if(m.texture)assert.ok(existsSync(new URL(m.texture,base)));
  let previous=Infinity;for(const parts of model.levels){const triangles=parts.reduce((n,p)=>n+p.indices.length/3,0);assert.ok(triangles>0&&triangles<=previous);previous=triangles;
   for(const p of parts){assert.equal(p.normals.length,p.positions.length);assert.equal(p.uvs.length,p.positions.length/3*2);assert.ok(p.positions.every(Number.isFinite));assert.ok(p.indices.every(i=>i>=0&&i<p.positions.length/3));}
  }
 }
});
test('bridge paving meets its physical deck height at all visible LODs',()=>{
 const model=JSON.parse(gunzipSync(readFileSync(new URL(index['bridge-span'].data,base))));
 for(const parts of model.levels)for(const x of [-5,0,5]){let top=-Infinity;
  for(const p of parts)for(let i=0;i<p.indices.length;i+=3){const [a,b,c]=p.indices.slice(i,i+3).map(j=>p.positions.slice(j*3,j*3+3)),d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-8)continue;
   const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(-c[2]))/d,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(-c[2]))/d;if(u>=0&&v>=0&&u+v<=1)top=Math.max(top,a[1]*u+b[1]*v+c[1]*(1-u-v));
  }assert.ok(Math.abs(top-8)<.005,`paving at ${x}: ${top}`);
 }
});
