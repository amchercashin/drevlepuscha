import {openHarness} from './browser.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
process.env.HARNESS_URL='http://127.0.0.1:4176/?scene=m1';
const {browser,page,errors}=await openHarness({width:3440,height:1440});
try{
 await page.waitForTimeout(3500);await page.evaluate(()=>window.m0.setCamera(0,25,5.5));await page.waitForTimeout(800);
 const initial=await page.evaluate(()=>window.m0.state());const backend=initial.render.backend;
 assert.equal(initial.forest.families.length,7);assert.equal(initial.forest.families.reduce((n,f)=>n+f.trees,0),4967);
 assert.ok(initial.forest.families.every(f=>f.trees>0));assert.ok(initial.forest.horizon.geometryBuffers<=100);
 const states=[];await page.evaluate(()=>window.m0.beginMeasurement());
 await page.keyboard.down('KeyW');for(let i=0;i<10;i++){await page.waitForTimeout(500);states.push(await page.evaluate(()=>window.m0.state()));}await page.keyboard.up('KeyW');
 await page.evaluate(()=>window.m0.setCamera(45,45,4));await page.waitForTimeout(1000);
 await page.evaluate(()=>window.m0.teleport(0,37));await page.waitForTimeout(1200);
 await page.keyboard.down('KeyW');await page.waitForTimeout(2000);await page.keyboard.up('KeyW');states.push(await page.evaluate(()=>window.m0.state()));
 const samples=await page.evaluate(()=>window.m0.endMeasurement());samples.sort((a,b)=>a-b);
 assert.ok(states.every(s=>s.camera.followError<1e-5&&s.playerClear&&!s.paused));
 const traversal=[];
 for(const n of [80,160,320,0]){
  await page.evaluate(n=>{window.m0.teleport(0,n);window.m0.setCamera(0,12,5.5);},n);await page.waitForTimeout(1300);const s=await page.evaluate(()=>window.m0.state());traversal.push(s);
  assert.equal(s.forest.activeTrees+s.forest.horizon.distantTrees,4967);assert.equal(s.forest.geometryBuffers,initial.forest.geometryBuffers);assert.ok(s.playerClear&&s.camera.followError<1e-5);
 }
 if(backend==='webgpu'){
  await page.evaluate(()=>{window.m0.teleport(0,8);window.m0.setCamera(25,30,5);});await page.waitForTimeout(1200);await page.screenshot({path:'qa/evidence/forest-variety-ground.png'});
  await page.evaluate(()=>{window.m0.teleport(0,22);window.m0.setCamera(20,0,5.5);});await page.waitForTimeout(1200);await page.screenshot({path:'qa/evidence/forest-variety-trees.png'});
 }
 assert.deepEqual(errors,[]);
 const report={date:new Date().toISOString(),backend,initial,medianMs:samples[Math.floor(samples.length*.5)],p95Ms:samples[Math.floor(samples.length*.95)],maxMs:samples.at(-1),states,traversal,errors,note:'Short fixed route at high resolution, including a slope teleport, followed by separate coverage checks. No GPU headroom or thermal-performance claim.'};
 await writeFile(`qa/evidence/forest-variety-${backend}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,initial:initial.render,states:undefined,traversal:undefined}));
}finally{await browser.close();}
