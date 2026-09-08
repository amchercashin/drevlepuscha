import {test,expect} from '@playwright/test';
test('reference tree renders all review angles and exports its complete textured GLB',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(`/tree.html?debug=1&renderer=${testInfo.project.name}`);
 await page.waitForFunction(()=>window.treePreview?.stats().frames>10);
 for(const name of ['Справа','Сзади','Слева','Сверху','Корни','Взгляд путника','Спереди']){
  const button=page.getByRole('button',{name,exact:true});await button.click();await expect(button).toHaveAttribute('aria-pressed','true');
  const camera=await page.evaluate(()=>window.treePreview.stats().camera);expect(camera.every(Number.isFinite)).toBe(true);
 }
 await page.getByLabel('Показать сетку').check();await page.getByLabel('Показать сетку').uncheck();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать GLB'}).click();expect((await download).suggestedFilename()).toBe('reference-tree-v1.glb');
 const stats=await page.evaluate(()=>window.treePreview.stats());expect(stats.triangles).toBeLessThan(20000);expect(stats.renderer).toBe(testInfo.project.name);expect(errors).toEqual([]);
});
