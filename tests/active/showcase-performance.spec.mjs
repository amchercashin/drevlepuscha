import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';

test.use({viewport:{width:844,height:390},deviceScaleFactor:3,screenshot:'off'});
test('LOD resources stay bounded and hidden UI stays quiet',async({page})=>{
 test.setTimeout(200000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(/GPUValidationError|WebGPU uncaptured error/.test(m.text()))errors.push(m.text());});
 await page.goto('/?debug=1');await page.waitForFunction(()=>window.m0?.state().ready,null,{timeout:90000});
 await page.evaluate(()=>{m0.setPaused(false);m0.setAutomatic(false);m0.setTime(12);});
 await page.waitForFunction(()=>{const s=m0.state();return s.floor.pending===0&&s.floor.field.farPending===0&&s.floor.field.midPending===0&&s.forest.transitions===0;});
 await page.waitForTimeout(1000);
 const initial=await page.evaluate(()=>m0.state());
 await page.locator('#diagnostics').evaluate(el=>el.open=true);
 for(let i=0;i<10;i++){await page.locator('#near-only').check();await page.waitForTimeout(80);await page.locator('#near-only').uncheck();await page.waitForTimeout(80);}
 await page.waitForTimeout(1000);
 const restored=await page.evaluate(()=>m0.state());
 expect(restored.forest.transitions).toBe(0);expect(restored.render.meshes).toBe(initial.render.meshes);
 expect(restored.forest.geometryBuffers).toBe(initial.forest.geometryBuffers);
 expect(restored.forest.lodCounts).toEqual(initial.forest.lodCounts);
 await page.evaluate(()=>{m0.setAutomatic(true);document.querySelector('#diagnostics').open=false;});
 await page.waitForTimeout(300);
 await page.evaluate(()=>{window.hiddenMutations=0;window.observer=new MutationObserver(rows=>hiddenMutations+=rows.filter(r=>!(r.target instanceof Element?r.target:r.target.parentElement)?.closest('summary')).length);observer.observe(document.querySelector('#diagnostics'),{subtree:true,attributes:true,childList:true,characterData:true});});
 await page.waitForTimeout(1000);
 expect(await page.evaluate(()=>{observer.disconnect();return hiddenMutations;})).toBe(0);
 await page.evaluate(()=>{m0.setAutomatic(false);m0.setFog(0);});await page.waitForTimeout(200);
 expect(await page.evaluate(()=>m0.state().forest.horizon.fogHiddenCells)).toBe(0);
 await page.evaluate(()=>m0.setFog(.04));await page.waitForTimeout(200);
 expect(await page.evaluate(()=>m0.state().forest.horizon.fogHiddenCells)).toBeGreaterThan(initial.forest.horizon.fogHiddenCells);
 expect(await page.evaluate(()=>m0.state().render.drawCalls)).toBeLessThan(initial.render.drawCalls);
 await page.evaluate(()=>m0.setFog(.011));
 expect(errors).toEqual([]);
 console.log('PASS: bounded LOD resources, fog culling, no hidden settings mutations');
});

test('profile a party of one, two and six; export a real device report',async({page,browser})=>{
 test.setTimeout(200000);
 const errors=[],extra=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(/GPUValidationError|WebGPU uncaptured error/.test(m.text()))errors.push(m.text());});
 try{
 await page.goto('/?debug=1');await page.waitForFunction(()=>window.m0?.state().ready,null,{timeout:90000});
 await page.evaluate(()=>{m0.setPaused(false);m0.setAutomatic(false);m0.setTime(12);});
 const cdp=await page.context().newCDPSession(page),runs=[];
 async function measure(people){
  await page.waitForTimeout(1000);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
  await page.evaluate(()=>m0.beginMeasurement());await page.waitForTimeout(3000);
  const {profile}=await cdp.send('Profiler.stop');
  const data=await page.evaluate(()=>({frames:m0.endMeasurement(),costs:m0.frameCosts(),state:m0.state()}));
  runs.push({people,...data});await writeFile(`/tmp/showcase-party-${people}.cpuprofile`,JSON.stringify(profile));
 }
 await measure(1);
 await page.locator('#invite-friends').click();const invite=await page.locator('#friends-link').inputValue();
 let count=0;
 for(const target of [2,6]){
  for(;count<target-1;count++){
   // Each participant needs its own tab sessionStorage, just like real devices.
   const frame=await browser.newPage();extra.push(frame);
   await frame.goto(new URL('/multiplayer.html',page.url()).href);
   await frame.evaluate(async invite=>{
    const {WalkRoom}=await import('/src/network/room.ts'),{parseInvitation}=await import('/src/network/protocol.ts');
    window.bot=new WalkRoom(parseInvitation(new URL(invite).hash),false,'Профиль',{capacity:6,appId:'drevlepuscha-showcase-v1'});
    window.motion=setInterval(()=>{if(bot.phase==='connected'){const p=bot.localPlayer;bot.move(p.x,p.y,{heading:0,speed:1.85,running:false});}},100);
   },invite);
  }
  await page.bringToFront();
  await page.waitForFunction(n=>{const s=m0.state().multiplayer;return s.players===n&&s.remotes.length===n-1&&s.remotes.every(r=>r.ready);},target,{timeout:45000});
  await measure(target);
 }
 await writeFile('/tmp/showcase-party.json',JSON.stringify(runs,null,2));
 await page.locator('#diagnostics').evaluate(el=>el.open=true);await page.locator('#performance-report').click();
 await page.locator('#diagnostics').evaluate(el=>el.open=false);
 await page.keyboard.down('KeyW');await page.waitForTimeout(1500);await page.keyboard.up('KeyW');
 await expect(page.locator('#performance-report')).toHaveText('Скачать результат замера',{timeout:25000});
 await page.locator('#diagnostics').evaluate(el=>el.open=true);
 const downloaded=page.waitForEvent('download');await page.locator('#performance-report').click();
 const download=await downloaded,report=JSON.parse(await readFile(await download.path(),'utf8'));
 expect(report.fps).toBeGreaterThan(0);expect(report.frameMs.samples).toBeGreaterThan(100);
 expect(report.context.players).toBe(6);expect(report.context.render.backend).toBe('webgpu');
 expect(report.cpuSubmitMs.p50).toBeGreaterThan(0);expect(report.scope).toContain('Actual device');
 expect(report.context.ranger.model).toBe('meshy');expect(errors).toEqual([]);
 console.log('PASS: 1/2/6 players, device report');
 }finally{for(const p of extra)await p.close().catch(()=>{});}
});
