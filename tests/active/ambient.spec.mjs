import {test,expect} from '@playwright/test';
test.use({screenshot:'off'});

test('forest audio follows scene wind and time, pauses and works for a room guest',async({page,browser})=>{
 test.setTimeout(180000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?debug=1');await page.waitForFunction(()=>window.m0?.state().ready,null,{timeout:60000});
 expect(await page.evaluate(()=>m0.state().ambient.context)).toBe('not-started');
 await page.locator('#resume').click();
 await page.waitForFunction(()=>m0.state().ambient.loops===7&&m0.state().ambient.context==='running');
 // Decode every shipped file using the game context, including lazy event buffers.
 const decoded=await page.evaluate(async()=>{
  const bank=(await import('/config/showcase-audio.json?import')).default;
  const audio=m0.inspect().ambient;
  return Promise.all(bank.assets.map(async a=>{const b=await audio.load(a);return {id:a.id,channels:b.numberOfChannels,duration:b.duration,expected:a.duration};}));
 });
 expect(decoded).toHaveLength(15);
 for(const item of decoded)expect(Math.abs(item.duration-item.expected)).toBeLessThan(.001);
 await page.evaluate(()=>{m0.setTime(12);m0.inspect().wind.configure({intensity:0});});
 await page.waitForFunction(()=>m0.state().ambient.strength===0);
 expect(Object.entries(await page.evaluate(()=>m0.state().ambient.gains)).filter(([id])=>id.startsWith('W')).every(([,gain])=>gain===0)).toBe(true);
 const day=await page.evaluate(()=>m0.state().ambient.gains.I01);
 await page.evaluate(()=>m0.setTime(0));await page.waitForFunction(()=>m0.state().ambient.hour===0);
 expect(await page.evaluate(()=>m0.state().ambient.gains.I01)).toBeGreaterThan(day);
 await page.evaluate(()=>{m0.inspect().wind.configure({intensity:1});m0.inspect().wind.triggerGust();});
 await page.waitForFunction(()=>m0.state().ambient.gust>.05);
 const sync=await page.evaluate(()=>{const s=m0.state(),w=m0.inspect().wind.sampleAt(s.camera.x,s.camera.y,s.camera.z);return {audio:s.ambient.strength,scene:w.strength01};});
 expect(sync.audio).toBeCloseTo(sync.scene,6);
 await page.keyboard.press('Escape');expect(await page.evaluate(()=>m0.state().ambient.active)).toBe(false);
 await page.keyboard.press('Escape');expect(await page.evaluate(()=>m0.state().ambient.active)).toBe(true);
 await page.locator('#diagnostics > summary').click();
 await page.locator('#forest-audio-volume').fill('0');
 expect(await page.evaluate(()=>m0.state().ambient.active)).toBe(false);
 await expect(page.locator('#forest-audio-level')).toHaveText('0%');
 await page.locator('#forest-audio-volume').fill('65');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('showcase-audio-v1')).volume)).toBe(.65);
 await page.locator('#diagnostics > summary').click();
 // One actual WebRTC guest, using the very same audio controller as solo.
 await page.locator('#invite-friends').click();
 await page.waitForFunction(()=>m0.state().wind.shared);
 const invite=new URL(await page.locator('#friends-link').inputValue());invite.search='?debug=1';
 const guest=await browser.newPage({viewport:{width:1280,height:720}});guest.on('pageerror',e=>errors.push(e.message));
 try{
  await guest.goto(invite.href);await guest.waitForFunction(()=>window.m0?.state().ready,null,{timeout:60000});
  await guest.locator('#resume').click();
  await guest.waitForFunction(()=>m0.state().ambient.loops===7&&m0.state().multiplayer.players===2,null,{timeout:45000});
  const state=await guest.evaluate(()=>m0.state());
  expect(state.wind.shared).toBe(true);expect(state.ambient.context).toBe('running');expect(state.ambient.errors).toEqual([]);
  expect(state.ambient.strength).toBeGreaterThan(0);
 }finally{await guest.close();}
 await page.bringToFront();await page.locator('#friends-leave').click();
 await page.waitForFunction(()=>!m0.state().wind.shared);
 expect(await page.evaluate(()=>m0.state().ambient.loops)).toBe(7);
 expect(await page.evaluate(()=>m0.state().ambient.errors)).toEqual([]);expect(errors).toEqual([]);
});
