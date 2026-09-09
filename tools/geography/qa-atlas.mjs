import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import{mkdirSync,writeFileSync}from'node:fs';import{resolve,dirname}from'node:path';import{fileURLToPath,pathToFileURL}from'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),out=resolve(root,'tmp/old-forest-qa');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(pathToFileURL(resolve(root,'content/geography/old-forest/generated/atlas.html')).href);await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:resolve(out,'overview.png'),fullPage:true});
 assert.equal(await page.locator('#places button').count(),27);
 assert.equal(await page.locator('#zoneSelect option').count(),10);
 await page.locator('#zoneSelect').selectOption('entry_root_floor');assert.match(await page.locator('#details').innerText(),/переплетённые корни/);assert.match(await page.locator('#details').innerText(),/Ограничения/);
 await page.screenshot({path:resolve(out,'dressing.png'),fullPage:true});await page.locator('#zones').uncheck();
 await page.locator('#house').click();assert.match(await page.locator('#details').innerText(),/Дом Тома/);assert.match(await page.locator('#details').innerText(),/без ив у дома/);await page.locator('[data-local-relief]').waitFor();await page.screenshot({path:resolve(out,'house.png'),fullPage:true});
 await page.locator('#water').uncheck();assert.equal(await page.locator('path[data-feature="withywindle"]').count(),0);await page.locator('#water').check();
 await page.locator('#uncertainty').check();await page.locator('#zones').check();await page.screenshot({path:resolve(out,'layers.png'),fullPage:true});await page.locator('#uncertainty').uncheck();await page.locator('#zones').uncheck();
 await page.locator('#search').fill('Ив');await page.locator('#places button').filter({hasText:'Старый Ив'}).click();assert.match(await page.locator('#details').innerText(),/Старый Ив/);
 await page.locator('#profileSelect').selectOption('house-approach');assert.match(await page.locator('#profileStats').innerText(),/Длина/);
 // Actual SVG point click, not merely calling the exposed selection function.
 await page.locator('#house').click();await page.locator('circle[data-feature="approach_knoll"]').click();assert.match(await page.locator('#details').innerText(),/Бугор перед домом/);
 const download=page.waitForEvent('download');await page.locator('#download').click();assert.equal((await download).suggestedFilename(),'old-forest-geography.json');
 await page.setViewportSize({width:390,height:844});await page.locator('#fit').click();await page.screenshot({path:resolve(out,'mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.evaluate(()=>{for(const [id,weight]of [['regular',400],['bold',700]]){const el=document.createElement('p');el.id='type-'+id;el.style.fontWeight=weight;el.textContent='Съешь ещё этих мягких французских булок, да выпей чаю. Ёлка, подъём, № 17, 1 250 ₽, 80 %, −5 °C, 2024–2026, «текст „внутри“».';document.body.append(el);}});
 const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const{root:doc}=await cdp.send('DOM.getDocument');const fonts={};for(const id of ['regular','bold']){await page.locator('#type-'+id).scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);const{nodeId}=await cdp.send('DOM.querySelector',{nodeId:doc.nodeId,selector:'#type-'+id});fonts[id]=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;}
 await page.screenshot({path:resolve(out,'typography.png'),fullPage:true});assert.deepEqual(errors,[]);const result={status:'passed',checks:['zone dressing','house vegetation exception','overview','house zoom','layers','search','SVG click','profile','JSON download','390px layout','no page errors'],fonts,errors};writeFileSync(resolve(out,'qa.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
