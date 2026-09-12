import {test,expect} from '@playwright/test';

test('1:1 world starts and its map opens',async({page})=>{
 test.setTimeout(90_000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?scene=world&debug=1');await page.waitForFunction(()=>window.oldForest?.state().ready,undefined,{timeout:90_000});
 await page.locator('#resume').click();
 expect(await page.evaluate(()=>oldForest.state().render.backend)).toBe('webgpu');
 await page.keyboard.press('KeyM');
 await expect(page.getByRole('button',{name:'Закрыть карту',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>oldForest.state().mapOpen)).toBe(true);
 expect(await page.evaluate(()=>oldForest.state().errors)).toEqual([]);expect(errors).toEqual([]);
});
