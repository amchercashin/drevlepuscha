import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=resolve(root,'qa/evidence/map-stage2');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.RELIEF_URL??'http://127.0.0.1:4281/tools/geography/relief-preview.html');
 await page.waitForFunction(()=>window.reliefPreview?.ready,{},{timeout:60000});
 const cases=[];
 for(const id of ['root_secret','fern_bowl','hidden_saddle','quiet_amphitheatre','high_bank','fall_window']){
  await page.evaluate(id=>window.reliefPreview.select(id),id);await page.waitForFunction(()=>window.reliefPreview.ready);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:resolve(out,id+'.png')});
  const state=await page.evaluate(()=>{const s=window.reliefPreview.inspect();return {meshes:s.scene.meshes.length,vertices:s.scene.getTotalVertices(),materials:s.scene.materials.length};});
  assert.ok(state.meshes>0&&state.meshes<20,'Bounded local mesh count');cases.push({id,...state});
 }
 await page.evaluate(()=>window.reliefPreview.select('root_secret'));await page.locator('#ground').click();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:resolve(out,'root-secret-ground.png')});
 await page.locator('#overview').click();await page.evaluate(async()=>{const {camera}=window.reliefPreview.inspect();for(let i=0;i<30;i++){camera.alpha+=.025;await new Promise(requestAnimationFrame);}});
 await page.screenshot({path:resolve(out,'root-secret-rotated.png')});assert.deepEqual(errors,[]);
 const source=readFileSync(resolve(root,'content/geography/old-forest/geography.json')),report={status:'passed',scope:'Actual authoring terrain in a separate WebGL viewer; no final forest assets or game traversal claim',inputSha256:createHash('sha256').update(source).digest('hex'),cases,errors};
 writeFileSync(resolve(out,'review.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
