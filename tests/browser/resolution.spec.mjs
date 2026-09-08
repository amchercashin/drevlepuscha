import {test,expect} from '@playwright/test';
test('M1 resolution follows aspect ratio, quality selection and Retina density',async({page,browser},info)=>{
 test.setTimeout(60000);
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`/?scene=m1&debug=1&renderer=${info.project.name}`);await page.waitForFunction(()=>window.m0?.state().ready);
 await page.getByRole('button',{name:'Начать прогулку'}).click();
 for(const [width,height] of [[3440,1440],[1920,1080],[900,1200]]){
  await page.setViewportSize({width,height});
  await expect.poll(()=>page.evaluate(()=>window.m0.state().render.width)).toBe(Math.round(width*Math.min(1,Math.sqrt(2560*1440/(width*height)))));
  const r=await page.evaluate(()=>window.m0.state().render);expect(Math.abs(r.width/r.height-width/height)).toBeLessThan(.003);
 }
 await page.setViewportSize({width:3440,height:1440});await page.locator('#diagnostics').evaluate(e=>e.open=true);
 await page.locator('#resolution-quality').selectOption('native');await expect.poll(()=>page.evaluate(()=>window.m0.state().render.width)).toBe(3440);
 expect((await page.evaluate(()=>window.m0.state())).render.height).toBe(1440);
 await page.reload();await page.waitForFunction(()=>window.m0?.state().ready);expect((await page.evaluate(()=>window.m0.state())).render.width).toBe(3440);
 await page.close();
 const context=await browser.newContext({viewport:{width:1000,height:700},deviceScaleFactor:2});
 try{const retina=await context.newPage();await retina.goto(`http://127.0.0.1:4173/?scene=m1&debug=1&renderer=${info.project.name}`);await retina.waitForFunction(()=>window.m0?.state().ready);const s=await retina.evaluate(()=>window.m0.state());expect(s.render.width).toBe(2000);expect(s.render.height).toBe(1400);expect(s.errors).toEqual([]);}finally{await context.close();}
 expect(errors).toEqual([]);
});
