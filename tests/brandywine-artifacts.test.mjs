import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path === 'data/region-source.v0.1.json' ? 'content/regions/brandywine-bridge/region-source.json' : path.startsWith('data/') ? 'content/regions/brandywine-bridge/generated/' + path.slice(5) : 'public/regions/brandywine-bridge/preview/' + path.slice(5), root));
test('preview raster matches documented size, order and hash', () => {
  const m=JSON.parse(read('data/terrain-preview.meta.json')),b=read('data/terrain-preview.f32le');
  assert.equal(b.length,m.columns*m.rows*4);assert.equal(m.columns,251);assert.equal(m.rows,251);
  assert.equal(createHash('sha256').update(b).digest('hex'),m.sha256);
  assert.match(m.order,/SOUTH-first/);assert.equal(m.containsBridgeDecks,false);
});
test('derived topology is synchronized with authoring source', () => {
  const s=JSON.parse(read('data/region-source.v0.1.json')),d=JSON.parse(read('data/topology-derived.json'));
  assert.equal(d.edges.length,s.topology.edges.length);assert.deepEqual(d.nodes,s.topology.nodes);
  for(const e of d.edges) assert.ok(e.lengthM>0);
});
test('standalone viewer script initializes and computes a route with minimal DOM', () => {
  const html=read('maps/region-viewer.html').toString(),js=html.match(/<script>([\s\S]*)<\/script>/)[1];
  const els=new Map(),mk=()=>({value:'',style:{},checked:true,children:[],append(n){this.children.push(n)},replaceChildren(){this.children=[]},setAttribute(){}});
  for(const id of ['start','goal','profile','water','boats','bridge','gate','result','route-highlight','route','terrain-mode','relief-detailed','relief-baseline','section','profile-plot','profile-caption'])els.set(id,mk());
  els.get('profile').value='ranger';els.get('water').value='normal';
  vm.runInNewContext(js,{document:{getElementById:id=>els.get(id),createElement:mk,createElementNS:mk,querySelectorAll:()=>[]}});
  assert.match(els.get('result').textContent,/км/);assert.ok(els.get('route-highlight').children.length>0);
  assert.equal(els.get('profile-plot').children.length,2);
  els.get('terrain-mode').value='baseline';els.get('terrain-mode').onchange();
  assert.equal(els.get('relief-detailed').style.display,'none');
  els.get('bridge').checked=false;els.get('boats').checked=false;els.get('route').onclick();
  assert.match(els.get('result').textContent,/пути нет/);
});
test('published preview records current source and generator inputs', () => {
  const inputs=JSON.parse(read('data/build-inputs.json'));
  for(const [path,hash] of Object.entries(inputs)) assert.equal(createHash('sha256').update(readFileSync(new URL(path,root))).digest('hex'),hash,`Run npm run region:preview: ${path}`);
});
test('two isolated builds reproduce every checked-in preview byte', () => {
  const temp=mkdtempSync(join(tmpdir(),'brandywine-repro-'));
  // Verify the resolved cleanup target is the directory created under the temp root.
  assert.equal(dirname(resolve(temp)),resolve(tmpdir()));
  assert.ok(basename(temp).startsWith('brandywine-repro-'));
  try {
    for(const run of ['a','b']) {
      const result=spawnSync(process.execPath,[fileURLToPath(new URL('../tools/regions/build-brandywine-preview.mjs',import.meta.url)),'--out',join(temp,run)],{encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
    }
    for(const dir of ['data','maps']) for(const name of readdirSync(join(temp,'a',dir))) {
      const a=readFileSync(join(temp,'a',dir,name)),b=readFileSync(join(temp,'b',dir,name));
      const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
      assert.equal(hash(a),hash(b),name);
      assert.equal(hash(a),hash(read(`${dir}/${name}`)),`Stale generated artifact: ${name}`);
    }
  } finally { rmSync(temp,{recursive:true,force:true}); }
});
test('viewer and maps do not depend on external image/script resources',()=>{
  const html=read('maps/region-viewer.html').toString();
  assert.ok(!/<script[^>]+src=/i.test(html));assert.ok(!/<(?:img|image)[^>]+(?:src|href)=["']https?:/i.test(html));
});
