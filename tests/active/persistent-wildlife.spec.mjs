import {test,expect} from '@playwright/test';
import {fork} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
test.use({screenshot:'off'});
test('W2 persistent bird: same snapshot, new epoch after restart, same invitation, empty room stops ticking',async({browser})=>{
 test.setTimeout(180000);const directory=mkdtempSync(join(tmpdir(),'drevle-wildlife-')),pages=[],errors=[];let child;
 const start=async()=>{child=fork('tests/helpers/persistent-server.mjs',[directory,'wildlife'],{execArgv:['--experimental-strip-types'],stdio:['ignore','pipe','pipe','ipc']});const [m]=await once(child,'message',{signal:AbortSignal.timeout(30000)});return m.link;};
 const stop=async()=>{if(!child||child.exitCode!==null)return;const exit=once(child,'exit',{signal:AbortSignal.timeout(15000)});child.kill('SIGTERM');await exit;};
 const stats=async()=>{const message=once(child,'message',{signal:AbortSignal.timeout(5000)});child.send('stats');return (await message)[0].stats;};
 try{
  const link=await start();expect((await stats()).ticking).toBe(false);
  for(let i=0;i<2;i++){const p=await browser.newPage({viewport:{width:1280,height:720}});pages.push(p);p.on('pageerror',e=>errors.push(e.message));await p.goto(link,{waitUntil:'commit'});await p.waitForFunction(()=>window.m0?.state().ready,null,{timeout:90000});await p.locator('#resume').click();}
  const [a,b]=pages;for(const p of pages)await p.waitForFunction(()=>m0.state().multiplayer.players===2&&m0.wildlife.state().frame.entities.some(e=>e.siteId==='trail-bird-01'));
  const before=await a.evaluate(()=>m0.wildlife.state().frame);expect((await b.evaluate(()=>m0.wildlife.state().frame)).entities[0].id).toBe(before.entities[0].id);
  await b.evaluate(home=>{for(const radius of [2,3,4])for(let i=0;i<24;i++){try{m0.teleport(home.e+Math.cos(i*Math.PI/12)*radius,home.n+Math.sin(i*Math.PI/12)*radius);return;}catch{}}throw Error('No approach');},before.entities[0].point);
  for(const p of pages)await p.waitForFunction(()=>m0.wildlife.state().frame.eventWatermark===1);
  expect((await a.evaluate(()=>m0.wildlife.state().frame.entities.find(e=>e.siteId==='trail-bird-01').route))).toEqual(await b.evaluate(()=>m0.wildlife.state().frame.entities.find(e=>e.siteId==='trail-bird-01').route));
  let release;const gate=new Promise(r=>release=r);await b.route('**/runtime*.glb*',async r=>{if(r.request().resourceType()!=='script')await gate;await r.continue();});
  try{
   await b.reload({waitUntil:'commit'});await b.waitForFunction(()=>performance.getEntriesByName('room:connected-before-scene').length===1);
   expect((await stats()).wildlifeStats.readyPlayers).toBe(1);
  }finally{release();}
  await b.waitForFunction(()=>window.m0?.state().ready,null,{timeout:90000});await b.unroute('**/runtime*.glb*');await b.locator('#resume').click();
  await expect.poll(async()=>(await stats()).wildlifeStats.readyPlayers).toBe(2);
  await stop();for(const p of pages)await p.waitForFunction(()=>m0.state().multiplayer.phase==='reconnecting',null,{timeout:25000});
  expect(await start()).toBe(link);
  for(const p of pages)await p.waitForFunction(epoch=>m0.state().multiplayer.phase==='connected'&&m0.wildlife.state().frame.authorityEpoch!==epoch,before.authorityEpoch,{timeout:45000});
  const restarted=await a.evaluate(()=>m0.wildlife.state().frame);expect(new Set(restarted.entities.map(e=>e.id)).size).toBe(restarted.entities.length);expect(restarted.eventWatermark).toBe(0);
  for(const p of pages){await p.locator('#friends-details').evaluate(e=>e.open=true);await p.locator('#friends-leave').click();}
  await expect.poll(async()=>(await stats()).players).toBe(0);expect((await stats()).ticking).toBe(false);expect(errors).toEqual([]);
 }finally{for(const p of pages)await p.close();await stop();if(!resolve(directory).startsWith(resolve(tmpdir())+'\\drevle-wildlife-')&&!resolve(directory).startsWith(resolve(tmpdir())+'/drevle-wildlife-'))throw Error('Unexpected test directory');rmSync(directory,{recursive:true,force:true});}
});
