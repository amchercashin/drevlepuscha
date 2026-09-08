import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, assertSupported } from '../tools/schema-validator.mjs';
import { runValidation, semanticRegionErrors, semanticCameraErrors, provenanceErrors } from '../tools/validate-content.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const schema=()=>read('schemas/region.schema.json');
const region=()=>read('content/sandbox/riverbend.region.json');
test('all content examples and semantic checks pass',()=>assert.deepEqual(runValidation(),[]));
test('region requires explicit units',()=>{const r=region();delete r.units;assert.ok(validate(schema(),r).length);});
test('region rejects unsupported units',()=>{const r=region();r.units='pixels';assert.ok(validate(schema(),r).length);});
test('region rejects negative river width',()=>{const r=region();r.rivers[0].stations[0].widthM=-1;assert.ok(validate(schema(),r).length);});
test('schema rejects extra properties',()=>{const r=region();r.latitude=45;assert.ok(validate(schema(),r).length);});
test('schema validator rejects unsupported keywords rather than ignoring',()=>assert.throws(()=>assertSupported({type:'string',format:'email'}),/Unsupported/));
test('schema validates nested ref',()=>{const r=region();r.artFocus.h='up';assert.ok(validate(schema(),r).length);});
test('semantic check rejects downstream rise',()=>{const r=region();r.rivers[0].stations[1].h=1000;assert.ok(semanticRegionErrors(r).some(e=>e.includes('rises')));});
test('semantic check rejects duplicate IDs',()=>{const r=region();r.places[1].id=r.places[0].id;assert.ok(semanticRegionErrors(r).some(e=>e.includes('Duplicate')));});
test('semantic check rejects canonical claim for sandbox',()=>{const r=region();r.provenance.status='canonical';assert.ok(semanticRegionErrors(r).some(e=>e.includes('invented')));});
test('canonical manifest stays uncalibrated and empty',()=>{const c=read('content/canon/world.manifest.json');assert.equal(c.coverage,'unmapped');assert.equal(c.source,null);assert.equal(c.bounds,null);assert.deepEqual(c.regionFiles,[]);assert.equal(c.releaseAllowed,false);});

const cameras=()=>read('config/camera-presets.json');
test('save JSON schema rejects duplicate discovered IDs',()=>{const f=read('content/sandbox/save.example.json');f.discoveredIds.push(f.discoveredIds[0]);assert.ok(validate(read('schemas/save.schema.json'),f).some(e=>e.includes('duplicate')));});
test('uniqueItems compares objects independent of property order',()=>assert.ok(validate({type:'array',uniqueItems:true},[{a:1,b:2},{b:2,a:1}]).length));
test('new POI schema rejects geometry outside normalized bounds',()=>{const f=read('content/canon/drevlepuscha/poi.json');f.features[1].geometry.coordinates[0]=1.1;assert.ok(validate(read('schemas/drevlepuscha-poi.schema.json'),f).length);});
test('new POI schema rejects a canonical label on authored geometry',()=>{const f=read('content/canon/drevlepuscha/poi.json');f.geometryProvenance.status='canonical';assert.ok(validate(read('schemas/drevlepuscha-poi.schema.json'),f).length);});
test('nested source references must exist and be unique',()=>{
 assert.ok(provenanceErrors({features:[{existence:{sourceRefs:['missing']}}]},new Set()).some(e=>e.includes('unknown')));
 assert.ok(provenanceErrors({sourceRefs:['a','a']},new Set(['a'])).some(e=>e.includes('duplicate')));
 const r=region();r.places[0].provenance.sourceId='missing';assert.ok(provenanceErrors(r,new Set(['sandbox-design-v01'])).some(e=>e.includes('unknown')));
});
test('nested sandbox POIs cannot claim canonical status',()=>{const r=region();r.places[0].provenance.status='canonical';assert.ok(semanticRegionErrors(r).some(e=>e.includes('invented')));});
test('camera config rejects strings and out-of-range review presets',()=>{
 const c=cameras();c.visualReviewPresets[0].pitchDeg='10';assert.ok(validate(read('schemas/camera-presets.schema.json'),c).length);
 const d=cameras();d.visualReviewPresets[0].pitchDeg=80;assert.ok(semanticCameraErrors(d).some(e=>e.includes('outside')));
});
// Small isolated copies exercise file discovery; no working files are modified.
function changedValidation(change) {
 const root=mkdtempSync(join(tmpdir(),'drevlepuscha-contract-'));
 try {
  for(const dir of ['schemas','content','config']) cpSync(fileURLToPath(new URL('../'+dir,import.meta.url)),join(root,dir),{recursive:true});
  mkdirSync(join(root,'references'));cpSync(fileURLToPath(new URL('../references/sources.json',import.meta.url)),join(root,'references/sources.json'));
  const get=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
  const set=(p,v)=>writeFileSync(join(root,p),JSON.stringify(v));
  change(get,set);return runValidation(root);
 } finally {rmSync(root,{recursive:true,force:true});}
}
test('every regionFiles entry receives structural validation',()=>{
 const errors=changedValidation((get,set)=>{const m=get('content/sandbox/world.manifest.json');m.regionFiles.push('content/sandbox/extra.region.json');set('content/sandbox/world.manifest.json',m);set('content/sandbox/extra.region.json',{contentRevision:m.contentRevision,generatorVersion:m.generatorVersion});});
 assert.ok(errors.some(e=>e.includes('extra.region.json')&&e.includes('required')));
});
test('every regionFiles entry receives semantic validation',()=>{
 const errors=changedValidation((get,set)=>{const m=get('content/sandbox/world.manifest.json');m.regionFiles.push('content/sandbox/extra.region.json');set('content/sandbox/world.manifest.json',m);const r=region();r.rivers[0].stations[1].h=1000;set('content/sandbox/extra.region.json',r);});
 assert.ok(errors.some(e=>e.includes('extra.region.json')&&e.includes('rises')));
});
test('source register rejects duplicate IDs',()=>assert.ok(changedValidation((get,set)=>{const r=get('references/sources.json');r.sources.push(r.sources[0]);set('references/sources.json',r);}).some(e=>e.includes('Duplicate source ID'))));
test('manifest rejects reversed bounds',()=>assert.ok(changedValidation((get,set)=>{const m=get('content/sandbox/world.manifest.json');m.bounds.minE=m.bounds.maxE;set('content/sandbox/world.manifest.json',m);}).some(e=>e.includes('bounds ordering'))));
test('macro layout rejects reversed slice bounds',()=>assert.ok(changedValidation((get,set)=>{const m=get('content/canon/drevlepuscha/macro-map.json');m.firstSlice.boundsNormalized=[0.8,0.1,0.2,0.9];set('content/canon/drevlepuscha/macro-map.json',m);}).some(e=>e.includes('normalized bounds ordering'))));
test('POI feature IDs must be unique',()=>assert.ok(changedValidation((get,set)=>{const p=get('content/canon/drevlepuscha/poi.json');p.features[1].id=p.features[0].id;set('content/canon/drevlepuscha/poi.json',p);}).some(e=>e.includes('Duplicate Drevlepuscha'))));
