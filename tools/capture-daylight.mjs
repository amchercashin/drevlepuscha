// Numerical back-buffer comparison uses WebGL2; WebGPU capture readback can return zeros.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const url=process.env.URL??'http://127.0.0.1:4182/',renderer=process.env.RENDERER??'webgl2',dir='tmp/daylight';mkdirSync(dir,{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:false}),p=await b.newPage({viewport:{width:1280,height:720}}),errors=[],report={renderer,errors};
p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await p.goto(url+'?debug=1&renderer='+renderer);await p.waitForFunction(()=>window.m0?.state().ready,null,{timeout:45000});await p.locator('#resume').click();await p.waitForTimeout(2000);
 await p.evaluate(()=>{m0.setTime(12);m0.setCamera(0,-8,5.5);m0.setRays(false);});await p.waitForTimeout(800);
 await p.evaluate(async()=>{const e=m0.inspect().engine;window.rayPixels=new Uint8Array((await e.readPixels(0,0,e.getRenderWidth(),e.getRenderHeight())).buffer).slice();});
 await p.screenshot({path:`${dir}/rays-off-${renderer}.png`});await p.evaluate(()=>m0.setRays(true));await p.waitForTimeout(400);
 report.rays=await p.evaluate(async()=>{const e=m0.inspect().engine,a=window.rayPixels,b=new Uint8Array((await e.readPixels(0,0,e.getRenderWidth(),e.getRenderHeight())).buffer);let changed=0,sum=0,max=0;for(let i=0;i<a.length;i+=4){let d=0;for(let k=0;k<3;k++)d+=Math.abs(a[i+k]-b[i+k]);if(d>0)changed++;sum+=d;max=Math.max(max,d);}return {changedPixels:changed,meanChannelChange:sum/(a.length*.75),maxChannelSum:max,rawSum:b.reduce((sum,v)=>sum+v,0),byteLength:b.length};});
 await p.screenshot({path:`${dir}/rays-on-${renderer}.png`});assert.ok(report.rays.changedPixels>100,'rays must affect actual rendered pixels');
 await p.evaluate(()=>{const stream=document.querySelector('canvas').captureStream(30),chunks=[],r=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:3500000});r.ondataavailable=e=>chunks.push(e.data);window.finishVideo=()=>new Promise(resolve=>{r.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));};r.stop();});r.start();});
 for(const [name,hour] of [['morning',7.5],['day',12],['sunset',17.5],['night',0]]){
  await p.evaluate(h=>{m0.setTime(h);m0.startTraversal();},hour);await p.waitForTimeout(2800);await p.evaluate(()=>m0.stopTraversal());await p.waitForTimeout(500);
  await p.screenshot({path:`${dir}/walk-${name}.png`});
 }
 await p.evaluate(()=>{m0.setTime(0);m0.setCamera(0,-55,5.5);});await p.waitForTimeout(2400);await p.screenshot({path:`${dir}/moon-sky.png`});
 writeFileSync(`${dir}/daylight-walk.webm`,Buffer.from(await p.evaluate(()=>window.finishVideo())));
 assert.deepEqual(errors,[]);console.log(JSON.stringify(report));
}catch(e){report.failure=String(e);console.error(e);process.exitCode=1;}finally{writeFileSync(`${dir}/capture-${renderer}.json`,JSON.stringify(report,null,2));await b.close();}
