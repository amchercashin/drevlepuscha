import {test,expect} from '@playwright/test';
import patches from '../../config/wildlife/insect-sites.json' with {type:'json'};
test.use({screenshot:'off'});
test('local Meshy butterfly uses shared load budget, stops in pause and fades in heavy rain',async({page})=>{
 test.setTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?debug=1&wildlife=1');await page.waitForFunction(()=>window.m0?.state().ready);await page.locator('#resume').click();
 await page.evaluate(p=>{m0.teleport(p.e,p.n);},patches[0]);await page.waitForFunction(()=>m0.wildlife.state().insects.instances>0);
 const a=await page.evaluate(()=>({w:m0.wildlife.state(),positions:m0.inspect().scene.transformNodes.filter(n=>n.name.startsWith('local-insect:')).map(n=>n.position.asArray())}));expect(a.w.assetLoads).toBeLessThanOrEqual(2);expect(a.w.insects.instances).toBeLessThanOrEqual(a.w.insects.limit);expect(a.w.insects.automaticAnimatables).toBe(0);
 await page.evaluate(()=>m0.setPaused(true));const position=await page.evaluate(()=>m0.inspect().scene.transformNodes.find(n=>n.name.startsWith('local-insect:')).position.asArray());await page.waitForTimeout(250);expect(await page.evaluate(()=>m0.inspect().scene.transformNodes.find(n=>n.name.startsWith('local-insect:')).position.asArray())).toEqual(position);
 await page.evaluate(()=>{m0.setPaused(false);m0.setWeather('rain',0);});await page.waitForFunction(()=>m0.wildlife.state().insects.instances===0,null,{timeout:12000});
 await page.evaluate(()=>m0.wildlife.dispose());expect(await page.evaluate(()=>m0.inspect().scene.transformNodes.filter(n=>n.name.startsWith('local-insect:')).length)).toBe(0);expect(errors).toEqual([]);
});
