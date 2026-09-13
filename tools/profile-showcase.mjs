import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const label=process.env.LABEL||'before',base=process.env.QA_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-backgrounding-occluded-windows']});
const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:3});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/GPUValidationError|WebGPU uncaptured error/.test(m.text()))errors.push(m.text());});
const cdp=await page.context().newCDPSession(page),report={label,scope:'Mac Chrome GPU, iPhone 13 landscape CSS viewport and DPR; not physical iPhone performance',runs:[],errors};
const stats=a=>{a=a.filter(Number.isFinite).sort((a,b)=>a-b);return {n:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)};};
try{
 await page.goto(base+'/?debug=1');await page.waitForFunction(()=>window.m0?.state().ready,null,{timeout:90000});
 await page.evaluate(()=>{m0.setPaused(false);m0.setAutomatic(false);m0.setTime(12);window.profile={active:false,parts:{},long:[],mutations:0};
  new PerformanceObserver(list=>{if(profile.active)profile.long.push(...list.getEntries().map(e=>e.duration));}).observe({type:'longtask',buffered:false});
  new MutationObserver(rows=>{if(profile.active)profile.mutations+=rows.length;}).observe(document.querySelector('#diagnostics'),{subtree:true,childList:true,attributes:true,characterData:true});
  const {scene,forest}=m0.inspect();
  for(const [object,key,name] of [[scene,'render','render'],[scene,'_animate','animate'],[scene,'_evaluateActiveMeshes','activeMeshes'],[forest,'update','forest']]){
   const original=object[key];if(!original)continue;object[key]=function(...args){const t=performance.now();const result=original.apply(this,args);if(profile.active)(profile.parts[name]??=[]).push(performance.now()-t);return result;};
  }
 });
 await page.waitForTimeout(12000);
 async function sample(name,{cpu=1,profileCPU=false}={}){
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});await page.waitForTimeout(2000);
  if(profileCPU){await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');}
  await page.evaluate(()=>{profile.parts={};profile.long=[];profile.mutations=0;profile.active=true;m0.beginMeasurement();});
  await page.waitForTimeout(8000);
  const data=await page.evaluate(()=>{profile.active=false;const {scene}=m0.inspect();return {frames:m0.endMeasurement(),costs:m0.frameCosts(),parts:profile.parts,long:profile.long,mutations:profile.mutations,state:m0.state(),resources:{meshes:scene.meshes.length,geometries:scene.geometries.length,textures:scene.textures.length,materials:scene.materials.length,animations:scene.animationGroups.length,heap:performance.memory?.usedJSHeapSize}};});
  if(profileCPU){const {profile:p}=await cdp.send('Profiler.stop');await writeFile(`/tmp/showcase-${label}-${name}.cpuprofile`,JSON.stringify(p));}
  const row={name,cpu,frames:stats(data.frames),cpuMs:stats(data.costs.map(c=>c.cpuMs)),gpuMs:stats(data.costs.map(c=>c.gpuMs)),parts:Object.fromEntries(Object.entries(data.parts).map(([k,v])=>[k,stats(v)])),longTasks:data.long,settingsMutations:data.mutations,resources:data.resources,render:data.state.render,forest:data.state.forest,floor:data.state.floor};
  report.runs.push(row);console.log(JSON.stringify(row));await writeFile(`/tmp/showcase-${label}.json`,JSON.stringify(report,null,2));
 }
 await sample('idle',{profileCPU:true});
 await page.evaluate(()=>m0.inspect().forest.setNearOnly(true));await sample('lod0');
 await page.evaluate(()=>m0.inspect().forest.setNearOnly(false));await sample('lod-restored');
 for(const rounds of [10,20]){
  for(let i=0;i<rounds;i++){await page.evaluate(()=>m0.inspect().forest.setNearOnly(true));await page.waitForTimeout(120);await page.evaluate(()=>m0.inspect().forest.setNearOnly(false));await page.waitForTimeout(120);}
  await cdp.send('HeapProfiler.collectGarbage');await sample('toggle-'+rounds);
 }
 await page.evaluate(()=>{const {scene,world}=m0.inspect();world.player.setEnabled(false);scene.animationGroups.forEach(g=>g.pause());});await sample('no-ranger');
 await page.evaluate(()=>{const {scene,world}=m0.inspect();world.player.setEnabled(true);scene.animationGroups.forEach(g=>g.play(true));scene.shadowsEnabled=false;});await sample('no-shadows');
 await page.evaluate(()=>{const {scene}=m0.inspect();scene.shadowsEnabled=true;scene.postProcessesEnabled=false;});await sample('no-air');
 await page.evaluate(()=>{const {scene}=m0.inspect();scene.postProcessesEnabled=true;m0.setFog(.04);});await sample('dense-fog');
 await page.evaluate(()=>m0.setFog(.011));await sample('cpu4',{cpu:4,profileCPU:true});
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
 await page.locator('#invite-friends').click();await sample('host-alone');
 await page.evaluate(()=>m0.startTraversal());await sample('walking',{profileCPU:true});
 console.log('DONE '+JSON.stringify(errors));
}finally{await browser.close();}
