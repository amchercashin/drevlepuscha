import {test,expect} from '@playwright/test';

function errorsOn(page){const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/GPUValidationError|WebGPU uncaptured error|Error while parsing|shader.*error/i.test(m.text())&&errors.length<12)errors.push(m.text());});return errors;}
test('regional walk: clues, traveller, gate, boat, rebase, rain and save reload',async({page})=>{
 test.setTimeout(120000);const errors=errorsOn(page);
 await page.goto('/?scene=region&region=brandywine-bridge&debug=1');await page.waitForFunction(()=>window.__region?.state().ready);
 await page.locator('#resume').click();await page.keyboard.press('KeyE');
 expect(await page.evaluate(()=>__region.state().encounter.clues)).toContain('testimony');
 const before=await page.evaluate(()=>__region.state().player);await page.keyboard.down('KeyW');await page.waitForTimeout(500);await page.keyboard.up('KeyW');
 const after=await page.evaluate(()=>__region.state().player);expect(Math.hypot(after.e-before.e,after.n-before.n)).toBeGreaterThan(.2);
 await page.evaluate(async()=>{const s=__region.session,e=s.state.encounter,a=e.route[0],b=e.route[1],length=Math.hypot(b[0]-a[0],b[1]-a[1]);await __region.travel(a[0]+(b[0]-a[0])*30/length,a[1]+(b[1]-a[1])*30/length);});await page.keyboard.press('KeyE');
 expect(await page.evaluate(()=>__region.state().encounter.clues)).toContain('tracks');
 await page.evaluate(async()=>{const p=__region.session.actor();await __region.travel(p.e+1,p.n);});await page.keyboard.press('KeyE');await expect(page.locator('.region-talk')).toBeVisible();await page.locator('#traveller-help').click();
 expect(await page.evaluate(()=>__region.state().encounter.phase)).toBe('resolved');
 await page.evaluate(()=>__region.travel(550,-171));await page.keyboard.press('KeyE');expect(await page.evaluate(()=>__region.state().gateOpen)).toBe(false);await page.keyboard.press('KeyE');
 await page.keyboard.press('KeyM');await expect(page.locator('.region-map')).toBeVisible();await page.locator('#region-water').selectOption('high');expect(await page.evaluate(()=>__region.state().player.water)).toBe('high');await page.locator('#region-water').selectOption('normal');await page.locator('#region-map-close').click();
 await page.evaluate(async()=>{const p=__region.session.dock('lower-boat',0,'normal').shore;await __region.travel(p.e,p.n);});await page.keyboard.press('KeyE');expect(await page.evaluate(()=>__region.state().player.mode)).toBe('boat');
 await page.evaluate(()=>{__region.player.heading=96;});await page.keyboard.press('Space');const boatBefore=await page.evaluate(()=>__region.state().boats[0]);await page.keyboard.down('KeyW');await page.waitForTimeout(1500);await page.keyboard.up('KeyW');const boatAfter=await page.evaluate(()=>__region.state().boats[0]);expect(boatAfter.e-boatBefore.e).toBeGreaterThan(.5);
 // Same rowing controller, many small steps; accelerate the long crossing for this smoke.
 await page.evaluate(()=>{const r=__region,p=r.player,b=r.session.dock('lower-boat',1,'normal').boat;for(let i=0;i<1500;i++){const de=b.e-p.e,dn=b.n-p.n,len=Math.hypot(de,dn);if(len<1)break;r.session.row(de/len*.12,dn/len*.12,r.query.ready,()=>false);}});await page.keyboard.press('KeyE');expect(await page.evaluate(()=>__region.state().player.mode)).toBe('walk');
 const boatPosition=await page.evaluate(()=>__region.state().boats[0]);
 await page.evaluate(()=>__region.travel(1110,1060));await page.waitForFunction(()=>__region.state().world.trees.near>15&&__region.state().wildlife.render.visibleMeshes>0);
 expect(await page.evaluate(()=>__region.state().world.rebases)).toBeGreaterThan(0);
 await page.evaluate(()=>__region.daylight.setWeather('rain',0));await page.waitForFunction(()=>__region.state().rain.enabled);const f=await page.evaluate(()=>__region.state().frames);await page.waitForFunction(f=>__region.state().frames>f+100,f);
 expect(await page.evaluate(()=>__region.state().rain.shelters)).toBe(true);expect(await page.evaluate(()=>__region.state().world.tiles)).toBeLessThan(24);
 expect(await page.evaluate(()=>__region.state().boats[0])).toEqual(boatPosition);
 await page.evaluate(()=>__region.save());await page.reload();await page.waitForFunction(()=>window.__region?.state().ready);
 expect(await page.evaluate(()=>__region.state().boats[0])).toEqual(boatPosition);expect(await page.evaluate(()=>__region.state().encounter.phase)).toBe('resolved');
 await page.locator('#resume').click();await page.evaluate(async()=>{const p=__region.session.dock('lower-boat',1,'normal').shore;await __region.travel(p.e,p.n);});await page.keyboard.press('KeyE');expect(await page.evaluate(()=>__region.state().player.mode)).toBe('boat');
 expect(await page.evaluate(()=>__region.state().errors)).toEqual([]);expect(errors).toEqual([]);
});

test('shared adapters preserve showcase and old-world startup',async({page})=>{
 test.setTimeout(120000);const errors=errorsOn(page);
 for(const [url,key] of [['/?debug=1','m0'],['/?scene=world&debug=1','oldForest']]){
  await page.goto(url);await page.waitForFunction(key=>window[key]?.state().ready,key,{timeout:90000});await page.locator('#resume').click();
  const a=await page.evaluate(key=>window[key].state(),key);await page.keyboard.down('KeyW');await page.waitForTimeout(500);await page.keyboard.up('KeyW');
  const b=await page.evaluate(key=>window[key].state(),key);expect(b.render.backend).toBe('webgpu');expect(Math.hypot(b.player.e-a.player.e,b.player.n-a.player.n)).toBeGreaterThan(.1);expect(b.errors).toEqual([]);
 }expect(errors).toEqual([]);
});
