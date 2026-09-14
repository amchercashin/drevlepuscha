import {test,expect} from '@playwright/test';
import {fork} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

test.use({screenshot:'off',launchOptions:{args:['--disable-backgrounding-occluded-windows','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']}});
// Explicit integration check: uses real MQTT/ICE, not a CI network prerequisite.
test('persistent showcase and direct voice survive room lifecycle',async({browser})=>{
 test.setTimeout(240000);
 const directory=mkdtempSync(join(tmpdir(),'drevle-integration-')),pages=[],errors=[],cdps=[];
 let child;
 const start=async()=>{
  child=fork('tests/helpers/persistent-server.mjs',[directory],{execArgv:['--experimental-strip-types'],stdio:['ignore','pipe','pipe','ipc']});
  child.stderr.on('data',b=>{const s=b.toString();if(!s.includes('ExperimentalWarning'))console.log(s.trim());});
  const [message]=await once(child,'message',{signal:AbortSignal.timeout(30000)});return message.link;
 };
 const stop=async()=>{if(!child||child.exitCode!==null)return;const gone=once(child,'exit',{signal:AbortSignal.timeout(15000)});child.kill('SIGTERM');await gone;};
 const stats=async()=>{const next=once(child,'message',{signal:AbortSignal.timeout(5000)});child.send('stats');return (await next)[0];};
 const browserMetrics=async()=>Promise.all(cdps.map(async c=>Object.fromEntries((await c.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]))));
 const sample=async(label)=>{const a=await stats(),ca=await browserMetrics();await new Promise(r=>setTimeout(r,2000));const b=await stats(),cb=await browserMetrics();console.log(label,JSON.stringify({cpuPercent:+((b.cpu.user+b.cpu.system-a.cpu.user-a.cpu.system)/((b.uptime-a.uptime)*10000)).toFixed(2),rssMiB:+(b.stats.rss/1048576).toFixed(1),players:b.stats.players,ticking:b.stats.ticking,browserMainThreadPercent:cb.map((m,i)=>+(100*(m.TaskDuration-ca[i].TaskDuration)/(m.Timestamp-ca[i].Timestamp)).toFixed(1))}));return b;};
 const voiceButton=(p,name)=>p.getByRole('button',{name,exact:true});
 try{
  const link=await start();expect((await sample('SERVER_IDLE')).stats.ticking).toBe(false);
  const url=new URL(link);url.search='?debug=1';
  for(let i=0;i<2;i++){
   const p=await browser.newPage({viewport:{width:1280,height:720}});pages.push(p);const cdp=await p.context().newCDPSession(p);await cdp.send('Performance.enable');cdps.push(cdp);p.on('pageerror',e=>errors.push(e.message));
   await p.addInitScript(()=>{
    window.testConnections=[];window.testCaptures=[];window.denyMicrophone=false;
    const Base=RTCPeerConnection;window.RTCPeerConnection=class extends Base{constructor(c){super(c);window.testConnections.push(this);}};
    const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async c=>{if(window.denyMicrophone)throw new DOMException('Test denial','NotAllowedError');const stream=await capture(c);window.testCaptures.push(stream);return stream;};
   });
   await p.goto(url.href,{waitUntil:'commit'});await p.waitForFunction(()=>window.m0?.state().ready,null,{timeout:90000});
   expect(await p.evaluate(()=>performance.getEntriesByName('room:connected-before-scene').length)).toBe(1);
   await p.locator('#resume').click();
  }
  const [a,b]=pages;
  for(const p of pages)await p.waitForFunction(()=>m0.state().multiplayer.players===2&&m0.state().multiplayer.remotes[0]?.ready);
  expect(await a.evaluate(()=>m0.state().lighting.daylight.sharedClock)).toBe(true);
  const hours=await Promise.all(pages.map(p=>p.evaluate(()=>m0.state().lighting.daylight.hours)));
  expect(Math.abs(hours[0]-hours[1])).toBeLessThan(.05);
  await a.locator('#world').focus();const before=await a.evaluate(()=>m0.state().player);
  await a.keyboard.down('KeyW');await a.waitForTimeout(700);await a.keyboard.up('KeyW');
  const after=await a.evaluate(()=>m0.state().player);expect(Math.hypot(after.e-before.e,after.n-before.n)).toBeGreaterThan(.1);
  await b.waitForFunction(p=>{const r=m0.state().multiplayer.remotes[0];return r&&Math.hypot(r.e-p.e,r.n-p.n)<.5;},after);
  await sample('SERVER_TWO_PLAYERS');
  // Listening is opt-in and must not acquire the microphone.
  for(const p of pages){await voiceButton(p,'Подключить голос').click();expect(await p.evaluate(()=>testCaptures.length)).toBe(0);}
  await a.waitForFunction(()=>m0.state().multiplayer.voice.peers===1);
  await b.evaluate(()=>window.denyMicrophone=true);
  await voiceButton(b,'Включить микрофон').click();
  await expect(b.getByRole('region',{name:'Голосовой чат'})).toContainText(/микрофон|доступ/i);
  expect(await b.evaluate(()=>m0.state().multiplayer.phase)).toBe('connected');
  await b.evaluate(()=>window.denyMicrophone=false);
  for(const p of pages)await voiceButton(p,'Включить микрофон').click();
  for(const p of pages)await p.waitForFunction(()=>m0.state().multiplayer.voice.microphone&&m0.state().multiplayer.voice.streams===1);
  await a.waitForFunction(async()=>{for(const pc of testConnections){for(const r of (await pc.getStats()).values())if(r.type==='inbound-rtp'&&r.kind==='audio'&&r.bytesReceived>0)return true;}return false;});
  const mute=a.getByRole('button',{name:/^Заглушить /});await mute.click();
  expect(await a.evaluate(()=>m0.state().multiplayer.voice.muted.length)).toBe(1);
  await voiceButton(a,'Выключить микрофон').click();
  expect(await a.evaluate(()=>testCaptures.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
  await sample('SERVER_WITH_P2P_VOICE');
  // Restart changes the transport peer ID, retaining invitation and world time.
  await stop();
  for(const p of pages)await p.waitForFunction(()=>m0.state().multiplayer.phase==='reconnecting'&&!m0.state().multiplayer.voice.joined,null,{timeout:20000});
  expect(await b.evaluate(()=>testCaptures.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
  expect(await start()).toBe(link);
  for(const p of pages)await p.waitForFunction(()=>m0.state().multiplayer.phase==='connected'&&m0.state().multiplayer.players===2,null,{timeout:45000});
  for(const p of pages){await p.locator('#friends-details').evaluate(el=>el.open=true);await p.locator('#friends-leave').click();}
  await expect.poll(async()=>(await stats()).stats.players).toBe(0);
  expect((await stats()).stats.ticking).toBe(false);
  // Return to the same link after everybody has left.
  await a.goto(url.href,{waitUntil:'commit'});await a.waitForFunction(()=>window.m0?.state().ready&&m0.state().multiplayer.phase==='connected',null,{timeout:90000});
  expect((await a.evaluate(()=>m0.state())).errors).toEqual([]);expect(errors).toEqual([]);
  console.log('PASS: two scenes, movement, clock, voice, microphone cleanup, restart and empty-room rejoin');
 }catch(e){for(const p of pages)try{console.log('FAIL_STATE',await p.evaluate(()=>({ready:window.m0?.state().ready,multiplayer:window.m0?.state().multiplayer,entrance:document.querySelector('#connection-controls')?.getAttribute('data-phase'),text:document.querySelector('#pause-description')?.textContent})));}catch{}throw e;}finally{for(const p of pages)await p.close();await stop();rmSync(directory,{recursive:true,force:true});}
});
