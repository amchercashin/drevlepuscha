import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {createGeography,nearestOnLine,sampleRaster,placementSeed} from '../src/domain/geography.mjs';
import {validateGeography} from '../tools/geography/validate.mjs';
import {openHeightmap} from '../tools/geography/read-heightmap.mjs';
const url=new URL('../content/geography/old-forest/',import.meta.url),source=readFileSync(new URL('geography.json',url),'utf8'),g=JSON.parse(source),m=createGeography(g),sources=new Set(JSON.parse(readFileSync(new URL('../references/sources.json',import.meta.url))).sources.map(s=>s.id));
const sha=b=>createHash('sha256').update(b).digest('hex');
test('geography: source links, downstream confluences, spatial constraints and route order',()=>{assert.deepEqual(validateGeography(g,sources),[]);});
test('geography: rejects upstream rivers, moved house, broken provenance and route order',()=>{
 for(const mutate of [x=>x.features.find(f=>f.id==='withywindle').water.stations[1][2]=999,x=>x.features.find(f=>f.id==='tom_house').geometry.coordinates=[0,0],x=>x.features[0].existence.sourceRefs=['unknown'],x=>x.features.find(f=>f.id==='frodo_route').route.checkpointIds.reverse()]){const x=structuredClone(g);mutate(x);assert.ok(validateGeography(x,sources).length);}
});
test('geography: no underwater route, no abrupt steps; preserved local up/down/up',()=>{
 const r=m.features.get('frodo_route').geometry.coordinates;let max=0;
 for(let i=1;i<r.length;i++){const a=r[i-1],b=r[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),count=Math.ceil(length/4);let previous=m.height(...a);
  for(let j=1;j<=count;j++){const e=a[0]+(b[0]-a[0])*j/count,n=a[1]+(b[1]-a[1])*j/count,h=m.height(e,n);assert.ok(Number.isFinite(h));max=Math.max(max,Math.abs(h-previous)/(length/count));for(const w of m.nearbyWater(e,n))if(w.distance<w.feature.water.widthM/2)assert.ok(h>=w.h-.05,`Route under water at ${e},${n}`);previous=h;}
 }assert.ok(max<.45,`Route maximum grade ${(max*100).toFixed(1)}% exceeds 45% (24°); no claim about in-game walkability`);
});
test('geography: seeded repeatability and protected placement',()=>{
 const other=createGeography(g),points=[[4500,27000],[10000,33700],[17460,19160],[22400,19350],[16000,25000]];
 assert.equal(placementSeed(30180926,'ancient_broadleaf_core',-3,7,0),37558526);assert.notEqual(placementSeed(30180926,'ancient_broadleaf_core',-3,7,0),placementSeed(30180926,'ancient_broadleaf_core',-3,7,1));
 const reverse=[...points].reverse().map(p=>other.height(...p)).reverse();assert.deepEqual(points.map(p=>m.height(...p)),reverse);
 const hill=m.features.get('bald_hill'),[he,hn]=hill.geometry.coordinates;for(let i=0;i<16;i++){const a=i*Math.PI/8;assert.ok(m.height(he,hn)>m.height(he+Math.cos(a)*hill.placement.reserveM,hn+Math.sin(a)*hill.placement.reserveM)+18,'Bare crown must rise above a tree ring');}
 assert.equal(m.zoneAt(-8000,0),null);assert.equal(m.exclusion(2600,27300),'bonfire_glade');assert.equal(m.exclusion(17460,19160),'old_man_willow');assert.equal(m.zoneAt(15000,34000).id,'north_dry_conifers');
});
test('geography: export revision, hashes, byte ranges, imported heights and tile seams',()=>{
 const directory=new URL('generated/',url).pathname,hm=openHeightmap(directory),v=hm.manifest;
 try{
  for(const [p,hash]of Object.entries(v.generatorInputs))assert.equal(sha(readFileSync(new URL('../'+p,import.meta.url))),hash);
  assert.equal(v.inputSha256,sha(source));assert.equal(v.contentRevision,g.contentRevision);assert.equal(v.generatorVersion,g.generatorVersion);
  for(const rec of [v.base,v.detail])assert.equal(sha(readFileSync(directory+rec.file)),rec.sha256);
  const bytes=readFileSync(directory+v.detail.file);let offset=0,raw=0;const keys=new Set(v.detail.tiles.map(t=>t.id));
  for(const t of v.detail.tiles){assert.equal(t.byteOffset,offset);assert.equal(t.decodedByteOffset,raw);assert.equal(sha(bytes.subarray(offset,offset+t.byteLength)),t.sha256);offset+=t.byteLength;raw+=t.decodedByteLength;
   const a=hm.tile(t.id),[x,y]=t.id.split(',').map(Number),n=a.columns;
   for(const [dx,dy] of [[1,0],[0,1]]){const neighbor=hm.tile(`${x+dx},${y+dy}`);
    for(let i=0;i<n;i+=8){const e=a.origin[0]+(dx?(n-1)*2:i*2),north=a.origin[1]+(dy?(n-1)*2:i*2),h=sampleRaster(a,e,north),other=neighbor?sampleRaster(neighbor,e,north):sampleRaster(hm.base,e,north);assert.ok(Math.abs(h-other)<.0001,`Seam ${t.id} ${dx},${dy}: ${h-other}`);}
   }
   for(const p of [[a.origin[0]+256,a.origin[1]+256],[a.origin[0]+128,a.origin[1]+128]])assert.ok(Math.abs(hm.sample(...p)-m.height(...p))<.02,'Interior sample differs from model');
  }assert.equal(offset,bytes.length);assert.equal(raw,v.detail.decodedByteLength);
  for(const f of g.features.filter(f=>f.water&&f.id!=='brandywine')){const p=f.water.stations;for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i],count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/64);for(let j=0;j<count;j++){const e=a[0]+(b[0]-a[0])*j/count,n=a[1]+(b[1]-a[1])*j/count,water=a[2]+(b[2]-a[2])*j/count;assert.ok(hm.sample(e,n)<water+.35,'Exported bed above water '+f.id+' at '+e+','+n);}}}
  const patch=hm.patch128(22272,19200);assert.equal(patch.values.length,65*65);assert.equal(patch.values[64],hm.sample(22400,19200));assert.throws(()=>hm.patch128(1,0));
  assert.throws(()=>hm.sample(g.bounds.minE-1,g.bounds.minN),RangeError);
  // Read actual exported detail at named terrain points, rather than testing generator alone.
  for(const id of ['bald_hill','old_man_willow','tom_house','approach_knoll','tom_hill_brow']){const p=m.features.get(id).geometry.coordinates;assert.ok(Math.abs(hm.sample(...p)-m.height(...p))<.15,id);}
 }finally{hm.close();}
});
