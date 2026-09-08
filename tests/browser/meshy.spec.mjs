import {readFileSync} from 'node:fs';
import {test,expect} from '@playwright/test';
for(const [route,triangles] of [['a',5318],['b',5470]])test('Meshy '+route+' renders, exports and walks in the shared forest',async({page},info)=>{
 const cache=JSON.parse(readFileSync('assets/trees/meshy-'+route+'/tree.json'));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/uncaptured error|device lost/i.test(m.text()))errors.push(m.text());});
 page.on('request',r=>{if(/\/references\/|\.env/.test(r.url()))errors.push('Private resource requested');});
 await page.goto('/tree.html?model=meshy-'+route+'&debug=1&renderer='+info.project.name);await page.waitForFunction(()=>window.treePreview?.stats().frames>10);
 expect((await page.evaluate(()=>window.treePreview.stats())).triangles).toBe(triangles);
 for(const name of ['Справа','Сзади','Слева','Сверху','Корни','Взгляд путника','Спереди']){await page.getByRole('button',{name,exact:true}).click();expect((await page.evaluate(()=>window.treePreview.stats())).camera.every(Number.isFinite)).toBe(true);}
 const promise=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать GLB'}).click();expect((await promise).suggestedFilename()).toBe(cache.version+'-lod0.glb');
 await page.getByRole('link',{name:'Дальний',exact:true}).click();await expect(page.locator('#tree-stats')).toContainText(String(cache.triangles[2]));
 const farGLB=Buffer.from(await page.evaluate(()=>window.treePreview.exportGLB()));const farDoc=JSON.parse(farGLB.subarray(20,20+farGLB.readUInt32LE(12)));expect(farDoc.materials.every(m=>!m.pbrMetallicRoughness.baseColorTexture)).toBe(true);expect(farDoc.images).toBeUndefined();
 await page.goto('/?scene=m1&tree=meshy-'+route+'&debug=1&renderer='+info.project.name);await page.waitForFunction(()=>window.m0?.state().ready);await page.getByRole('button',{name:'Начать прогулку'}).click();
 const initial=await page.evaluate(()=>window.m0.state());expect(initial.forest.asset).toBe('meshy-'+route);expect(initial.forest.trees).toBe(4967);expect(initial.forest.trianglesPerLevel).toEqual(cache.triangles);expect(initial.forest.materialsPerTree).toBe(1);expect(initial.forest.geometryBuffers).toBe(3+initial.forest.horizon.cells);
 await page.evaluate(()=>{window.m0.teleport(0,14);window.m0.setCamera(0,12,5.5);});await page.keyboard.down('KeyW');await page.waitForTimeout(1000);await page.keyboard.up('KeyW');
 const moved=await page.evaluate(()=>window.m0.state());expect(moved.player.n).toBeGreaterThan(15.5);expect(moved.camera.followError).toBeLessThan(1e-5);expect(moved.playerClear).toBe(true);
 await page.evaluate(()=>{window.m0.teleport(0,5);window.m0.setCamera(90,12,5.5);});await expect.poll(()=>page.evaluate(()=>window.m0.state().faded.some(m=>m.id.startsWith('camera-trunk-lod0-')))).toBe(true);
 await page.evaluate(()=>{window.m0.teleport(0,160);window.m0.setCamera(90,-20,5.5);});await page.waitForTimeout(1000);const far=await page.evaluate(()=>window.m0.state());expect(far.forest.activeTrees+far.forest.horizon.distantTrees).toBe(4967);expect(far.camera.followError).toBeLessThan(1e-5);expect(errors).toEqual([]);
});
