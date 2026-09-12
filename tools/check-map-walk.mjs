import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const out=process.env.OUT??'qa/evidence/map-walk';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-backgrounding-occluded-windows']}),page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],report={checks:[],errors};
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const state=()=>page.evaluate(()=>oldForest.state());
try{
 await page.goto((process.env.URL??'http://127.0.0.1:4283/')+'?scene=world&debug=1');
 await page.waitForFunction(()=>window.oldForest?.state().ready,{},{timeout:90000});await page.locator('#resume').click();
 const initial=await state();report.initial=initial;assert.equal(initial.render.backend,'webgpu','default backend');
 assert.equal(await page.evaluate(()=>oldForest.pois().length),21);
 await page.waitForFunction(()=>oldForest.inspect().world.floor.cells.size>=30,{},{timeout:45000});
 await page.screenshot({path:out+'/entrance.png'});
 await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');await page.waitForTimeout(8000);await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
 let s=await state();assert.ok(Math.hypot(s.player.e-initial.player.e,s.player.n-initial.player.n)>40,'walk through entry');assert.ok(s.camera.followError<.002);report.checks.push('walking, streaming, camera');
 report.pois=[];
 for(const id of ['root_secret','fern_bowl','hidden_saddle','high_bank','tom_house']){
  await page.evaluate(id=>oldForest.travel(id),id);
  await page.waitForFunction(()=>{const s=oldForest.state();return Math.hypot(s.player.e-s.world.origin.e,s.player.n-s.world.origin.n)<1024&&s.camera.followError<.002;});
  await page.waitForFunction(()=>{const w=oldForest.inspect().world;return w.data.pending.size===0&&w.floor.cells.size>=25&&!w.floor.inflight&&w.floor.queue.length===0;},{},{timeout:60000});
  s=await state();assert.ok(s.world.terrain.patches<=110);assert.ok(s.camera.followError<.002);assert.equal(s.world.failures,0);
  const floor=await page.evaluate(()=>{const {world}=oldForest.inspect();return {cells:world.floor.cells.size,failures:world.floor.failures,leaves:world.scene.getMaterialByName('floor-leaves')?.getActiveTextures().length};});assert.equal(floor.failures,0);assert.ok(floor.leaves>0);
  report.pois.push({id,state:s,floor});await page.screenshot({path:out+'/'+id+'.png'});console.log('PASS',id);
 }
 await page.evaluate(()=>worldDaylight.setTime(0));await page.waitForTimeout(300);await page.screenshot({path:out+'/night.png'});
 assert.ok(await page.evaluate(()=>oldForest.inspect().scene.getMaterialByName('floor-leaves').emissiveColor.r<.02));
 await page.evaluate(()=>worldDaylight.setTime(12));await page.keyboard.press('KeyM');await page.waitForTimeout(350);assert.equal((await state()).mapOpen,true);await page.screenshot({path:out+'/map.png'});await page.keyboard.press('KeyM');report.checks.push('five POIs, bounded foliage, night, map');
 await page.evaluate(()=>oldForest.beginMeasurement());await page.keyboard.down('KeyW');await page.waitForTimeout(4000);await page.keyboard.up('KeyW');report.measurement=await page.evaluate(()=>oldForest.endMeasurement());
 await page.goto('http://127.0.0.1:4283/?debug=1');await page.waitForFunction(()=>window.m0?.state().ready,{},{timeout:60000});await page.locator('#resume').click();await page.screenshot({path:out+'/showcase.png'});assert.equal(await page.evaluate(()=>m0.state().render.backend),'webgpu');assert.equal(await page.evaluate(()=>m0.state().sceneVersion),'ravine-showcase-v1');report.checks.push('showcase still launches');assert.deepEqual(errors,[]);report.status='passed';
}catch(e){report.failure=String(e);await page.screenshot({path:out+'/failure.png'});process.exitCode=1;console.error(e);}finally{writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
