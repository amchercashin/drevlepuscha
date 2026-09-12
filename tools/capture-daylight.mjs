// Compare composited PNGs: GPU back-buffer readback is not a portable screenshot.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {PNG}=require(require.resolve('playwright-core/package.json').replace(/package\.json$/, 'lib/utilsBundle.js'));
const url=process.env.URL??'http://127.0.0.1:4182/',renderer='webgpu',dir='tmp/daylight';mkdirSync(dir,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:false}),p=await b.newPage({viewport:{width:1280,height:720}}),errors=[],report={renderer,errors};
p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await p.goto(url+'?debug=1&renderer='+renderer);await p.waitForFunction(()=>window.m0?.state().ready,null,{timeout:45000});await p.locator('#resume').click();await p.waitForTimeout(2000);
 await p.evaluate(()=>{m0.setTime(12);m0.setCamera(0,-8,5.5);m0.setRays(false);});await p.waitForTimeout(800);
 const before=PNG.sync.read(await p.screenshot({style:'body > :not(canvas) { visibility: hidden !important; }',path:`${dir}/rays-off-${renderer}.png`}));await p.evaluate(()=>m0.setRays(true));await p.waitForTimeout(400);
 const after=PNG.sync.read(await p.screenshot({style:'body > :not(canvas) { visibility: hidden !important; }',path:`${dir}/rays-on-${renderer}.png`}));
 let changedPixels=0,sum=0,max=0;for(let i=0;i<before.data.length;i+=4){let delta=0;for(let k=0;k<3;k++)delta+=Math.abs(before.data[i+k]-after.data[i+k]);if(delta>0)changedPixels++;sum+=delta;max=Math.max(max,delta);}
 report.rays={changedPixels,meanChannelChange:sum/(before.width*before.height*3),maxChannelSum:max,method:'composited-png'};
 assert.ok(report.rays.changedPixels>100,'rays must affect actual rendered pixels');
 await p.evaluate(()=>{const stream=document.querySelector('canvas').captureStream(30),chunks=[],r=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:3500000});r.ondataavailable=e=>chunks.push(e.data);window.finishVideo=()=>new Promise(resolve=>{r.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));};r.stop();});r.start();});
 for(const [name,hour] of [['morning',7.5],['day',12],['sunset',17.5],['night',0]]){
  await p.evaluate(h=>{m0.setTime(h);m0.startTraversal();},hour);await p.waitForTimeout(2800);await p.evaluate(()=>m0.stopTraversal());await p.waitForTimeout(500);
  await p.screenshot({path:`${dir}/walk-${name}.png`});
 }
 await p.evaluate(()=>{m0.setTime(0);m0.setCamera(0,-55,5.5);});await p.waitForTimeout(2400);await p.screenshot({path:`${dir}/moon-sky.png`});
 writeFileSync(`${dir}/daylight-walk.webm`,Buffer.from(await p.evaluate(()=>window.finishVideo())));
 assert.deepEqual(errors,[]);console.log(JSON.stringify(report));
}catch(e){report.failure=String(e);console.error(e);process.exitCode=1;}finally{writeFileSync(`${dir}/capture-${renderer}.json`,JSON.stringify(report,null,2));await b.close();}
