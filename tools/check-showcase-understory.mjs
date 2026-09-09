import {chromium} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
const label=process.env.LABEL??'before',url=process.env.URL??'http://127.0.0.1:4181/',renderer=process.env.RENDERER??'webgpu';
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-backgrounding-occluded-windows']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const report={label,url,renderer,errors};mkdirSync('tmp',{recursive:true});
try{
 await page.goto(url+'?debug=1&renderer='+renderer);await page.waitForFunction(()=>window.m0?.state().ready,null,{timeout:60000});
 await page.locator('#resume').click();await page.waitForTimeout(2500);
 await page.evaluate(()=>m0.setCamera(-20,18,5.5));await page.waitForTimeout(600);
 await page.screenshot({path:`tmp/understory-${label}-near.png`});report.start=await page.evaluate(()=>m0.state());
 await page.locator('#diagnostics').evaluate(e=>e.open=true);await page.locator('#showcase-fog').uncheck();await page.locator('#diagnostics').evaluate(e=>e.open=false);
 await page.waitForTimeout(300);await page.screenshot({path:`tmp/understory-${label}-clear.png`});
 await page.locator('#diagnostics').evaluate(e=>e.open=true);await page.locator('#showcase-fog').check();await page.locator('#diagnostics').evaluate(e=>e.open=false);
 await page.evaluate(()=>m0.startTraversal());await page.waitForTimeout(1000);await page.evaluate(()=>m0.beginMeasurement());
 await page.waitForTimeout(10000);const samples=await page.evaluate(()=>m0.endMeasurement());samples.sort((a,b)=>a-b);
 report.frameMs={count:samples.length,p50:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)],p99:samples[Math.floor(samples.length*.99)],max:Math.max(...samples)};
 report.walk=await page.evaluate(()=>{m0.stopTraversal();return m0.state();});
 await page.screenshot({path:`tmp/understory-${label}-walk.png`});
 console.log(JSON.stringify({label,errors,start:report.start.floor,render:report.start.render,walk:report.walk.player,frameMs:report.frameMs}));
}catch(e){report.failure=String(e);console.error(e);process.exitCode=1;}
finally{writeFileSync(`tmp/understory-${label}.json`,JSON.stringify(report,null,2));await browser.close();}
