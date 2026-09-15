import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test.use({screenshot:'off'});
test('frozen original probe connects independently of the showcase',async({page,browser})=>{
 test.setTimeout(60000);
 await page.addInitScript(()=>{
  const Base=RTCPeerConnection;window.rtcCount=0;
  window.RTCPeerConnection=class extends Base{constructor(config){super(config);window.rtcCount++;}};
 });
 await page.goto('/connection-baseline/multiplayer.html');
 await page.locator('#create').click();
 await expect(page.locator('#copy')).toBeEnabled({timeout:20000});
 expect(await page.evaluate(()=>window.rtcCount)).toBe(20);
 const invite=await page.locator('#invite').inputValue();
 expect(new URL(invite).pathname).toBe('/connection-baseline/multiplayer.html');
 const guest=await browser.newPage();
 try{
  await guest.goto(invite);
  await expect(page.locator('#count')).toHaveText('2 из 4',{timeout:45000});
  await expect(guest.locator('#count')).toHaveText('2 из 4');
  expect((await guest.evaluate(()=>networkProbeReport())).version).toBe(1);
  await page.locator('#leave').click();
  await expect(guest.locator('#dot')).toHaveAttribute('data-phase','ended');
 }finally{await guest.close();}
});

for(const persistent of [false,true])test(`failed ${persistent?'persistent':'browser'} entrance stays light, exports a report and can continue solo`,async({page})=>{
 test.setTimeout(90000);
 const errors=[],models=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{const url=new URL(r.url());if(/runtime.*\.glb$/.test(url.pathname)&&!url.searchParams.has('import'))models.push(r.url());});
 await page.clock.install();
 await page.routeWebSocket(/wss:\/\//,socket=>socket.close());
 const invite=new URLSearchParams(persistent?{persistent:'1',room:crypto.randomUUID(),server:'A'.repeat(87),key:crypto.randomUUID()}:{room:crypto.randomUUID(),host:crypto.randomUUID(),key:crypto.randomUUID()});
 await page.goto('/?debug=1#'+invite,{waitUntil:'commit'});
 await expect(page.locator('#connection-controls')).toBeVisible();
 expect(models).toEqual([]);expect(await page.evaluate(()=>!!window.m0)).toBe(false);
 await page.clock.fastForward(persistent?16000:41000);
 await expect(page.locator('#connection-retry')).toBeVisible();
 await expect(page.locator('#connection-solo')).toHaveText('Продолжить одному');
 if(persistent)await expect(page.locator('#pause-description')).toContainText('Сервисы подключения не отвечают');
 expect(models).toEqual([]);
 const downloaded=page.waitForEvent('download');
 await page.locator('#connection-report').click();
 const file=await downloaded,report=JSON.parse(await readFile(await file.path(),'utf8'));
 expect(report.scene).toBe('showcase-entrance');if(persistent)expect(report.persistent).toBe(true);else expect(report.role).toBe('guest');expect(report.phase).toBe('error');
 expect(JSON.stringify(report)).not.toContain(invite.get('key'));
 await page.locator('#connection-solo').click();
 await page.waitForFunction(()=>window.m0?.state().ready,null,{timeout:90000});
 expect(new URL(page.url()).hash).toBe('');
 expect((await page.evaluate(()=>m0.state())).multiplayer.phase).toBe('solo');
 expect(models.length).toBeGreaterThan(0);expect(errors).toEqual([]);
 await page.clock.resume();
 await page.locator('#resume').click();
 const before=await page.evaluate(()=>m0.state().player);
 await page.keyboard.down('KeyW');await page.waitForTimeout(300);await page.keyboard.up('KeyW');
 const after=await page.evaluate(()=>m0.state().player);
 expect(Math.hypot(after.e-before.e,after.n-before.n)).toBeGreaterThan(.1);
});
