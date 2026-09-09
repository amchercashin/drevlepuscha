import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const label=process.env.LABEL??'after',url=process.env.URL??'http://127.0.0.1:4182/',renderer=process.env.RENDERER??'webgpu';
const b=await chromium.launch({channel:'chrome',headless:false,args:['--disable-backgrounding-occluded-windows']});
const p=await b.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1}),errors=[],report={label,renderer,errors};
const dir='tmp/cover-air';mkdirSync(dir,{recursive:true});
p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 const started=Date.now();await p.goto(url+'?debug=1&renderer='+renderer);await p.waitForFunction(()=>window.m0?.state().ready,null,{timeout:60000});report.readyMs=Date.now()-started;
 await p.locator('#resume').click();await p.waitForTimeout(2200);await p.evaluate(()=>m0.setCamera(0,6,5.5));await p.waitForTimeout(500);
 await p.evaluate(()=>{const stream=document.querySelector('canvas').captureStream(30),chunks=[],r=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:2500000});r.ondataavailable=e=>chunks.push(e.data);window.finishVideo=()=>new Promise(resolve=>{r.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));};r.stop();});r.start();});
 await p.waitForTimeout(1800);await p.screenshot({path:`${dir}/${label}-start.png`});
 await p.evaluate(()=>m0.startTraversal());await p.waitForTimeout(6500);await p.evaluate(()=>m0.stopTraversal());await p.waitForTimeout(1800);
 writeFileSync(`${dir}/${label}-walk.webm`,Buffer.from(await p.evaluate(()=>window.finishVideo())));
 await p.locator('#diagnostics').evaluate(e=>e.open=true);await p.locator('#showcase-fog').uncheck();await p.locator('#diagnostics').evaluate(e=>e.open=false);
 await p.evaluate(()=>{m0.teleport(0,0);m0.setCamera(-20,18,5.5);});await p.waitForTimeout(1600);await p.screenshot({path:`${dir}/${label}-clear.png`});
 await p.locator('#diagnostics').evaluate(e=>e.open=true);await p.locator('#showcase-fog').check();await p.locator('#diagnostics').evaluate(e=>e.open=false);
 report.start=await p.evaluate(()=>m0.state());await p.evaluate(()=>m0.startTraversal());await p.waitForTimeout(1500);await p.evaluate(()=>m0.beginMeasurement());await p.waitForTimeout(12000);
 const samples=await p.evaluate(()=>m0.endMeasurement());samples.sort((a,b)=>a-b);report.frames={count:samples.length,p50:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)],p99:samples[Math.floor(samples.length*.99)],max:Math.max(...samples)};
 report.walk=await p.evaluate(()=>{m0.stopTraversal();return m0.state();});assert.ok(report.walk.player.n>19);assert.equal(report.walk.render.backend,renderer);assert.deepEqual(errors,[]);
 if(process.env.MOBILE==='1'){
  await p.close();const mobile=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(url+'?debug=1&renderer='+renderer);
  await mobile.waitForFunction(()=>window.m0?.state().ready,null,{timeout:60000});await mobile.locator('#resume').click();await mobile.waitForTimeout(1600);
  await mobile.screenshot({path:`${dir}/${label}-mobile.png`});report.mobile=await mobile.evaluate(()=>m0.state());await mobile.close();
 }
 console.log(JSON.stringify({label,renderer,readyMs:report.readyMs,frames:report.frames,floor:report.walk.floor,render:report.walk.render,air:report.walk.lighting.air,errors}));
}catch(e){report.failure=String(e);console.error(e);process.exitCode=1;}finally{writeFileSync(`${dir}/${label}.json`,JSON.stringify(report,null,2));await b.close();}
