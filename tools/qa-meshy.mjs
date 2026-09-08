/** Visible WebGPU walk of the selected tree; --compare includes the archived B route. */
import {writeFile,mkdir} from 'node:fs/promises';
import {totalmem,platform,arch} from 'node:os';
import {openHarness} from './browser.mjs';
const output='qa/evidence/meshy';await mkdir(output,{recursive:true});const results=[];
for(const route of (process.argv.includes('--compare')?['a','b']:['a'])){
 process.env.HARNESS_URL='http://127.0.0.1:4173/?scene=m1&tree=meshy-'+route;
 const {browser,page,errors}=await openHarness({width:1280,height:720});
 try{
  const initial=await page.evaluate(()=>window.m0.state());
  if(initial.render.backend!=='webgpu'||/swiftshader|llvmpipe|software raster/i.test(JSON.stringify(initial.render.gpu)))throw new Error('Hardware WebGPU required');
  console.log(route+': warm-up 30 s');await page.evaluate(()=>window.m0.startTraversal(0,0));await page.waitForTimeout(30000);
  await page.evaluate(()=>{window.m0.startTraversal(0,160);window.m0.beginMeasurement();});console.log(route+': measured walk 60 s');const states=[];
  for(let i=0;i<12;i++){await page.waitForTimeout(5000);const s=await page.evaluate(()=>window.m0.state());if(s.paused||!s.playerClear||s.camera.followError>1e-5)throw new Error('Interrupted or invalid measurement');states.push(s);}
  const samples=await page.evaluate(()=>window.m0.endMeasurement()),sorted=[...samples].sort((a,b)=>a-b),q=p=>sorted[Math.floor((sorted.length-1)*p)];
  if(samples.length<100||errors.length)throw new Error('Invalid samples or browser errors: '+errors);
  const result={route,asset:initial.forest.asset,gpu:initial.render.gpu,renderer:initial.render.backend,browser:browser.version(),trianglesPerLevel:initial.forest.trianglesPerLevel,materials:initial.forest.materialsPerTree,trees:initial.forest.trees,frames:samples.length,medianMs:q(.5),p95Ms:q(.95),p99Ms:q(.99),over33ms:samples.filter(t=>t>33.34).length,maxTriangles:Math.max(...states.map(s=>s.render.triangles)),maxDrawCalls:Math.max(...states.map(s=>s.render.drawCalls)),errors};results.push(result);console.log(JSON.stringify(result));
  await page.evaluate(()=>{window.m0.stopTraversal();window.m0.teleport(0,8);window.m0.setCamera(0,-20,5.5);});await page.waitForTimeout(500);await page.screenshot({path:output+'/'+route+'-forest.png'});
  // Check a full rotation under the crowns after, outside the timed pass.
  for(let yaw=0;yaw<360;yaw+=45){await page.evaluate(y=>window.m0.setCamera(y,-20,5.5),yaw);await page.waitForTimeout(150);if((await page.evaluate(()=>window.m0.state())).camera.followError>1e-5)throw new Error('Camera changed during rotation');}
 }finally{await browser.close();}
 await writeFile(output+'/performance.json',JSON.stringify({date:new Date().toISOString(),os:platform(),arch:arch(),ramBytes:totalmem(),viewport:{width:1280,height:720},warmupSeconds:30,walkSeconds:60,results,note:'One warm-up and one 60-second visible WebGPU walk per asset; not a thermal, high-resolution or Windows acceptance.'},null,2)+'\n');
}
