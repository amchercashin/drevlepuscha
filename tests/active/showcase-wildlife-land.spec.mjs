import {test,expect} from '@playwright/test';
test.use({screenshot:'off'});
test('squirrel GLB follows ground, mount and bark route without automatic animatables',async({page})=>{
 test.setTimeout(75000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?debug=1&wildlife=1');await page.waitForFunction(()=>window.m0?.state().ready);await page.locator('#resume').click();
 await page.getByLabel('Место фауны').selectOption('trail-squirrel-01');await page.getByRole('button',{name:'Отойти',exact:true}).click();
 await page.waitForFunction(()=>m0.wildlife.state().frame.entities.some(e=>e.species==='red-squirrel'));
 await page.getByRole('button',{name:'К животному',exact:true}).click();
 await page.waitForFunction(()=>m0.wildlife.state().instances.some(i=>i.id.includes('squirrel')&&i.lod===0));
 await page.getByRole('button',{name:'Подойти',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>m0.wildlife.state().instances.find(i=>i.id.includes('squirrel'))?.clip),{timeout:12000}).toBe('bound_ground');
 await page.waitForFunction(()=>m0.wildlife.state().instances.some(i=>i.id.includes('squirrel')&&i.clip==='climb_up'));
 const climbing=await page.evaluate(()=>m0.wildlife.state());expect(climbing.frame.entities.find(e=>e.species==='red-squirrel').route).toBeTruthy();
 await page.waitForFunction(()=>m0.wildlife.state().instances.some(i=>i.id.includes('squirrel')&&i.clip==='trunk_idle'));
 const state=await page.evaluate(()=>m0.wildlife.state());expect(state.assetErrors).toEqual([]);expect(state.assetLoads).toBeLessThanOrEqual(2);expect(state.instances.every(i=>i.automaticAnimatables===0)).toBe(true);expect(errors).toEqual([]);
});
test('deer candidate loads and chooses a prepared escape in WebGPU',async({page})=>{
 test.setTimeout(50000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?debug=1&wildlife=1');await page.waitForFunction(()=>window.m0?.state().ready);await page.locator('#resume').click();
 await page.getByLabel('Место фауны').selectOption('clearing-deer-01');await page.getByRole('button',{name:'Отойти',exact:true}).click();
 await page.waitForFunction(()=>m0.wildlife.state().frame.entities.some(e=>e.species==='roe-deer'));
 await page.getByRole('button',{name:'К животному',exact:true}).click();
 await page.waitForFunction(()=>m0.wildlife.state().instances.some(i=>i.id.includes('deer')&&i.lod===0));
 await page.getByRole('button',{name:'Подойти',exact:true}).click();
 await page.waitForFunction(()=>m0.wildlife.state().instances.some(i=>i.id.includes('deer')&&i.clip==='run_loop'));
 const state=await page.evaluate(()=>m0.wildlife.state());expect(state.assetErrors).toEqual([]);expect(state.instances.every(i=>i.automaticAnimatables===0)).toBe(true);expect(state.frame.entities.find(e=>e.species==='roe-deer').route).toBeTruthy();expect(errors).toEqual([]);
});
