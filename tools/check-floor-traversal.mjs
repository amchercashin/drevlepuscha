import {openHarness} from './browser.mjs';
import {writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
process.env.HARNESS_URL='http://127.0.0.1:4176/?scene=m1';
const {browser,page,errors}=await openHarness({width:1600,height:900});
try{
 await page.waitForTimeout(2500);const backend=(await page.evaluate(()=>window.m0.state())).render.backend;
 await page.evaluate(()=>{window.m0.teleport(0,0);window.m0.setCamera(0,30,5);});await page.waitForTimeout(500);
 if(backend==='webgpu')await page.evaluate(()=>{
  const stream=document.querySelector('canvas').captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4000000});recorder.ondataavailable=e=>chunks.push(e.data);
  window.finishFloorVideo=()=>new Promise(resolve=>{recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));};recorder.stop();});recorder.start();
 });
 await page.keyboard.down('KeyW');await page.waitForTimeout(4500);await page.keyboard.up('KeyW');
 await page.evaluate(()=>window.m0.setCamera(-40,35,4));await page.waitForTimeout(1000);
 if(backend==='webgpu')await writeFile('qa/evidence/floor-art-walk.webm',Buffer.from(await page.evaluate(()=>window.finishFloorVideo())));
 await page.evaluate(()=>{window.m0.teleport(0,80);window.m0.setCamera(0,20,5.5);});await page.waitForTimeout(1200);
 await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');await page.waitForTimeout(3500);await page.keyboard.up('KeyW');await page.keyboard.up('ShiftLeft');
 const forward=await page.evaluate(()=>window.m0.state());assert.ok(forward.player.n>125);
 await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyS');await page.waitForTimeout(2000);await page.keyboard.up('KeyS');await page.keyboard.up('ShiftLeft');
 const reverse=await page.evaluate(()=>window.m0.state());assert.ok(reverse.player.n<forward.player.n-20);
 await page.evaluate(()=>window.m0.teleport(0,0));await page.waitForTimeout(1400);const returned=await page.evaluate(()=>window.m0.state());
 assert.deepEqual(errors,[]);assert.ok([forward,reverse,returned].every(s=>s.camera.followError<1e-5&&s.playerClear&&s.floor.cells<=49&&!s.paused));
 const path='qa/evidence/floor-art-comparison.json',report=JSON.parse(await readFile(path));report.traversal??={};report.traversal[backend]={errors,forward,reverse,returned};await writeFile(path,JSON.stringify(report,null,2));console.log(JSON.stringify({backend,errors,forwardN:forward.player.n,reverseN:reverse.player.n,returned:returned.floor}));
}finally{await browser.close();}
