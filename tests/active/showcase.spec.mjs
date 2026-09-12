import {test,expect} from '@playwright/test';

test('showcase starts and the traveller can move',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?debug=1');await page.waitForFunction(()=>window.m0?.state().ready);
 await page.locator('#resume').click();
 const before=await page.evaluate(()=>m0.state());
 await page.keyboard.down('KeyW');await page.waitForTimeout(1000);await page.keyboard.up('KeyW');
 const after=await page.evaluate(()=>m0.state());
 expect(after.render.backend).toBe('webgpu');
 expect(Math.hypot(after.player.e-before.player.e,after.player.n-before.player.n)).toBeGreaterThan(0.1);
 expect(after.errors).toEqual([]);expect(errors).toEqual([]);
 // Changing material controls or leaving the window clears input without pausing.
 await page.getByRole('button',{name:'Нормали',exact:true}).click();
 expect(await page.evaluate(()=>m0.state().paused)).toBe(false);
 await page.keyboard.down('KeyW');
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 const stopped=await page.evaluate(()=>m0.state().player);
 await page.waitForTimeout(150);await page.keyboard.up('KeyW');
 const focused=await page.evaluate(()=>m0.state());
 expect(focused.paused).toBe(false);expect(focused.player).toEqual(stopped);
 await page.keyboard.press('Escape');expect(await page.evaluate(()=>m0.state().paused)).toBe(true);
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>m0.state().floor.pending===0&&m0.state().floor.field.farPending===0&&m0.state().floor.field.midPending===0);
 expect((await page.evaluate(()=>m0.state())).floor.field.farTiles).toBe(80);
});
