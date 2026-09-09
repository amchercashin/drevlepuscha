import {openHarness} from './browser.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
process.env.HARNESS_URL=process.env.HARNESS_URL||'http://127.0.0.1:4173/?scene=m1&air=1';
const {browser,page,errors}=await openHarness({width:3440,height:1440});
try{
 await page.waitForTimeout(4000);
 const initial=await page.evaluate(()=>window.m0.state());
 assert.ok(initial.render.width*initial.render.height>3600000);
 await page.evaluate(()=>window.m0.beginMeasurement());
 const states=[];
 await page.keyboard.down('KeyW');
 for(let i=0;i<8;i++){await page.waitForTimeout(1000);states.push(await page.evaluate(()=>window.m0.state()));}
 await page.keyboard.up('KeyW');
 await page.evaluate(()=>window.m0.setCamera(30,-25,5.5));
 for(let i=0;i<4;i++){await page.waitForTimeout(1000);states.push(await page.evaluate(()=>window.m0.state()));}
 const samples=await page.evaluate(()=>window.m0.endMeasurement());samples.sort((a,b)=>a-b);
 const report={date:new Date().toISOString(),viewport:{width:3440,height:1440},render:initial.render,frames:samples.length,medianMs:samples[Math.floor(samples.length*.5)],p95Ms:samples[Math.floor(samples.length*.95)],maxTotalTriangles:Math.max(...states.map(s=>s.render.triangles)),maxMainTriangles:Math.max(...states.map(s=>s.render.mainTriangles)),maxShadowTriangles:Math.max(...states.map(s=>s.render.shadowTriangles)),states,errors};
 assert.deepEqual(errors,[]);assert.ok(states.every(s=>s.camera.followError<1e-5&&s.playerClear&&!s.paused));
 await writeFile(process.env.BUDGET_OUTPUT||'qa/evidence/light-budget.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,states:undefined}));
}finally{await browser.close();}
