import {test,expect} from '@playwright/test';

test('ground material modes compile, remain opaque and permit walking',async({page})=>{
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/?debug=1');await page.waitForFunction(()=>window.m0?.state().ready);
 await page.locator('#resume').click();
 await page.evaluate(()=>{m0.setAutomatic(false);m0.setTime(14);m0.setCamera(0,28,4);});
 await page.waitForTimeout(1000);
 const measurements=[];
 const median=values=>{const a=values.sort((a,b)=>a-b);return a[Math.floor(a.length/2)];};
 for(const mode of [0,1,2]){
  const button=page.locator(`[data-ground-mode="${mode}"]`);await button.click();
  await expect(button).toHaveAttribute('aria-pressed','true');
  await page.waitForTimeout(500);await page.evaluate(()=>m0.beginMeasurement());
  await page.waitForTimeout(2000);
  const data=await page.evaluate(()=>({frames:m0.endMeasurement(),costs:m0.frameCosts(),s:m0.state(),opaque:m0.inspect().world.groundTrial.mesh.visibility}));
  expect(data.s.groundTrial.mode).toBe(mode);expect(data.opaque).toBe(1);
  expect(data.s.faded.some(m=>m.id.startsWith('ground-trial'))).toBe(false);
  expect(data.s.errors).toEqual([]);expect(data.frames.length).toBeGreaterThan(20);
  measurements.push({mode,frameMs:median(data.frames),mainGpuMs:median(data.costs.map(c=>c.gpuMs)),cpuMs:median(data.costs.map(c=>c.cpuMs))});
 }
 const before=await page.evaluate(()=>m0.state());
 await page.keyboard.down('KeyW');await page.waitForTimeout(1800);await page.keyboard.up('KeyW');
 const after=await page.evaluate(()=>m0.state());
 expect(after.player.n-before.player.n).toBeGreaterThan(1);
 expect(after.playerClear).toBe(true);expect(after.camera.clearance).toBeGreaterThan(.23);
 expect(after.render.backend).toBe('webgpu');expect(errors).toEqual([]);
 // A single optional inspection frame; no screenshot series or saved benchmark report.
 if(process.env.GROUND_TRIAL_FRAME)await page.screenshot({path:process.env.GROUND_TRIAL_FRAME});
 console.log('Ground trial',JSON.stringify({resolution:[after.render.width,after.render.height],measurements,trial:after.groundTrial}));
});
