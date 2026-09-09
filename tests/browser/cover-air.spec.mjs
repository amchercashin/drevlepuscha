import {test,expect} from '@playwright/test';

test('continuous cover survives fast movement and teleport; haze is stationary at rest',async({page},info)=>{
 test.setTimeout(90_000);const errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`/?debug=1&renderer=${info.project.name}`);await page.waitForFunction(()=>window.m0?.state().ready);
 await page.locator('#resume').click();await page.waitForTimeout(1500);
 const initial=await page.evaluate(()=>m0.state());
 expect(initial.render.backend).toBe(info.project.name);expect(initial.floor.pending).toBe(0);
 expect(initial.floor.field.farTiles).toBe(80);expect(initial.floor.field.farPending).toBe(0);
 expect(initial.lighting.air.method).toBe('stable-height-haze');expect(initial.lighting.air.steps).toBe(0);
 const field=()=>page.evaluate(()=>m0.inspect().scene.meshes.filter(m=>m.name.startsWith('cover-far-')).map(m=>[m.name,m.getTotalVertices(),m.isEnabled(),Array.from(m.getVerticesData('position').slice(0,6))]));
 const original=await field();expect(original.every(m=>m[2])).toBe(true);
 const shader=await page.evaluate(()=>m0.inspect().scene.meshes.find(m=>m.name.startsWith('grass-')&&m.subMeshes?.[0]?.effect)?.subMeshes[0].effect.vertexSourceCode);
 expect(shader).toBeTruthy();expect(shader).not.toContain('bladeHeight');
 // Use the actual movement/collision path at the game's fast-walk speed.
 await page.evaluate(()=>m0.startTraversal(0,0,true));
 for(let i=0;i<18;i++){
  await page.waitForTimeout(300);const s=await page.evaluate(()=>m0.state());
  expect(s.floor.pendingNear).toBe(0);expect(s.floor.cells).toBeLessThanOrEqual(81);
  expect(s.floor.field.midTiles).toBeLessThanOrEqual(81);expect(s.camera.followError).toBeLessThan(.002);
 }
 await page.keyboard.up('ShiftLeft');await page.evaluate(()=>m0.stopTraversal());
 const moved=await page.evaluate(()=>m0.state());expect(moved.player.n).toBeGreaterThan(45);
 expect(await field()).toEqual(original);
 await page.evaluate(()=>m0.teleport(17*Math.sin(-95*.019)+6*Math.sin(-95*.047),-95));
 await page.waitForFunction(()=>m0.state().floor.pending===0&&m0.state().floor.field.midPending===0);
 expect(await field()).toEqual(original);
 await page.waitForTimeout(1500);
 const a=await page.screenshot({clip:{x:300,y:180,width:600,height:360}});
 await page.waitForTimeout(600);const b=await page.screenshot({clip:{x:300,y:180,width:600,height:360}});
 expect(a.equals(b)).toBe(true);
 await page.locator('#diagnostics').evaluate(e=>e.open=true);await page.locator('#showcase-fog').uncheck();
 expect((await page.evaluate(()=>m0.state())).lighting.air.density).toBe(0);
 expect(await field()).toEqual(original);await page.locator('#showcase-fog').check();
 await page.locator('#diagnostics').evaluate(e=>e.open=false);
 await page.evaluate(()=>{m0.teleport(0,0);m0.setCamera(0,6,5.5);});
 await page.waitForFunction(()=>m0.state().floor.pending===0&&m0.state().floor.field.midPending===0);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(600);
 await page.screenshot({path:info.outputPath('continuous-cover-mobile.png')});
 expect(await page.evaluate(()=>m0.state().errors)).toEqual([]);expect(errors).toEqual([]);
});
