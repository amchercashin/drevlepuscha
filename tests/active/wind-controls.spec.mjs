import {test,expect} from '@playwright/test';
test('expanded wind controls persist, preview gusts and render at their maximum',async({page})=>{
 test.setTimeout(45000);const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/WebGPU uncaptured|Error while parsing WGSL/.test(m.text()))errors.push(m.text());});
 await page.goto('/?debug=1');await page.waitForFunction(()=>window.m0?.state().ready);await page.locator('#resume').click();
 await page.locator('#diagnostics > summary').click();
 await page.locator('#wind-storm').click();
 await expect(page.locator('#wind-intensity')).toHaveValue('600');await expect(page.locator('#wind-canopyBend')).toHaveValue('300');
 for(const key of ['gustStrength','gustFrequency','canopyBend','coverBend','motionSpeed'])await page.locator(`#wind-${key}`).evaluate(el=>{el.value=el.max;el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('#wind-gust').click();await page.waitForTimeout(2500);
 const max=await page.evaluate(()=>m0.state());expect(max.wind.intensity).toBe(6);expect(max.wind.canopyBend).toBe(4);expect(max.wind.sample.gust01).toBeGreaterThan(0);
 expect(max.render.shadowTriangles).toBeGreaterThan(0);expect(max.errors).toEqual([]);
 // Root/branch data and frozen matrices must remain finite at the upper settings.
 expect(await page.evaluate(()=>m0.inspect().scene.meshes.every(m=>[...m.getWorldMatrix().m].every(Number.isFinite)))).toBe(true);
 await page.reload();await page.waitForFunction(()=>window.m0?.state().ready);await page.locator('#resume').click();await page.locator('#diagnostics > summary').click();
 await expect(page.locator('#wind-intensity')).toHaveValue('600');await expect(page.locator('#wind-canopyBend')).toHaveValue('400');
 await page.locator('#invite-friends').click();await expect(page.locator('#wind-canopyBend')).toBeDisabled();await expect(page.locator('#wind-storm')).toBeDisabled();await expect(page.locator('#wind-gust')).toBeDisabled();
 await page.locator('#friends-leave').click();await expect(page.locator('#wind-canopyBend')).toBeEnabled();await expect(page.locator('#wind-canopyBend')).toHaveValue('400');
 await page.locator('#wind-reset').click();await expect(page.locator('#wind-intensity')).toHaveValue('100');await expect(page.locator('#wind-canopyBend')).toHaveValue('100');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('showcase-wind-v1')).gustStrength)).toBe(1);expect(errors).toEqual([]);
});
