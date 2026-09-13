// Integration check against real public signaling and real WebRTC. Not a CI dependency.
// Usage: node tools/check-multiplayer.mjs http://127.0.0.1:5178/multiplayer.html
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const base=process.argv[2];
if(!base)throw Error('Pass the running multiplayer.html URL');
const browser=await chromium.launch({channel:'chrome',headless:true});
const pageErrors=[];
const inspect=page=>page.evaluate(()=>window.networkProbeReport());
const waitCount=(page,n)=>page.waitForFunction(n=>document.querySelector('#count').textContent===`${n} из 4`,n,{timeout:45000});
try{
 const host=await browser.newPage({viewport:{width:1280,height:850}});
 host.on('pageerror',e=>pageErrors.push(e.message));
 host.on('console',m=>{if(m.text().startsWith('Network room handshake:'))console.log('host:',m.text());});
 await host.goto(base);await host.locator('#create').click();await host.waitForFunction(()=>!document.querySelector('#copy').disabled,{},{timeout:20000});
 const invite=await host.locator('#invite').inputValue();
 const guests=await Promise.all(Array.from({length:4},()=>browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true})));
 for(const page of guests){page.on('pageerror',e=>pageErrors.push(e.message));page.on('console',m=>{if(m.text().startsWith('Network room handshake:'))console.log('guest:',m.text());});}
 await Promise.all(guests.map(page=>page.goto(invite)));
 await waitCount(host,4);
 await Promise.all(guests.map(page=>page.waitForFunction(()=>['connected','full'].includes(document.querySelector('#dot').dataset.phase),{},{timeout:45000})));
 const states=await Promise.all(guests.map(inspect));
 assert.equal(states.filter(s=>s.phase==='connected').length,3);assert.equal(states.filter(s=>s.phase==='full').length,1);
 assert.equal((await inspect(host)).connections.length,3);
 const joined=guests.filter((_,i)=>states[i].phase==='connected'),denied=guests[states.findIndex(s=>s.phase==='full')];
 for(const page of joined){await waitCount(page,4);assert.equal((await inspect(page)).connections.length,1);}
 console.log('PASS: concurrent joins, 4-player limit, host/guest star topology');
 const hostId=await host.locator('.marker.mine').getAttribute('data-player-id');
 await host.locator('#field').click({position:{x:600,y:100}});
 await joined[0].waitForFunction(id=>parseFloat(document.querySelector(`[data-player-id="${id}"]`).style.left)>65,hostId,{timeout:12000});
 const guestId=await joined[0].locator('.marker.mine').getAttribute('data-player-id');
 const box=await joined[0].locator('#field').boundingBox();
 await joined[0].touchscreen.tap(box.x+box.width*.2,box.y+box.height*.25);
 await host.waitForFunction(id=>parseFloat(document.querySelector(`[data-player-id="${id}"]`).style.left)<30,guestId,{timeout:12000});
 assert.equal(await joined[0].evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 console.log('PASS: bidirectional movement, touch input, narrow layout');
 await joined[1].reload();await waitCount(joined[1],4);await waitCount(host,4);
 console.log('PASS: guest reload rejoins without an extra slot');
 await joined[2].locator('#leave').click();await waitCount(host,3);
 await denied.locator('#retry').click();await waitCount(denied,4);await waitCount(host,4);
 console.log('PASS: released slot and retry after full room');
 const report=await inspect(host);
 assert.ok(report.messagesSent>20);assert.ok(report.messagesReceived>5);assert.ok(report.connections.every(c=>c.state==='connected'&&c.route!=='unknown'));
 await host.locator('#leave').click();
 for(const page of [joined[0],joined[1],denied])await page.waitForFunction(()=>document.querySelector('#dot').dataset.phase==='ended',{},{timeout:10000});
 assert.deepEqual(pageErrors,[]);
 console.log('PASS: host closes room; no page errors');
 console.log(JSON.stringify({connections:report.connections,iceTypes:report.iceTypes,sent:report.messagesSent,received:report.messagesReceived,scope:'one Mac, browser contexts; not a cross-network test'}));
}catch(error){
 for(const context of browser.contexts())for(const page of context.pages()){
  try{const d=await inspect(page);console.error(JSON.stringify({phase:d.phase,players:d.players,events:d.events,connections:d.connections}));}catch{}
 }
 throw error;
}finally{await browser.close()}
