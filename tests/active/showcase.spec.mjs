import {test,expect} from '@playwright/test';

test('showcase starts and the traveller can move',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',message=>{if(message.type()==='warning'&&/WGSL|GPUValidationError|Invalid CommandBuffer|doesn't include BufferUsage/.test(message.text()))errors.push(message.text());});
 const network=await page.context().newCDPSession(page);
 await network.send('Network.enable');await network.send('Network.setCacheDisabled',{cacheDisabled:true});
 await page.goto('/?debug=1');await page.waitForFunction(()=>window.m0?.state().ready);
 const textures=await page.evaluate(()=>performance.getEntriesByType('resource').filter(x=>x.name.endsWith('.webp')).map(x=>x.name));
 expect(textures.length).toBeGreaterThan(0);expect(new Set(textures).size).toBe(textures.length);
 const babylon=await page.evaluate(()=>performance.getEntriesByType('resource').filter(x=>/babylonjs/i.test(x.name)).map(x=>x.name));
 expect(babylon).toEqual([]);
 await page.locator('#resume').click();
 const before=await page.evaluate(()=>m0.state());
 await page.keyboard.down('KeyW');await page.waitForTimeout(1000);await page.keyboard.up('KeyW');
 const after=await page.evaluate(()=>m0.state());
 expect(after.render.backend).toBe('webgpu');
 expect(after.render.pipeline).toBe('direct');
 expect(Math.hypot(after.player.e-before.player.e,after.player.n-before.player.n)).toBeGreaterThan(0.1);
 expect(after.errors).toEqual([]);expect(errors).toEqual([]);
 // Using the daylight controls or leaving the window clears input without pausing.
 await page.locator('#diagnostics > summary').click();
 await page.getByRole('button',{name:'Ночь',exact:true}).click();
 expect((await page.evaluate(()=>m0.state())).lighting.daylight.source).toBe('moon');
 expect(await page.evaluate(()=>m0.state().paused)).toBe(false);
 await page.keyboard.down('KeyW');
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 const stopped=await page.evaluate(()=>m0.state().player);
 await page.waitForTimeout(150);await page.keyboard.up('KeyW');
 const focused=await page.evaluate(()=>m0.state());
 expect(focused.paused).toBe(false);expect(focused.player).toEqual(stopped);
 await page.keyboard.press('Escape');expect(await page.evaluate(()=>m0.state().paused)).toBe(true);
 await page.keyboard.press('Escape');
 expect((await page.evaluate(()=>m0.state())).paused).toBe(false);
});
