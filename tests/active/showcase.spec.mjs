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
});
