import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const url=process.env.URL??'http://127.0.0.1:4182/',label=process.env.LABEL??'daylight',renderer=process.env.RENDERER??'webgpu';
const b=await chromium.launch({channel:'chrome',headless:false,args:['--disable-backgrounding-occluded-windows']});
const p=await b.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1}),errors=[],report={label,renderer,errors,runs:[]};
const dir='tmp/daylight';mkdirSync(dir,{recursive:true});p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const stats=arr=>{const a=arr.filter(v=>v>0).sort((a,b)=>a-b);return a.length?{count:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:Math.max(...a)}:null;};
try{
 await p.goto(url+'?debug=1&renderer='+renderer);await p.waitForFunction(()=>window.m0?.state().ready,null,{timeout:60000});await p.locator('#resume').click();
 const modes=label==='baseline'?['baseline']:process.env.RAYS==='1'?['day']:['morning','day','sunset','night'];
 for(const mode of modes){
  if(mode!=='baseline')await p.evaluate(m=>m0.setTime(({morning:7.5,day:12,sunset:17.5,night:0})[m]),mode);
  await p.evaluate(()=>m0.startTraversal());if(process.env.RAYS==='1')await p.evaluate(()=>{m0.setRays(true);m0.setAutomatic(true);});await p.waitForTimeout(2500);await p.evaluate(()=>m0.beginMeasurement());await p.waitForTimeout(10000);
  const frames=await p.evaluate(()=>m0.endMeasurement()),costs=await p.evaluate(()=>m0.frameCosts());
  await p.evaluate(()=>{m0.stopTraversal();m0.teleport(0,0);m0.setCamera(0,6,5.5);});await p.waitForTimeout(1500);
  const state=await p.evaluate(()=>m0.state());assert.equal(state.render.backend,renderer);report.runs.push({mode,frameMs:stats(frames),cpuMs:stats(costs.map(c=>c.cpuMs)),gpuMs:stats(costs.map(c=>c.gpuMs)),state});
  await p.screenshot({path:`${dir}/${label}-${mode}.png`});
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify(report.runs.map(r=>({mode:r.mode,frame:r.frameMs,cpu:r.cpuMs,gpu:r.gpuMs,draws:r.state.render.drawCalls}))));
}catch(e){report.failure=String(e);console.error(e);process.exitCode=1;}finally{writeFileSync(`${dir}/${label}.json`,JSON.stringify(report,null,2));await b.close();}
