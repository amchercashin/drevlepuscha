import {openHarness} from './browser.mjs';
import {writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const afterOnly=process.argv.includes('--after-only');
const reports=afterOnly?JSON.parse(await readFile('qa/evidence/floor-art-comparison.json','utf8')).reports.filter(r=>r.label==='before'):[];
for(const [label,port] of (afterOnly?[['after',4176]]:[['before',4175],['after',4176]])){
 process.env.HARNESS_URL=`http://127.0.0.1:${port}/?scene=m1`;
 const {browser,page,errors}=await openHarness({width:3440,height:1440});
 try{
  await page.waitForTimeout(3500);await page.evaluate(()=>window.m0.setCamera(0,25,5.5));await page.waitForTimeout(800);
  const initial=await page.evaluate(()=>window.m0.state());const states=[];
  await page.evaluate(()=>window.m0.beginMeasurement());
  await page.keyboard.down('KeyW');for(let i=0;i<10;i++){await page.waitForTimeout(500);states.push(await page.evaluate(()=>window.m0.state()));}await page.keyboard.up('KeyW');
  await page.evaluate(()=>window.m0.setCamera(45,45,4));await page.waitForTimeout(1000);
  await page.evaluate(()=>window.m0.teleport(0,37));await page.waitForTimeout(1200);
  await page.keyboard.down('KeyW');await page.waitForTimeout(2000);await page.keyboard.up('KeyW');states.push(await page.evaluate(()=>window.m0.state()));
  const samples=await page.evaluate(()=>window.m0.endMeasurement());samples.sort((a,b)=>a-b);
  assert.deepEqual(errors,[]);assert.ok(states.every(s=>s.playerClear&&s.camera.followError<1e-5&&s.floor.cells<=49&&!s.paused));
  if(label==='after'){
   await page.evaluate(()=>{window.m0.teleport(0,8);window.m0.setCamera(20,30,5);});await page.waitForTimeout(1400);
   await page.screenshot({path:'qa/evidence/floor-art-ground.png'});
   await page.evaluate(()=>{window.m0.teleport(0,18);window.m0.setCamera(0,15,5);});await page.waitForTimeout(1400);
   await page.screenshot({path:'qa/evidence/floor-art-trail.png'});
   await page.evaluate(()=>window.m0.teleport(0,0));await page.waitForTimeout(1400);
   assert.deepEqual((await page.evaluate(()=>window.m0.state())).floor,initial.floor);
  }
  reports.push({label,date:new Date().toISOString(),render:initial.render,floor:initial.floor,medianMs:samples[Math.floor(samples.length*.5)],p95Ms:samples[Math.floor(samples.length*.95)],maxMs:samples.at(-1),states,errors});
 }finally{await browser.close();}
}
await writeFile('qa/evidence/floor-art-comparison.json',JSON.stringify({note:'Short sequential WebGPU comparison, 3440x1440 window / high quality. Includes slope teleport; not thermal acceptance or uncapped GPU timing.',reports},null,2));
console.log(JSON.stringify(reports.map(({states,...r})=>r)));
