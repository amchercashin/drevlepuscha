import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';
import {createGeography,nearestOnLine,pointInRing} from '../src/domain/geography.mjs';
import {openHeightmap} from '../tools/geography/read-heightmap.mjs';
import {validateGeography} from '../tools/geography/validate.mjs';
const dir=new URL('../content/geography/old-forest/',import.meta.url),g=JSON.parse(readFileSync(new URL('geography.json',dir))),m=createGeography(g);
const sources=new Set(JSON.parse(readFileSync(new URL('../references/sources.json',import.meta.url))).sources.map(s=>s.id));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
test('sculpt: secret paths join the journey and remain inside the forest',()=>{
 const main=m.features.get('frodo_route').geometry.coordinates,ring=m.features.get('forest_boundary').geometry.coordinates[0],paths=g.features.filter(f=>f.route?.hidden);
 assert.equal(paths.length,6);
 for(const f of paths){const p=f.geometry.coordinates;assert.ok(nearestOnLine(...p[0],main).distance<.01,f.id+' start');
  if(!f.route.deadEnd)assert.ok(nearestOnLine(...p.at(-1),main).distance<.01,f.id+' rejoin');
  for(const q of p)assert.ok(pointInRing(...q,ring),f.id+' outside forest');
  assert.equal(f.existence.status,'authored');assert.equal(f.geometryProvenance.status,'authored');
 }
});
test('sculpt: narrow clear floors and asymmetric shoulders, protected original scenes',()=>{
 const ribbon=g.terrain.sculpt.ribbons.find(r=>r.id==='west-hollow'),i=Math.floor(ribbon.points.length/2),p=ribbon.points[i],a=ribbon.points[i-1],b=ribbon.points[i+1],d=distance(a,b),normal=[-(b[1]-a[1])/d,(b[0]-a[0])/d];
 const left=m.height(p[0]+normal[0]*24,p[1]+normal[1]*24),right=m.height(p[0]-normal[0]*24,p[1]-normal[1]*24),floor=m.height(...p);
 assert.ok((left+right)/2-floor>3,'A visible hollow, not just a renamed flat path');
 const asymmetries=[];
 for(const t of [.2,.3,.4,.5,.6,.7,.8]){const j=Math.floor(ribbon.points.length*t),q=ribbon.points[j],a=ribbon.points[j-1],b=ribbon.points[j+1],d=distance(a,b),ne=-(b[1]-a[1])/d,nn=(b[0]-a[0])/d;
  asymmetries.push(Math.abs(m.height(q[0]+ne*24,q[1]+nn*24)-m.height(q[0]-ne*24,q[1]-nn*24)));
 }
 assert.ok(asymmetries.filter(v=>v>1).length>=4,'The sequence must contain at least four clearly asymmetric sections');
 for(const id of g.terrain.sculpt.protectIds)assert.equal(m.sculptHeight(...m.features.get(id).geometry.coordinates),0,id);
});
test('sculpt: reject a crossed forest boundary and malformed path heights',()=>{
 const bad=structuredClone(g),ring=bad.features.find(f=>f.id==='forest_boundary').geometry.coordinates[0];[ring[2],ring[10]]=[ring[10],ring[2]];
 assert.ok(validateGeography(bad,sources).some(s=>s.includes('Self-intersection')));
 const broken=structuredClone(g);broken.features.find(f=>f.route).route.surface.stations[0][2]=NaN;
 assert.ok(validateGeography(broken,sources).some(s=>s.includes('surface')));
});
test('sculpt: every route is dry and below 45% grade in the EXPORTED heightmap',()=>{
 const hm=openHeightmap(fileURLToPath(new URL('generated/',dir)));
 try{for(const f of g.features.filter(f=>f.route)){
  let max=0;const points=f.geometry.coordinates;
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],d=distance(a,b),count=Math.ceil(d);let previous=hm.sample(...a);
   for(let j=1;j<=count;j++){
    const e=a[0]+(b[0]-a[0])*j/count,n=a[1]+(b[1]-a[1])*j/count,h=hm.sample(e,n);
    assert.ok(Number.isFinite(h));max=Math.max(max,Math.abs(h-previous)/(d/count));previous=h;
    for(const w of m.nearbyWater(e,n))if(w.distance<w.feature.water.widthM/2)assert.ok(h>=w.h-.05,f.id+' under water');
   }
  }
  assert.ok(max<.45,`${f.id}: exported maximum grade ${(max*100).toFixed(2)}%, must stay below 45%`);
 }}finally{hm.close();}
});
test('sculpt: gameplay scale stays near two hours and the manifest area matches the simple polygon',()=>{
 const manifest=JSON.parse(readFileSync(new URL('generated/manifest.json',dir))),p=m.features.get('forest_boundary').geometry.coordinates[0];let area=0;
 for(let i=1;i<p.length;i++)area+=p[i-1][0]*p[i][1]-p[i][0]*p[i-1][1];
 assert.ok(Math.abs(Math.abs(area)/2e6-manifest.summary.forestAreaKm2)<1e-6);
 assert.ok(manifest.summary.walkingHoursAt1_85Mps>=1.8&&manifest.summary.walkingHoursAt1_85Mps<=2.2);
 assert.equal(g.contentRevision,'old-forest-gameplay-2.0.0');
 assert.ok(g.calibration.warning.includes('not 1:1'));
});
