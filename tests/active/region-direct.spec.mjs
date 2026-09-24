import {test,expect} from '@playwright/test';

test('direct WebGPU region keeps tracking and combat playable',async({page})=>{
 test.setTimeout(90000);
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{if(/GPUValidationError|WebGPU uncaptured error|Error while parsing|Invalid CommandBuffer/i.test(message.text()))errors.push(message.text());});
 await page.goto('/?scene=region&region=brandywine-bridge&debug=1');
 await page.waitForFunction(()=>window.__region?.state().ready);
 await page.locator('#resume').click();
 await page.waitForFunction(()=>window.__region.state().graphics.treeFamilies>=3);
 expect(await page.evaluate(()=>__region.state().renderer)).toBe('direct-webgpu');
 const clue=await page.evaluate(()=>__region.hunt.nextClue);
 await page.evaluate(async point=>__region.travel(point.e,point.n),clue);
 await page.keyboard.press('KeyE');
 expect(await page.evaluate(()=>__region.hunt.state.tracks)).toContain(clue.id);
 await page.evaluate(()=>{const r=__region,s=r.hunt.state.scouts[0],p=r.player;s.e=p.e;s.n=p.n+1.6;s.health=100;s.alert=0;s.mode='patrol';p.heading=0;});
 await page.keyboard.press('Space');await page.keyboard.press('Digit2');
 await page.locator('#world').click({position:{x:700,y:380}});
 expect(await page.evaluate(()=>__region.hunt.state.scouts[0].health)).toBe(45);
 await page.keyboard.press('Digit1');const arrows=await page.evaluate(()=>__region.hunt.state.arrows);
 await page.locator('#world').click({position:{x:700,y:380}});
 expect(await page.evaluate(()=>__region.hunt.state.arrows)).toBe(arrows-1);
 await page.evaluate(()=>__region.save());await page.reload();await page.waitForFunction(()=>window.__region?.state().ready);
 expect(await page.evaluate(()=>__region.hunt.state.tracks)).toContain(clue.id);
 expect(await page.evaluate(()=>__region.hunt.state.arrows)).toBe(arrows-1);
 expect(await page.evaluate(()=>__region.state().errors)).toEqual([]);expect(errors).toEqual([]);
});
