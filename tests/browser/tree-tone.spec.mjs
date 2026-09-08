import {test,expect} from '@playwright/test';
test('A colour variation changes albedo and survives LOD, horizon and occluder fading',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/uncaptured error|device lost/i.test(m.text()))errors.push(m.text());});
 await page.goto('/?scene=m1&debug=1&renderer='+info.project.name);await page.waitForFunction(()=>window.m0?.state().ready);await page.getByRole('button',{name:'Начать прогулку'}).click();
 const clip={x:290,y:185,width:400,height:260};
 for(const n of [160,5]){
  await page.evaluate(n=>{window.m0.teleport(0,n);window.m0.setCamera(n===5?90:0,n===5?12:-20,5.5);},n);await page.waitForTimeout(800);
  // Wait for the existing exponential occluder fade to settle before comparing pixels.
  let previous='';await expect.poll(async()=>{const current=await page.evaluate(()=>JSON.stringify(window.m0.state().faded));const stable=current===previous;previous=current;return stable;},{intervals:[120]}).toBe(true);
  await page.waitForFunction(target=>Math.abs(window.m0.state().camera.yaw-target)<1e-10,n===5?90:0);
  const initial=await page.evaluate(()=>window.m0.state());expect(initial.forest.colorVariation).toBe(true);expect(initial.forest.geometryBuffers).toBe(83);
  if(n===5)expect(initial.faded.some(m=>m.id.startsWith('camera-trunk'))).toBe(true);
  else {expect(initial.forest.lodCounts.every(n=>n>0)).toBe(true);expect(initial.forest.horizon.distantTrees).toBeGreaterThan(0);}
  const on=await page.screenshot({clip});await page.locator('summary').click();await page.getByLabel('Разные оттенки деревьев').uncheck();await page.locator('summary').click();await page.waitForTimeout(150);
  const off=await page.screenshot({clip});expect(on.equals(off)).toBe(false);const disabled=await page.evaluate(()=>window.m0.state());expect(disabled.forest.colorVariation).toBe(false);expect(disabled.render.drawCalls).toBe(initial.render.drawCalls);expect(disabled.camera.followError).toBeLessThan(1e-5);
  await page.locator('summary').click();await page.getByLabel('Разные оттенки деревьев').check();await page.locator('summary').click();await page.waitForTimeout(150);
  const restored=await page.screenshot({clip});expect(restored.equals(on)).toBe(true);
 }
 expect(errors).toEqual([]);
});
