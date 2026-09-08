import { mkdir,writeFile } from 'node:fs/promises';
import { platform,arch,totalmem } from 'node:os';
import { openHarness } from './browser.mjs';
const out=new URL('../qa/evidence/',import.meta.url);await mkdir(out,{recursive:true});
const {browser,page,errors}=await openHarness({width:1280,height:720});
try {
  const initial=await page.evaluate(()=>window.m0.state());
  const renderer=JSON.stringify(initial.render.gpu);
  if(/swiftshader|llvmpipe|software raster/i.test(renderer))throw new Error(`Software GPU is not a Mac hardware measurement: ${renderer}`);
  console.log(`Visible ${browser.version()} · ${renderer}. Warming up for 30 seconds.`);
  await page.evaluate(()=>window.m0.startTraversal());await page.waitForTimeout(30_000);
  const runs=[];
  for(let run=1;run<=3;run++){
    await page.evaluate(()=>{window.m0.startTraversal();window.m0.beginMeasurement();});
    console.log(`Run ${run}/3: 60-second traversal.`);
    // Short awaited intervals keep progress observable without changing the route.
    for(let part=0;part<4;part++)await page.waitForTimeout(15_000);
    const samples=await page.evaluate(()=>window.m0.endMeasurement());
    const state=await page.evaluate(()=>window.m0.state());
    const sorted=[...samples].sort((a,b)=>a-b);
    const percentile=p=>sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))];
    const result={run,frames:samples.length,elapsedMs:samples.reduce((a,b)=>a+b,0),medianMs:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),over33ms:samples.filter(x=>x>33.34).length,state};
    if(samples.length<100||state.paused||state.collisionCount||errors.length)throw new Error(`Invalid run: ${JSON.stringify(result)}`);
    runs.push(result);console.log(JSON.stringify({run,medianMs:result.medianMs,p95Ms:result.p95Ms,p99Ms:result.p99Ms}));
  }
  const backend=initial.render.backend||(initial.render.webGLVersion===2?'webgl2':'unknown');
  const name=`performance-${backend}.json`;
  await writeFile(new URL(name,out),JSON.stringify({date:new Date().toISOString(),backend,os:platform(),arch:arch(),ramBytes:totalmem(),browser:browser.version(),headed:true,viewport:{width:1280,height:720},warmupSeconds:30,runs,errors,note:'Actual requestAnimationFrame intervals in visible browser. Synthetic M0 scene only; not M1 performance or a Windows benchmark.'},null,2)+'\n');
  console.log(`Saved qa/evidence/${name}`);
} finally {await browser.close();}
