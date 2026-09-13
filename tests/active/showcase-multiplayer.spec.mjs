import {test,expect} from '@playwright/test';

test.use({screenshot:'off'});
// Real public MQTT/WebRTC; run explicitly, never a network-dependent CI prerequisite.
test('rangers share a six-person showcase, reconnect, and leave cleanly',async({page,browser})=>{
 test.setTimeout(240_000);
 const errors=[],extra=[];
 const observe=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(/GPUValidationError|WebGPU uncaptured error/.test(m.text()))errors.push(m.text());});};
 observe(page);
 try{
  await page.goto('/?debug=1');await page.waitForFunction(()=>window.m0?.state().ready,null,{timeout:90000});
  if(await page.locator('#pause').isVisible())await page.locator('#resume').click();
  expect((await page.evaluate(()=>m0.state())).ranger.model).toBe('meshy');
  expect(await page.locator('#diagnostics').getAttribute('open')).toBeNull();
  await expect(page.locator('#diagnostics .ground-trial-panel')).toBeHidden();
  await page.locator('#diagnostics > summary').click();
  await expect(page.getByRole('button',{name:'Глубина',exact:true})).toBeVisible();
  await page.locator('#diagnostics > summary').click();
  await page.locator('#invite-friends').click();
  const invite=await page.locator('#friends-link').inputValue();
  expect(new URL(invite).search).toBe('');
  console.log('PASS: default ranger, settings, invite');
  const guest=await browser.newPage({viewport:{width:1280,height:720}});extra.push(guest);observe(guest);
  const guestUrl=new URL(invite);guestUrl.search='?debug=1';
  await guest.goto(guestUrl.href);await guest.waitForFunction(()=>window.m0?.state().ready,null,{timeout:90000});
  if(await guest.locator('#pause').isVisible())await guest.locator('#resume').click();
  await page.waitForFunction(()=>m0.state().multiplayer.remotes.some(r=>r.ready),null,{timeout:45000});
  await guest.waitForFunction(()=>m0.state().multiplayer.remotes.some(r=>r.ready),null,{timeout:45000});
  const hostPos=await page.evaluate(()=>m0.state().player),guestPos=await guest.evaluate(()=>m0.state().player);
  expect(Math.hypot(hostPos.e-guestPos.e,hostPos.n-guestPos.n)).toBeLessThan(8);
  await guest.locator('#friends-details').evaluate(el=>el.open=false);
  await guest.locator('#world').focus();await guest.keyboard.down('KeyW');
  await page.waitForFunction(()=>m0.state().multiplayer.remotes[0].animation?.weights.Walk>.85,null,{timeout:12000});
  await guest.keyboard.down('ShiftLeft');
  await page.waitForFunction(()=>m0.state().multiplayer.remotes[0].animation?.weights.Run>.85,null,{timeout:12000});
  await guest.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await guest.keyboard.up('KeyW');await guest.keyboard.up('ShiftLeft');
  await page.waitForFunction(()=>m0.state().multiplayer.remotes[0].animation?.weights.Idle>.85);
  const local=await guest.evaluate(()=>m0.state().player),remote=await page.evaluate(()=>m0.state().multiplayer.remotes[0]);
  expect(Math.hypot(local.e-remote.e,local.n-remote.n)).toBeLessThan(.5);
  console.log('PASS: two scenes, nearby spawn, walking/running/idle synchronization');
  await guest.reload();await guest.waitForFunction(()=>window.m0?.state().ready&&m0.state().multiplayer.players===2,null,{timeout:90000});
  console.log('PASS: guest reload');
  // Four lightweight peers exercise capacity while two actual scenes render.
  const bots=[];
  for(let i=0;i<4;i++){
   const bot=await browser.newPage();extra.push(bot);bots.push(bot);observe(bot);
   await bot.goto(new URL('multiplayer.html',invite).href.split('#')[0]);
   await bot.evaluate(async invite=>{
    const {WalkRoom}=await import('/src/network/room.ts');const {parseInvitation}=await import('/src/network/protocol.ts');
    window.bot=new WalkRoom(parseInvitation(new URL(invite).hash),false,'Гость проверки',{capacity:6,appId:'drevlepuscha-showcase-v1'});
   },invite);
  }
  await page.waitForFunction(()=>m0.state().multiplayer.players===6&&m0.state().multiplayer.remotes.every(r=>r.ready),null,{timeout:45000});
  console.log('PASS: six participants');
  const assets=await page.evaluate(()=>{
   const {scene}=m0.inspect(),meshes=scene.meshes.filter(m=>m.skeleton&&m.getTotalVertices()>20000);
   return {rigs:meshes.length,skeletons:new Set(meshes.map(m=>m.skeleton)).size,materials:new Set(meshes.map(m=>m.material)).size,geometry:new Set(meshes.map(m=>m.geometry)).size,loads:performance.getEntriesByType('resource').filter(r=>/meshy.*\.glb/.test(r.name)&&r.initiatorType!=='script').length};
  });
  expect(assets).toEqual({rigs:6,skeletons:6,materials:1,geometry:1,loads:1});
  const seventh=await browser.newPage();extra.push(seventh);await seventh.goto(new URL('multiplayer.html',invite).href.split('#')[0]);
  await seventh.evaluate(async invite=>{const {WalkRoom}=await import('/src/network/room.ts');const {parseInvitation}=await import('/src/network/protocol.ts');window.bot=new WalkRoom(parseInvitation(new URL(invite).hash),false,'Лишний гость',{capacity:6,appId:'drevlepuscha-showcase-v1'});},invite);
  await seventh.waitForFunction(()=>window.bot.phase==='full',null,{timeout:45000});
  await bots[0].evaluate(()=>window.bot.leave());
  await page.waitForFunction(()=>m0.state().multiplayer.players===5&&m0.state().multiplayer.remotes.length===4);
  await expect(page.locator('.walker-name.mine')).toBeVisible();
  await page.locator('#friends-details').evaluate(el=>el.open=true);await page.locator('#friends-leave').click();
  await guest.waitForFunction(()=>m0.state().multiplayer.phase==='ended',null,{timeout:12000});
  await page.waitForFunction(()=>m0.state().multiplayer.remotes.length===0);
  expect((await page.evaluate(()=>m0.state())).errors).toEqual([]);expect(errors).toEqual([]);
 }catch(error){
  for(const p of [page,...extra])try{console.log('STATE',await p.evaluate(async()=>({state:window.m0?.state(),network:await window.m0?.networkReport(),text:document.querySelector('#pause-description')?.textContent,hidden:document.hidden,bot:window.bot?.phase})));}catch{}
  throw error;
 }finally{for(const p of extra)await p.close();}
});
