import {test,expect} from '@playwright/test';
test.use({screenshot:'off'});
test('W3 art: two clients share the bird, fresh audio once, independent skins and relocated habitat',async({page,browser})=>{
 test.setTimeout(150000);const errors=[];let guest;page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('/?debug=1&wildlife=1');await page.waitForFunction(()=>window.m0?.state().ready);await page.locator('#resume').click();
  await page.waitForFunction(()=>m0.wildlife.state().instances.some(i=>i.id.includes('trail-bird-01')));
  await page.locator('#invite-friends').click();const link=await page.locator('#friends-link').inputValue();
  guest=await browser.newPage({viewport:{width:1280,height:720}});guest.on('pageerror',e=>errors.push(e.message));await guest.goto(link);await guest.waitForFunction(()=>window.m0?.state().ready);await guest.locator('#resume').click();
  for(const p of [page,guest]){await p.getByRole('button',{name:'К животному',exact:true}).click();await p.waitForFunction(()=>m0.wildlife.state().instances.some(i=>i.lod===0&&i.clip==='alert'));}
  const read=()=>({wildlife:m0.wildlife.state(),audio:m0.state().ambient,skins:m0.inspect().scene.skeletons.length});
  const initial=await Promise.all([page,guest].map(p=>p.evaluate(read)));expect(initial[0].wildlife.frame.entities[0].id).toBe(initial[1].wildlife.frame.entities[0].id);
  for(const state of initial){expect(state.wildlife.testOnly).toBe(false);expect(state.wildlife.assetErrors).toEqual([]);expect(state.wildlife.instances[0].automaticAnimatables).toBe(0);expect(state.audio.loaded).toContain('B04');}
  await guest.getByRole('button',{name:'Подойти',exact:true}).click();
  await Promise.all([page,guest].map(p=>p.waitForFunction(()=>m0.wildlife.state().instances.some(i=>i.clip==='fly_loop'))));
  const flight=await Promise.all([page,guest].map(p=>p.evaluate(read)));
  expect(flight[0].wildlife.frame.entities[0].route).toEqual(flight[1].wildlife.frame.entities[0].route);
  for(const state of flight){expect(state.wildlife.frame.eventWatermark).toBe(1);expect(state.audio.wildlifeEventsPlayed).toBe(1);expect(state.audio.lastWildlifeDelayMs).toBeLessThanOrEqual(505);}
  await guest.close();guest=undefined;
  // The same renderer and art load at a different real tree through data only.
  await page.getByLabel('Место фауны').selectOption('trail-bird-02');await page.getByRole('button',{name:'Отойти',exact:true}).click();
  await page.waitForFunction(()=>m0.wildlife.state().frame.entities.some(e=>e.siteId==='trail-bird-02'));
  await page.getByRole('button',{name:'К животному',exact:true}).click();await page.waitForFunction(()=>m0.wildlife.state().instances.some(i=>i.id.includes('trail-bird-02')&&i.lod===0));
  const state=await page.evaluate(read);expect(state.wildlife.frame.entities.find(e=>e.siteId==='trail-bird-02').point.n).toBeGreaterThan(300);expect(state.wildlife.assetErrors).toEqual([]);
  expect(errors).toEqual([]);
 }finally{await guest?.close();}
});
