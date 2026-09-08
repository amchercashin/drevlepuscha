import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {platform,arch,totalmem} from 'node:os';
import {openHarness} from './browser.mjs';
process.env.HARNESS_URL=process.env.HARNESS_URL||'http://127.0.0.1:4173/?scene=m1';
const {browser,page,errors}=await openHarness({width:1280,height:720});
try{
 const initial=await page.evaluate(()=>window.m0.state());if(!initial.forest)throw new Error('M1 scene required');
 if(/swiftshader|llvmpipe|software raster/i.test(JSON.stringify(initial.render.gpu)))throw new Error('Hardware renderer required');
 console.log(`M1 ${initial.render.backend}: warm-up 30 s`);
 await page.evaluate(()=>window.m0.startTraversal());await page.waitForTimeout(30000);
 const runs=[];
 for(const trial of (process.argv.includes('--orbit-only')?[{nearOnly:false,n:160,orbit:true}]:(process.argv.includes('--comparison')?[{nearOnly:false,n:160,orbit:false},{nearOnly:true,n:160,orbit:false}]:[{nearOnly:false,n:160,orbit:false}]))){
  const {nearOnly,n,orbit}=trial;
  await page.locator('#diagnostics').evaluate(e=>e.open=true);
  await page.getByLabel('Все деревья без LOD — сравнение нагрузки').setChecked(nearOnly);
  await page.evaluate(n=>window.m0.startTraversal(0,n),n);await page.waitForTimeout(1500);
  await page.evaluate(n=>{window.m0.startTraversal(0,n);window.m0.beginMeasurement();},n);
  if(orbit)await page.evaluate(()=>window.m0.stopTraversal());
  console.log(`60 s ${orbit?'360-degree canopy review':'walk beyond old map'}: ${nearOnly?'full detail':'automatic LOD'} from n=${n}`);
  const states=[];
  for(let i=0;i<12;i++){if(orbit)await page.evaluate(i=>window.m0.setCamera(i*30,-20,5.5),i);await page.waitForTimeout(5000);const s=await page.evaluate(()=>window.m0.state());if(s.paused||s.camera.followError>1e-5||!s.playerClear)throw new Error(`Interrupted or invalid route: ${JSON.stringify(s)}`);states.push(s);}
  const samples=await page.evaluate(()=>window.m0.endMeasurement()),sorted=[...samples].sort((a,b)=>a-b),q=p=>sorted[Math.floor((sorted.length-1)*p)];
  if(samples.length<100||errors.length)throw new Error(JSON.stringify(errors));
  const result={nearOnly,orbit,startN:n,frames:samples.length,elapsedMs:samples.reduce((a,b)=>a+b,0),medianMs:q(.5),p95Ms:q(.95),p99Ms:q(.99),over33ms:samples.filter(x=>x>33.34).length,maxTriangles:Math.max(...states.map(s=>s.render.triangles)),maxDrawCalls:Math.max(...states.map(s=>s.render.drawCalls)),states};
  runs.push(result);await mkdir('qa/evidence',{recursive:true});await writeFile(`qa/evidence/m1-progress-${initial.render.backend}.json`,JSON.stringify({runs},null,2)+'\n');console.log(JSON.stringify({...result,states:undefined}));
 }
 await mkdir('qa/evidence',{recursive:true});
 if(process.argv.includes('--orbit-only')){const previous=JSON.parse(await readFile(`qa/evidence/m1-performance-${initial.render.backend}.json`,'utf8'));runs.unshift(...previous.runs.filter(r=>!r.orbit));}
 await writeFile(`qa/evidence/m1-performance-${initial.render.backend}.json`,JSON.stringify({date:new Date().toISOString(),scene:initial.sceneVersion,backend:initial.render.backend,gpu:initial.render.gpu,trees:initial.forest.trees,os:platform(),arch:arch(),ramBytes:totalmem(),browser:browser.version(),viewport:{width:1280,height:720},warmupSeconds:30,runs,errors,note:'Preliminary 60-second runs in visible hardware Chrome. Full-scene frame intervals, not isolated GPU time. Not a 30-minute thermal/streaming acceptance or a Windows playtest.'},null,2)+'\n');
 await unlink(`qa/evidence/m1-progress-${initial.render.backend}.json`).catch(()=>{});
}finally{await browser.close();}
