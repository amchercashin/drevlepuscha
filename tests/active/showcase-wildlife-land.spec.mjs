import {test,expect} from '@playwright/test';
test.use({screenshot:'off'});
test('squirrel GLB follows ground, mount and bark route without automatic animatables',async({page})=>{
 test.setTimeout(75000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?debug=1&wildlife=1');await page.waitForFunction(()=>window.m0?.state().ready);await page.locator('#resume').click();
 await page.getByLabel('Место фауны').selectOption('trail-squirrel-01');await page.getByRole('button',{name:'Отойти',exact:true}).click();
 await page.waitForFunction(()=>m0.wildlife.state().frame.entities.some(e=>e.species==='red-squirrel'));
 await page.getByRole('button',{name:'К животному',exact:true}).click();
 await page.waitForFunction(()=>m0.wildlife.state().instances.some(i=>i.id.includes('trail-squirrel-01')&&i.lod===0));
 await page.evaluate(()=>{window.__landClips=[];const record=()=>{const clip=m0.wildlife.state().instances.find(i=>i.id.includes('trail-squirrel-01'))?.clip;if(clip&&!window.__landClips.includes(clip))window.__landClips.push(clip);requestAnimationFrame(record);};record();});
 await page.getByRole('button',{name:'Подойти',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>m0.wildlife.state().instances.find(i=>i.id.includes('trail-squirrel-01'))?.clip),{timeout:12000}).toBe('bound_ground');
 await page.waitForFunction(()=>m0.wildlife.state().instances.some(i=>i.id.includes('trail-squirrel-01')&&i.clip==='climb_up'));
 const climbing=await page.evaluate(()=>m0.wildlife.state());expect(climbing.frame.entities.find(e=>e.siteId==='trail-squirrel-01').route).toBeTruthy();
 await page.waitForFunction(()=>m0.wildlife.state().instances.some(i=>i.id.includes('trail-squirrel-01')&&i.clip==='trunk_idle'));
 const clips=await page.evaluate(()=>window.__landClips);expect(clips).toContain('mount_trunk');
 const state=await page.evaluate(()=>m0.wildlife.state());expect(state.assetErrors).toEqual([]);expect(state.assetLoads).toBeLessThanOrEqual(2);expect(state.instances.every(i=>i.automaticAnimatables===0)).toBe(true);expect(errors).toEqual([]);
 await page.getByLabel('Место фауны').selectOption('trail-squirrel-02');await page.getByRole('button',{name:'Отойти',exact:true}).click();await page.waitForFunction(()=>m0.wildlife.state().frame.entities.some(e=>e.siteId==='trail-squirrel-02'));await page.getByRole('button',{name:'К животному',exact:true}).click();await page.waitForFunction(()=>m0.wildlife.state().instances.some(i=>i.id.includes('trail-squirrel-02')&&i.lod===0));
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
test('shared land episodes use the same real skins, route and authority phase on two clients',async({page,browser})=>{
 test.setTimeout(95000);let guest;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('/?debug=1&wildlife=1');await page.waitForFunction(()=>window.m0?.state().ready);await page.locator('#resume').click();await page.locator('#invite-friends').click();guest=await browser.newPage();guest.on('pageerror',e=>errors.push(e.message));await guest.goto(await page.locator('#friends-link').inputValue());await guest.waitForFunction(()=>window.m0?.state().ready);await guest.locator('#resume').click();
  for(const [site,species,clip] of [['trail-squirrel-01','red-squirrel','bound_ground'],['clearing-deer-01','roe-deer','run_loop']]){
   for(const p of [page,guest]){await p.getByLabel('Место фауны').selectOption(site);await p.getByRole('button',{name:'Отойти',exact:true}).click();}
   await Promise.all([page,guest].map(p=>p.waitForFunction(id=>m0.wildlife.state().frame.entities.some(e=>e.siteId===id),site)));
   for(const p of [page,guest])await p.getByRole('button',{name:'К животному',exact:true}).click();
   await guest.getByRole('button',{name:'Подойти',exact:true}).click();
   await Promise.all([page,guest].map(p=>p.waitForFunction(({site,clip})=>m0.wildlife.state().instances.some(i=>i.id.includes(site)&&i.clip===clip),{site,clip})));
   const states=await Promise.all([page,guest].map(p=>p.evaluate(site=>{const w=m0.wildlife.state();return {entity:w.frame.entities.find(e=>e.siteId===site),errors:w.assetErrors,instances:w.instances,audio:m0.state().ambient};},site)));
   expect(states[0].entity.id).toBe(states[1].entity.id);expect(states[0].entity.route).toEqual(states[1].entity.route);expect(states[0].entity.routeStartMs).toBe(states[1].entity.routeStartMs);expect(states[0].entity.stateSinceMs).toBe(states[1].entity.stateSinceMs);
   for(const s of states){expect(s.audio.wildlifeCueCounts[species==='red-squirrel'?'squirrel-scramble':'deer-startle']).toBe(1);expect(s.audio.lastWildlifeDelayMs).toBeLessThanOrEqual(505);expect(s.errors).toEqual([]);expect(s.instances.every(i=>i.lod>=0&&i.automaticAnimatables===0)).toBe(true);}
  }
  expect(errors).toEqual([]);
 }finally{await guest?.close();}
});
