import assert from 'node:assert/strict';
import {openHarness} from './browser.mjs';
import {writeFile} from 'node:fs/promises';
process.env.HARNESS_URL='http://127.0.0.1:4173/?scene=m1';
const {browser,page,errors}=await openHarness({width:1920,height:1080});
try {
 await page.waitForTimeout(4000);
 const backend=(await page.evaluate(()=>window.m0.state())).render.backend;
 if(backend==='webgpu')await page.screenshot({path:`qa/evidence/m1-light-floor-${backend}.png`});
 const initial=await page.evaluate(()=>window.m0.state());assert.ok(initial.floor.cells<=49&&initial.floor.triangles>0);assert.equal(initial.render.width,1920);
 await page.evaluate(()=>window.m0.beginMeasurement());
 await page.keyboard.down('KeyW');await page.waitForTimeout(8000);await page.keyboard.up('KeyW');
 await page.evaluate(()=>window.m0.teleport(0,160));await page.waitForTimeout(2000);
 await page.keyboard.down('KeyW');await page.waitForTimeout(8000);await page.keyboard.up('KeyW');
 const samples=await page.evaluate(()=>window.m0.endMeasurement());samples.sort((a,b)=>a-b);
 const result={state:await page.evaluate(()=>window.m0.state()),errors,frames:samples.length,median:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)],over33:samples.filter(x=>x>33.34).length};
 await page.evaluate(()=>window.m0.setCamera(30,-25,5.5));await page.waitForTimeout(700);if(backend==='webgpu')await page.screenshot({path:`qa/evidence/m1-rays-${backend}.png`});
 assert.deepEqual(errors,[]);assert.deepEqual(result.state.errors,[]);assert.ok(result.state.camera.followError<1e-5);assert.ok(result.state.playerClear);assert.ok(result.state.player.n>170);assert.ok(result.state.floor.cells<=49);
 await page.evaluate(()=>window.m0.teleport(0,0));await page.waitForTimeout(500);const returned=await page.evaluate(()=>window.m0.state());assert.deepEqual(returned.floor,initial.floor);
 await writeFile(`qa/evidence/m1-light-floor-${backend}.json`,JSON.stringify({...result,date:new Date().toISOString(),note:'Short 18-second sample including teleport; 4-second warmup, 1920x1080. Not thermal acceptance.'},null,2));console.log(JSON.stringify({...result,state:undefined}));
}finally{await browser.close();}
