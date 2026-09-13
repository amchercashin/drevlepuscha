import {test,expect} from '@playwright/test';
test.use({viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true,screenshot:'off'});
test('phone auto defaults, actual quality differences, LOD restoration and one ranger download',async({page})=>{
 test.setTimeout(90000);const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(/GPUValidationError|WebGPU uncaptured error/.test(m.text()))errors.push(m.text());});
 await page.goto('/?debug=1');await page.waitForFunction(()=>window.m0?.state().ready,null,{timeout:60000});
 let s=await page.evaluate(()=>m0.state());
 expect(s.render.resolutionQuality).toBe('auto');expect(s.render.effectiveQuality).toBe('balanced');
 expect(s.groundTrial.mode).toBe(1);expect(s.forest.smoothTransitions).toBe(false);
 expect(await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>/runtime[^?]*\.glb$/.test(e.name)).length)).toBe(1);
 await page.evaluate(()=>{m0.setAutomatic(false);m0.setTime(12);m0.setPaused(false);document.querySelector('#diagnostics').open=true;});
 const runs=[];
 for(const quality of ['high','balanced','performance','high']){
  await page.locator('#resolution-quality').selectOption(quality);await page.waitForTimeout(400);
  s=await page.evaluate(()=>m0.state());runs.push(s);
  expect(s.render.effectiveQuality).toBe(quality);expect(s.forest.transitions).toBe(0);
 }
 expect(runs[0].render.width).toBe(1688);expect(runs[1].render.width).toBe(1266);expect(runs[2].render.width).toBe(844);
 expect(runs[1].forest.lodCounts[0]).toBeLessThan(runs[0].forest.lodCounts[0]);
 expect(runs[2].forest.lodCounts[0]).toBeLessThanOrEqual(runs[1].forest.lodCounts[0]);
 expect(runs[1].floor.hideM).toBeLessThan(runs[0].floor.hideM);
 expect(runs[3].forest.lodCounts).toEqual(runs[0].forest.lodCounts);
 await page.locator('#resolution-quality').selectOption('performance');
 await page.evaluate(()=>{document.querySelector('#diagnostics').open=false;m0.startTraversal(0,0,true);});
 await page.waitForTimeout(2500);s=await page.evaluate(()=>m0.state());
 expect(s.player.n).toBeGreaterThan(5);expect(s.forest.transitions).toBe(0);expect(s.ranger.gait).toBe('Run');
 expect(s.errors).toEqual([]);expect(errors).toEqual([]);
});
