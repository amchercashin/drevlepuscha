import {test,expect} from '@playwright/test';

test('day presets bind sky, light, plant emission and a single moving shadow map',async({page},info)=>{
 test.setTimeout(90_000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`/?debug=1&renderer=${info.project.name}`);await page.waitForFunction(()=>window.m0?.state().ready);await page.locator('#resume').click();
 await page.locator('#diagnostics').evaluate(e=>e.open=true);
 const modes=[['Утро',7.5],['День',12],['Закат',17.5],['Ночь',0]],probes=[];
 for(const [label,hour] of modes){
  await page.getByRole('button',{name:label,exact:true}).click();await page.waitForTimeout(400);
  const data=await page.evaluate(()=>{const s=m0.state(),{scene,world}=m0.inspect();return {s,direction:world.sun.direction.asArray(),intensity:world.sun.intensity,lights:scene.lights.length,sky:scene.getMeshByName('day-sky')?.isReady(true),emission:scene.getMaterialByName('floor-leaves').emissiveColor.asArray()};});
  expect(data.s.render.backend).toBe(info.project.name);expect(data.s.lighting.daylight.hours).toBe(hour);
  data.direction.forEach((v,i)=>expect(v).toBeCloseTo(data.s.lighting.daylight.direction[i],10));expect(data.lights).toBe(2);expect(data.sky).toBe(true);
  expect(data.s.lighting.mapSize).toBe(512);expect(data.s.lighting.daylight.shadowMaps).toBe(1);
  if(hour===0){expect(data.s.lighting.daylight.stars).toBe(1);expect(data.intensity).toBeLessThan(.4);expect(Math.max(...data.emission)).toBeLessThan(.02);}
  probes.push(data.s.lighting.probe);await page.screenshot({path:info.outputPath(`${hour}-hours.png`)});
 }
 expect(new Set(probes.map(p=>p.map(v=>v.toFixed(4)).join(','))).size).toBeGreaterThanOrEqual(3);
 await page.getByLabel('Художественные лучи').check();expect(await page.evaluate(()=>m0.state().lighting.air.analyticBeams)).toBe(4);
 await page.getByLabel('Художественные лучи').uncheck();
 await page.locator('#day-time').evaluate(e=>e.value='6');await page.locator('#day-time').dispatchEvent('input');
 await expect(page.locator('#day-time-value')).toHaveText('06:00');
 await page.locator('#day-auto').check();const before=await page.evaluate(()=>m0.state().lighting.daylight.hours);await page.waitForTimeout(600);
 expect(await page.evaluate(()=>m0.state().lighting.daylight.hours)).toBeGreaterThan(before);
 await page.evaluate(()=>m0.setPaused(true));const paused=await page.evaluate(()=>m0.state().lighting.daylight.hours);await page.waitForTimeout(400);
 expect(await page.evaluate(()=>m0.state().lighting.daylight.hours)).toBe(paused);await page.evaluate(()=>m0.setPaused(false));
 for(const hour of [5.95,6,6.05,17.95,18,18.05,23.95,0]){await page.evaluate(h=>m0.setTime(h),hour);await page.waitForTimeout(80);}
 expect(await page.evaluate(()=>m0.state().errors)).toEqual([]);expect(errors).toEqual([]);
});

test('daylight controls and upward sky view work on a touch layout',async({browser},info)=>{
 test.setTimeout(60_000);
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 try{
  await page.goto(`/?debug=1&renderer=${info.project.name}`);await page.waitForFunction(()=>window.m0?.state().ready);await page.locator('#resume').tap();
  await page.locator('#diagnostics').evaluate(e=>e.open=true);await page.getByRole('button',{name:'Ночь',exact:true}).tap();
  await expect(page.locator('#day-time-value')).toHaveText('00:00');await expect(page.locator('body')).toHaveClass(/touch-enabled/);
  for(const label of ['Утро','День','Закат','Ночь']){const box=await page.getByRole('button',{name:label,exact:true}).boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);expect(box.height).toBeGreaterThanOrEqual(44);}
  await page.screenshot({path:info.outputPath('daylight-touch-controls.png')});
  await page.locator('#diagnostics').evaluate(e=>e.open=false);
  await page.evaluate(()=>m0.setCamera(0,-55,5.5));await page.waitForTimeout(1000);
  expect(await page.evaluate(()=>m0.state().camera.pitch)).toBe(-55);
  await page.screenshot({path:info.outputPath('moon-touch.png')});
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(400);
  await page.locator('#diagnostics').evaluate(e=>e.open=true);await page.getByRole('button',{name:'День',exact:true}).tap();
  await expect(page.locator('#day-time-value')).toHaveText('12:00');expect(errors).toEqual([]);
 }finally{await context.close();}
});
