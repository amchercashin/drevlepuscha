import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWildlifeContent} from '../server/wildlife-content.mjs';
import {WildlifeWorld} from '../src/domain/wildlife/world.ts';
import {localXYZ} from '../src/domain/wildlife/routes.ts';
import {cellId} from '../src/domain/wildlife/ids.ts';
test('same core accepts an unrelated large-world habitat with absolute coordinates and different bounds',()=>{
 const data=loadWildlifeContent(),other=structuredClone(data),de=800000,dn=-300000;
 other.identity.realmId='old-forest-world';const cell=other.cells[0],oldId=cell.id;cell.id=cellId(cell.sites[0].home.e+de,cell.sites[0].home.n+dn);
 const shift=p=>{p.e+=de;p.n+=dn;};
 for(const site of cell.sites){site.cellId=cell.id;site.treeId='world-tree-991';shift(site.home);}
 for(const r of cell.routes){for(const s of r.samples)shift(s.point);shift(r.bounds.min);shift(r.bounds.max);r.treeId='world-tree-991';}
 for(const p of cell.obstacles){shift(p.min);shift(p.max);}
 const run=content=>{const w=new WildlifeWorld({content:content.identity,authorityEpoch:'test',seed:'fixed',cells:new Map(content.cells.map(c=>[c.id,c])),limits:content.limits,bird:content.bird}),p=content.cells[0].sites[0].home;w.advance({simMs:0,environment:{totalGameHours:12,daylight01:1,precipitation01:0},observers:[{...p,e:p.e+50,id:'observer',speedMps:0,headingDeg:0,running:false,observedAtMs:0}]});return w;};
 const a=run(data),b=run(other),pa=a.snapshot().entities[0],pb=b.snapshot().entities[0];assert.notEqual(oldId,cell.id);assert.notEqual(pa.id,pb.id);assert.ok(Math.abs(pa.point.e-(pb.point.e-de))<1e-8);
 const before=b.snapshot();for(const origin of [{e:de,n:dn},{e:de+2048,n:dn-2048},{e:de,n:dn}]){const local=localXYZ(pb.point,origin);assert.ok(Math.abs(local.x+origin.e-pb.point.e)<1e-8);assert.deepEqual(b.snapshot(),before);}
});
