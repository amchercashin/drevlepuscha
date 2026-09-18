import {test,expect} from '@playwright/test';
test.use({screenshot:'off'});
test('W2 shared bird: early guest retained, remote threat outside host render range, atlas and late reload',async({page,browser})=>{
 test.setTimeout(180000);let guest;const lightweight=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('/?debug=1&wildlife=1');await page.waitForFunction(()=>window.m0?.state().ready);await page.locator('#resume').click();
  await page.waitForFunction(()=>m0.wildlife.state().frame.entities.length===1);
  const bird=await page.evaluate(()=>m0.wildlife.state().frame.entities[0]);
  await page.locator('#invite-friends').click();const link=await page.locator('#friends-link').inputValue();expect(new URL(link).searchParams.get('wildlife')).toBe('1');
  expect(await page.evaluate(()=>m0.wildlife.state().frame.entities[0].id)).toBe(bird.id);
  guest=await browser.newPage({viewport:{width:1280,height:720}});guest.on('pageerror',e=>errors.push(e.message));
  await guest.addInitScript(()=>{const Base=RTCPeerConnection;window.testConnections=[];window.RTCPeerConnection=class extends Base{constructor(c){super(c);window.testConnections.push(this);}};});
  let release;const gate=new Promise(r=>release=r);await guest.route('**/runtime*.glb*',async route=>{if(route.request().resourceType()!=='script')await gate;await route.continue();});
  await guest.goto(link,{waitUntil:'commit'});
  try{await page.waitForFunction(()=>m0.state().multiplayer.players===2,null,{timeout:45000});await guest.waitForFunction(()=>performance.getEntriesByName('room:connected-before-scene').length===1);await guest.waitForTimeout(11000);expect(await guest.evaluate(()=>!!window.m0?.state().ready)).toBe(false);expect(await guest.evaluate(()=>testConnections.filter(p=>p.connectionState==='connected').length)).toBe(1);}finally{release();}
  const rtc=await guest.evaluate(()=>testConnections.length);await guest.waitForFunction(()=>window.m0?.state().ready,null,{timeout:90000});expect(await guest.evaluate(()=>testConnections.length)).toBe(rtc);
  await guest.unroute('**/runtime*.glb*');await guest.locator('#resume').click();await guest.locator('#resolution-quality').selectOption('performance',{force:true});
  await page.evaluate(()=>{m0.teleport(10,40);m0.setPaused(true);});
  const before=await page.evaluate(()=>m0.wildlife.state().frame.simMs);await page.waitForTimeout(500);expect(await page.evaluate(()=>m0.wildlife.state().frame.simMs)).toBeGreaterThan(before);
  // Atlas returns before rendering in main.ts. The room owner must continue its decisions.
  await page.evaluate(()=>m0.setPaused(false));await page.locator('#world').focus();await page.keyboard.press('KeyM');
  await guest.evaluate(home=>{for(const radius of [2,3,4])for(let i=0;i<24;i++){try{m0.teleport(home.e+Math.cos(i*Math.PI/12)*radius,home.n+Math.sin(i*Math.PI/12)*radius);return;}catch{}}throw Error('No approach');},bird.point);
  await guest.waitForFunction(()=>['takeoff','flying'].includes(m0.wildlife.state().frame.entities[0]?.state),null,{timeout:15000});
  const a=await page.evaluate(()=>m0.wildlife.state()),b=await guest.evaluate(()=>m0.wildlife.state());expect(a.frame.entities[0].id).toBe(b.frame.entities[0].id);expect(a.frame.entities[0].route).toEqual(b.frame.entities[0].route);expect(a.frame.eventWatermark).toBe(1);expect(a.role).toBe('authority');expect(b.role).toBe('replica');
  const poses=await Promise.all([page,guest].map(p=>p.evaluate(()=>m0.state().player)));expect(Math.hypot(poses[0].e-poses[1].e,poses[0].n-poses[1].n)).toBeGreaterThan(120);
  // Exercise the existing six-slot room without pretending to profile six GPU devices.
  for(let i=0;i<5;i++){
   const client=await browser.newPage();lightweight.push(client);
   await client.route('**/wildlife-client?*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Wildlife test client</title>'}));
   await client.goto('/wildlife-client?debug=1&wildlife=1');
   await client.evaluate(async({hash,i})=>{
    const [{WalkRoom},{parseInvitation},{loadShowcaseWildlife}]=await Promise.all([import('/src/network/room.ts'),import('/src/network/protocol.ts'),import('/src/network/showcase-wildlife-data.ts')]);
    window.testRoom=new WalkRoom(parseInvitation(hash),false,`test-${i}`,{capacity:6,appId:'drevlepuscha-showcase-v1',wildlife:{data:await loadShowcaseWildlife()}});testRoom.wildlife.setSceneReady(true);
   },{hash:new URL(link).hash,i});
   await client.waitForFunction(i=>testRoom.phase===(i<4?'connected':'full'),i,{timeout:30000});
   if(i<4)expect(await client.evaluate(()=>testRoom.wildlife.latest().entities[0].id)).toBe(bird.id);
  }
  expect(await page.evaluate(()=>m0.state().multiplayer.players)).toBe(6);
  await guest.reload({waitUntil:'commit'});await guest.waitForFunction(()=>window.m0?.state().ready,null,{timeout:90000});const late=await guest.evaluate(()=>m0.wildlife.state());expect(late.frame.entities[0].id).toBe(bird.id);expect(late.frame.entities[0].route).toEqual(b.frame.entities[0].route);expect(late.deliveredEvents).toEqual([]);expect(late.frame.entities[0].state).not.toBe('takeoff');
  expect(errors).toEqual([]);
 }catch(error){console.log('WILDLIFE_HOST',await page.evaluate(async()=>({wildlife:m0.wildlife.state(),network:await m0.networkReport()})));if(guest)console.log('WILDLIFE_GUEST',await guest.evaluate(()=>({ready:!!window.m0?.state().ready,entrance:document.querySelector('#connection-controls')?.getAttribute('data-phase'),text:document.querySelector('#pause-description')?.textContent})));throw error;}finally{for(const client of lightweight){await client.evaluate(()=>testRoom?.leave()).catch(()=>{});await client.close();}await guest?.close();}
});
