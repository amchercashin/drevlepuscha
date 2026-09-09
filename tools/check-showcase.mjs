import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const url=process.env.WORLD_URL??'http://127.0.0.1:4181/',b=await chromium.launch({channel:'chrome',headless:false});
const p=await b.newPage({viewport:{width:1920,height:1080}}),errors=[],report={url,errors,views:[]};mkdirSync('qa/evidence',{recursive:true});
p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
const path=n=>17*Math.sin(n*.019)+6*Math.sin(n*.047);
try{
 const t=Date.now();await p.goto(url+'?debug=1');await p.waitForFunction(()=>window.m0?.state().ready,null,{timeout:45000});report.readyMs=Date.now()-t;await p.locator('#resume').click();await p.waitForTimeout(1500);
 await p.screenshot({path:'qa/evidence/showcase-entrance.png'});
 await p.evaluate(()=>m0.startTraversal());await p.waitForTimeout(1000);await p.evaluate(()=>m0.beginMeasurement());await p.waitForTimeout(30000);const samples=await p.evaluate(()=>m0.endMeasurement());samples.sort((a,b)=>a-b);report.frameMs={p50:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)],p99:samples[Math.floor(samples.length*.99)],max:Math.max(...samples),count:samples.length};report.walk=await p.evaluate(()=>m0.state());assert.ok(report.walk.player.n>35);await p.evaluate(()=>m0.stopTraversal());
 for(const n of [0,82,158,-95]){
  await p.evaluate(({e,n})=>m0.teleport(e,n),{e:path(n),n});await p.waitForTimeout(850);
  for(const yaw of [0,90,180,270]){await p.evaluate(y=>m0.setCamera(y,0,8),yaw);await p.waitForTimeout(550);const s=await p.evaluate(()=>m0.state());assert.ok(s.camera.clearance>=.239,'camera above terrain');assert.ok(s.camera.followError<.002,'horizontal orbit retained');report.views.push({n,yaw,clearance:s.camera.clearance,lift:s.camera.terrainLift});}
  await p.evaluate(()=>m0.setCamera(0,6,5.5));await p.waitForTimeout(500);await p.screenshot({path:`qa/evidence/showcase-${n}.png`});
 }
 let requests=0;const count=()=>requests++;p.on('request',count);let started=Date.now();await p.keyboard.press('KeyM');await p.getByRole('dialog').waitFor({state:'visible'});report.mapOpenMs=Date.now()-started;await p.screenshot({path:'qa/evidence/showcase-map.png'});assert.equal(requests,0,'map needs no new requests');
 for(const name of ['Солнечная ложбина','Развилка оврага','Излучина','Тихая низина']){await p.getByRole('button',{name:new RegExp(name)}).click();await p.waitForTimeout(350);assert.equal(await p.evaluate(()=>m0.state().mapOpen),false);await p.keyboard.press('KeyM');}
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:'qa/evidence/showcase-map-mobile.png'});const close=p.getByRole('button',{name:'Закрыть карту'}),box=await close.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);await close.click();assert.equal(await p.evaluate(()=>m0.state().mapOpen),false);
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS',JSON.stringify(report));
}catch(e){report.failure=String(e);console.error(e);process.exitCode=1;}finally{writeFileSync('qa/evidence/showcase-runtime.json',JSON.stringify(report,null,2));await b.close();}
